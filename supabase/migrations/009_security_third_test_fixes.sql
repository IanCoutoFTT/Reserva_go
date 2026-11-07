-- ============================================================
-- Migração 009: correções do 3º teste de segurança (29/10/2026)
-- STATUS: PROPOSTO - ainda NÃO aplicado no banco. Aplicar DEPOIS da 008.
-- Rode no SQL Editor do Supabase (New query -> colar tudo -> Run). Idempotente.
-- Depois rode supabase/tests/security_tests.sql: todas as linhas com ok = true.
-- Detalhes de cada achado em docs/relatorio-seguranca.md (seção do 3º teste).
-- ============================================================
--  T-01 Conta excluída continuava usando a API (reservar, mandar mensagem,
--       denunciar, favoritar, subir arquivo, trocar de role) com o token que
--       já tinha - "excluir conta" só escondia o perfil.
--  T-02 Cabanas de anfitrião que excluiu a conta continuavam no ar e
--       reserváveis; reservas futuras de quem excluiu a conta seguiam
--       bloqueando o calendário.
--  T-03 Anfitrião trocava título/descrição/fotos de cabana já aprovada e o
--       conteúdo novo ia ao ar sem passar pela moderação.
--  T-04 Usuário comum podia se chamar "Suporte ReservaGO"/"Admin" (golpe no chat).
--  T-05 Hóspede cancelava estadia já iniciada/concluída (apaga histórico e o
--       contador de reservas do anfitrião).
-- ============================================================

-- ── T-01: "a conta ainda está ativa?" ───────────────────────
-- SECURITY DEFINER porque a RLS de profiles esconde justamente as linhas
-- excluídas; devolve só um booleano.
CREATE OR REPLACE FUNCTION public.is_active_user(p_user UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_user IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_user AND deleted_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION public.is_active_user(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_user(UUID) TO anon, authenticated;

-- Policies RESTRICTIVE somam (AND) com as que já existem: em vez de reescrever
-- cada policy, uma regra única "só conta ativa escreve" por tabela.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['bookings', 'messages', 'conversations', 'reports', 'favorites', 'reviews', 'properties'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "conta_ativa_insert" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "conta_ativa_insert" ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.is_active_user())', t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY['profiles', 'properties', 'messages'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "conta_ativa_update" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "conta_ativa_update" ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.is_active_user()) WITH CHECK (public.is_active_user())', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "conta_ativa_insert" ON storage.objects;
CREATE POLICY "conta_ativa_insert" ON storage.objects AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (public.is_active_user());
DROP POLICY IF EXISTS "conta_ativa_update" ON storage.objects;
CREATE POLICY "conta_ativa_update" ON storage.objects AS RESTRICTIVE
  FOR UPDATE TO authenticated USING (public.is_active_user()) WITH CHECK (public.is_active_user());

-- set_own_role é SECURITY DEFINER (ignora RLS): a checagem vai dentro dela.
CREATE OR REPLACE FUNCTION public.set_own_role(new_role user_role)
RETURNS profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated profiles;
BEGIN
  IF new_role = 'admin' THEN
    RAISE EXCEPTION 'Não é permitido definir a própria role como admin';
  END IF;
  IF NOT public.is_active_user() THEN
    RAISE EXCEPTION 'Conta inexistente ou excluída.';
  END IF;
  UPDATE profiles SET role = new_role WHERE id = auth.uid()
  RETURNING * INTO updated;
  RETURN updated;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_own_role(user_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_own_role(user_role) TO authenticated;

-- ── T-02: cabana só aparece se o dono ainda existe ──────────
DROP POLICY IF EXISTS "properties_public_read" ON properties;
CREATE POLICY "properties_public_read" ON properties
  FOR SELECT USING (status = 'ativo' AND public.is_active_user(owner_id));
-- (prepare_booking_insert é SECURITY INVOKER e lê a cabana com essa RLS: se o
-- dono excluiu a conta, a cabana "não existe" e a reserva é recusada.)

-- Excluir conta agora também: cancela as reservas futuras do próprio usuário
-- (libera o calendário) e tira do ar as cabanas dele.
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'É preciso estar logado para excluir a conta.';
  END IF;

  UPDATE bookings
     SET status = 'cancelada', cancelled_at = NOW(), cancel_reason = 'Conta do hóspede excluída'
   WHERE guest_id = v_uid AND status = 'reservada' AND check_in >= CURRENT_DATE;

  UPDATE properties
     SET status = 'removido'
   WHERE owner_id = v_uid AND status IN ('ativo', 'pendente', 'suspenso');

  UPDATE profiles
     SET deleted_at = NOW(), phone = NULL, bio = NULL, interests = '{}'
   WHERE id = v_uid AND deleted_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

-- ── T-03: editar conteúdo de cabana aprovada volta para análise ──
-- Mudanças de texto/fotos (o que o hóspede lê) exigem nova aprovação.
-- Preço, categoria e nível de isolamento são valores fechados: não exigem.
CREATE OR REPLACE FUNCTION public.protect_property_moderation_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_app_request() OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status := 'pendente';
    NEW.featured := FALSE;
    NEW.rating := 0;
    NEW.reviews_count := 0;
    NEW.bookings_count := 0;
  ELSE
    -- O dono só pode mudar o status para 'removido' (excluir o próprio anúncio).
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status::text <> 'removido' THEN
      NEW.status := OLD.status;
    END IF;
    NEW.owner_id := OLD.owner_id;
    NEW.featured := OLD.featured;
    NEW.rating := OLD.rating;
    NEW.reviews_count := OLD.reviews_count;
    NEW.bookings_count := OLD.bookings_count;
    NEW.created_at := OLD.created_at;

    IF OLD.status::text = 'ativo' AND NEW.status::text = 'ativo' AND (
         NEW.title       IS DISTINCT FROM OLD.title
      OR NEW.description IS DISTINCT FROM OLD.description
      OR NEW.location    IS DISTINCT FROM OLD.location
      OR NEW.images      IS DISTINCT FROM OLD.images
      OR NEW.amenities   IS DISTINCT FROM OLD.amenities
    ) THEN
      NEW.status := 'pendente';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ── T-04: nome de perfil se passando pela equipe ────────────
CREATE OR REPLACE FUNCTION public.is_reserved_display_name(p_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(COALESCE(p_name, '')) ~ '(reserva\s*go|suporte|\madmin|\mmoderador|\mequipe\s+reserva)';
$$;

CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_app_request() THEN
    RETURN NEW;
  END IF;
  NEW.id := OLD.id;
  NEW.email := OLD.email;
  NEW.created_at := OLD.created_at;
  NEW.deleted_at := OLD.deleted_at;

  IF NEW.name IS DISTINCT FROM OLD.name
     AND public.is_reserved_display_name(NEW.name)
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Esse nome é reservado à equipe do ReservaGO. Escolha outro.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- ── T-05: só cancela antes do check-in ──────────────────────
CREATE OR REPLACE FUNCTION public.protect_booking_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_app_request() OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- Fora um cancelamento (reservada -> cancelada) até o dia do check-in, nada muda.
  IF OLD.status::text = 'reservada' AND NEW.status::text = 'cancelada' THEN
    IF OLD.check_in < CURRENT_DATE THEN
      RAISE EXCEPTION 'Não é possível cancelar uma estadia que já começou.'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.cancelled_at := NOW();
    NEW.cancel_reason := LEFT(NEW.cancel_reason, 500);
  ELSE
    NEW.status := OLD.status;
    NEW.cancelled_at := OLD.cancelled_at;
    NEW.cancel_reason := OLD.cancel_reason;
  END IF;

  NEW.property_id := OLD.property_id;
  NEW.guest_id := OLD.guest_id;
  NEW.check_in := OLD.check_in;
  NEW.check_out := OLD.check_out;
  NEW.pay_method := OLD.pay_method;
  NEW.price_per_night := OLD.price_per_night;
  NEW.total := OLD.total;
  NEW.pix_discount := OLD.pix_discount;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$$;

-- ── Conferência pós-aplicação ───────────────────────────────
-- SELECT tablename, policyname FROM pg_policies WHERE policyname LIKE 'conta_ativa_%'; -- 12 linhas
-- Rode supabase/tests/security_tests.sql: todas as linhas com ok = true.
