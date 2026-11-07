-- ============================================================
-- Migração 008: correções do 2º teste de segurança (29/10/2026)
-- STATUS: PROPOSTO - ainda NÃO aplicado no banco. Rode no SQL Editor do Supabase
-- (Dashboard -> SQL Editor -> New query -> colar tudo -> Run). Idempotente.
-- Depois de aplicar, rode supabase/tests/security_tests.sql: todos os testes
-- devem dar ok = true. Detalhes de cada achado em docs/relatorio-seguranca.md.
-- IMPORTANTE (3º teste): a 009 redefine funções desta migração. Se rodar a
-- 008 de novo por algum motivo, rode a 009 logo depois.
-- ============================================================
-- Achados corrigidos aqui (numeração do relatório):
--  S-01 Phishing no chat: qualquer usuário criava conversa se dizendo
--       "anfitrião" de cabana alheia (ou "suporte") com qualquer hóspede.
--  S-02 Bloqueio de calendário: reservas sem pagamento de centenas de noites,
--       anos à frente, ou dezenas seguidas por uma única conta.
--  S-03 Buckets públicos aceitavam qualquer tipo/tamanho de arquivo (.html, .exe...).
--  S-04 Hóspede (sem ser anfitrião) publicava cabana e subia fotos de cabana.
--  S-05 Denúncia podia nascer "resolvida/assinada por admin"; admin assinava
--       resolução no nome de outro admin.
--  S-06 Campos de texto sem limite (mensagem/bio de 1 MB), preço negativo,
--       URLs não-HTTPS (javascript:, http:) em avatar e fotos.
--  S-07 Usuário trocava o próprio e-mail do perfil (o e-mail vem do Google).
--  S-08 "Excluir conta" nunca funcionou (RLS barrava o UPDATE de deleted_at).
--  S-09 create_notification (SECURITY DEFINER) sem search_path fixo;
--       set_own_role executável sem login.
--  S-10 Triggers de proteção tratavam "sem usuário" (auth.uid() nulo) como
--       acesso de administrador - um visitante anônimo passaria pelos
--       triggers no dia em que alguma policy liberasse escrita para anon.
-- ============================================================

-- ── 0. Quem está fazendo a requisição? ──────────────────────
-- Com o PostgREST, todo comando vindo do app roda com current_user =
-- 'anon' (sem login) ou 'authenticated' (logado). Funções SECURITY DEFINER
-- nossas (set_own_role, delete_my_account, triggers de contador...) rodam como
-- o dono do banco - e o SQL Editor / service_role também. Então "é requisição
-- do app?" = current_user é anon/authenticated. SECURITY INVOKER de propósito:
-- se fosse DEFINER, current_user aqui dentro seria sempre o dono.
CREATE OR REPLACE FUNCTION public.is_app_request()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT current_user IN ('anon', 'authenticated');
$$;

-- Os triggers de proteção passam a ser SECURITY INVOKER (precisam enxergar o
-- current_user real) e usam is_app_request() no lugar de "auth.uid() IS NULL".

-- ── S-10 / properties: dono não mexe em moderação/contadores ──
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
  END IF;

  RETURN NEW;
END;
$$;

-- ── S-02 / S-10 / bookings: preço no servidor + limites anti-bloqueio ──
-- Limites (ajuste aqui se o produto decidir outros valores):
--   no máximo 30 noites por reserva, check-in até 365 dias à frente e no
--   máximo 5 reservas futuras ativas por hóspede ao mesmo tempo.
CREATE OR REPLACE FUNCTION public.prepare_booking_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  c_max_noites     CONSTANT INTEGER := 30;
  c_max_antecedencia CONSTANT INTEGER := 365;
  c_max_ativas     CONSTANT INTEGER := 5;
  prop RECORD;
  v_nights INTEGER;
  v_ativas INTEGER;
BEGIN
  IF NOT public.is_app_request() THEN
    RETURN NEW; -- SQL Editor / service role / seed
  END IF;

  SELECT id, owner_id, price, status INTO prop FROM properties WHERE id = NEW.property_id;

  IF NOT FOUND OR prop.status::text <> 'ativo' THEN
    RAISE EXCEPTION 'Esta cabana não está disponível para reserva.';
  END IF;
  IF prop.owner_id = auth.uid() THEN
    RAISE EXCEPTION 'Você não pode reservar o seu próprio anúncio.';
  END IF;
  IF NEW.check_in < CURRENT_DATE THEN
    RAISE EXCEPTION 'A data de check-in não pode estar no passado.';
  END IF;
  IF NEW.check_in > CURRENT_DATE + c_max_antecedencia THEN
    RAISE EXCEPTION 'Reservas só podem ser feitas com até % dias de antecedência.', c_max_antecedencia;
  END IF;

  v_nights := NEW.check_out - NEW.check_in;
  IF v_nights < 1 THEN
    RAISE EXCEPTION 'O check-out precisa ser depois do check-in.';
  END IF;
  IF v_nights > c_max_noites THEN
    RAISE EXCEPTION 'Uma reserva pode ter no máximo % noites.', c_max_noites;
  END IF;

  SELECT count(*) INTO v_ativas FROM bookings
  WHERE guest_id = NEW.guest_id AND status = 'reservada' AND check_out >= CURRENT_DATE;
  IF v_ativas >= c_max_ativas THEN
    RAISE EXCEPTION 'Você já tem % reservas futuras ativas. Conclua ou cancele alguma antes de reservar outra.', c_max_ativas;
  END IF;

  -- Preço calculado aqui, nunca confiado ao cliente (taxa de serviço 10%, PIX -5%).
  NEW.status := 'reservada';
  NEW.cancelled_at := NULL;
  NEW.cancel_reason := NULL;
  NEW.pix_discount := (NEW.pay_method = 'pix');
  NEW.price_per_night := prop.price;
  NEW.total := ROUND(v_nights * prop.price * 1.10 * CASE WHEN NEW.pay_method = 'pix' THEN 0.95 ELSE 1 END, 2);

  RETURN NEW;
END;
$$;

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

  -- Fora um cancelamento (reservada -> cancelada), nada da reserva muda.
  IF OLD.status::text = 'reservada' AND NEW.status::text = 'cancelada' THEN
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

-- ── S-10 / messages e notifications: usuário só muda read_at / read ──
CREATE OR REPLACE FUNCTION public.protect_message_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_app_request() THEN
    RETURN NEW;
  END IF;
  NEW.content := OLD.content;
  NEW.sender_id := OLD.sender_id;
  NEW.conversation_id := OLD.conversation_id;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_notification_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_read BOOLEAN := NEW.read;
BEGIN
  IF NOT public.is_app_request() THEN
    RETURN NEW;
  END IF;
  NEW := OLD;
  NEW.read := v_read;
  RETURN NEW;
END;
$$;

-- ── S-07 / S-08 / profiles ──────────────────────────────────
-- E-mail vem do login (auth.users), created_at é histórico e deleted_at só
-- muda pela função delete_my_account(). A role continua protegida pelo
-- WITH CHECK da policy profiles_self_update + set_own_role() (migração 001).
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
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_fields ON profiles;
CREATE TRIGGER profiles_protect_fields
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_fields();

-- Excluir a própria conta. Antes o app fazia UPDATE deleted_at direto, mas a
-- linha nova (deleted_at preenchido) deixa de passar na policy de leitura
-- profiles_public_read (deleted_at IS NULL) e o Postgres recusa o UPDATE com
-- "new row violates row-level security policy" - o botão nunca funcionou.
-- Além de marcar deleted_at, apaga dados de contato (LGPD: minimização).
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'É preciso estar logado para excluir a conta.';
  END IF;
  UPDATE profiles
     SET deleted_at = NOW(), phone = NULL, bio = NULL, interests = '{}'
   WHERE id = auth.uid() AND deleted_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

-- ── S-01 / conversations: só o hóspede abre, e só com o dono real ──
-- Dono de uma cabana em qualquer status (o hóspede pode querer falar sobre
-- uma reserva antiga de cabana que hoje está inativa - a RLS de properties
-- esconderia a linha, por isso SECURITY DEFINER e devolve só o owner_id).
CREATE OR REPLACE FUNCTION public.property_owner(p_property_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT owner_id FROM public.properties WHERE id = p_property_id;
$$;

REVOKE ALL ON FUNCTION public.property_owner(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.property_owner(UUID) TO authenticated;

DROP POLICY IF EXISTS "conversations_participant_insert" ON conversations;
CREATE POLICY "conversations_participant_insert" ON conversations
  FOR INSERT WITH CHECK (
    guest_id = auth.uid()
    AND host_id <> auth.uid()
    AND (
      -- conversa sobre uma cabana: o "anfitrião" tem que ser o dono dela
      (property_id IS NOT NULL AND host_id = public.property_owner(property_id))
      -- conversa de suporte (sem cabana): o outro lado tem que ser admin
      OR (property_id IS NULL AND EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = host_id AND p.role = 'admin' AND p.deleted_at IS NULL))
    )
  );

-- ── S-04 / properties: só anfitrião (ou admin) publica ──────
DROP POLICY IF EXISTS "properties_owner_insert" ON properties;
CREATE POLICY "properties_owner_insert" ON properties
  FOR INSERT WITH CHECK (
    owner_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('anfitriao', 'admin') AND p.deleted_at IS NULL
    )
  );

-- ── S-05 / reports: denúncia nasce pendente; resolução assinada por quem resolveu ──
CREATE OR REPLACE FUNCTION public.protect_report_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_app_request() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status := 'pendente';
    NEW.resolved_by := NULL;
    NEW.resolved_at := NULL;
    NEW.resolution := NULL;
    NEW.created_at := NOW();
  ELSE
    -- Só admin chega aqui (policy reports_admin_update). O conteúdo da
    -- denúncia não muda; a assinatura da resolução é sempre de quem resolveu.
    NEW.reporter_id := OLD.reporter_id;
    NEW.property_id := OLD.property_id;
    NEW.reported_user_id := OLD.reported_user_id;
    NEW.reason := OLD.reason;
    NEW.details := OLD.details;
    NEW.created_at := OLD.created_at;
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status::text IN ('resolvido', 'arquivado') THEN
      NEW.resolved_by := auth.uid();
      NEW.resolved_at := NOW();
    ELSE
      NEW.resolved_by := OLD.resolved_by;
      NEW.resolved_at := OLD.resolved_at;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reports_protect_fields ON reports;
CREATE TRIGGER reports_protect_fields
  BEFORE INSERT OR UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION public.protect_report_fields();

-- ── S-06 / limites de tamanho e formato ─────────────────────
-- NOT VALID: vale para toda linha nova/alterada a partir de agora, sem
-- derrubar a migração se algum dado antigo já estiver fora do limite.
CREATE OR REPLACE FUNCTION public.urls_are_https(p_urls TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(bool_and(u ~ '^https://'), TRUE) FROM unnest(COALESCE(p_urls, '{}')) AS u;
$$;

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_campos_validos;
ALTER TABLE profiles ADD CONSTRAINT profiles_campos_validos CHECK (
  char_length(name) <= 100
  AND (bio IS NULL OR char_length(bio) <= 1000)
  AND (phone IS NULL OR char_length(phone) <= 30)
  AND (avatar_url IS NULL OR (avatar_url ~ '^https://' AND char_length(avatar_url) <= 1000))
  AND cardinality(COALESCE(interests, '{}')) <= 20
) NOT VALID;

ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_campos_validos;
ALTER TABLE properties ADD CONSTRAINT properties_campos_validos CHECK (
  price >= 0 AND price <= 100000
  AND char_length(title) BETWEEN 1 AND 120
  AND char_length(description) <= 5000
  AND char_length(location) <= 200
  AND cardinality(COALESCE(images, '{}')) <= 20
  AND public.urls_are_https(images)
  AND cardinality(COALESCE(amenities, '{}')) <= 40
) NOT VALID;

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_tamanho;
ALTER TABLE messages ADD CONSTRAINT messages_tamanho
  CHECK (char_length(btrim(content)) BETWEEN 1 AND 2000) NOT VALID;

ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_tamanho;
ALTER TABLE reviews ADD CONSTRAINT reviews_tamanho
  CHECK (char_length(comment) <= 1000) NOT VALID;

ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_tamanho;
ALTER TABLE reports ADD CONSTRAINT reports_tamanho CHECK (
  char_length(reason) BETWEEN 1 AND 200
  AND (details IS NULL OR char_length(details) <= 2000)
  AND (resolution IS NULL OR char_length(resolution) <= 2000)
) NOT VALID;

-- ── S-09 / funções SECURITY DEFINER ─────────────────────────
ALTER FUNCTION public.create_notification(UUID, notification_type, TEXT, TEXT, UUID, UUID, UUID)
  SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.set_own_role(user_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_own_role(user_role) TO authenticated;

-- ── S-03 / S-04 / Storage ───────────────────────────────────
-- Os dois buckets são públicos: sem limite, qualquer conta hospedava HTML,
-- scripts ou executáveis de graça no domínio do projeto. 'image/jpg' entra
-- na lista porque versões antigas do app mandavam esse content-type.
UPDATE storage.buckets
   SET file_size_limit = 5242880, -- 5 MB
       allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
 WHERE id IN ('avatars', 'properties');

DROP POLICY IF EXISTS "properties_owner_insert" ON storage.objects;
CREATE POLICY "properties_owner_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'properties'
    AND auth.uid()::text = (storage.foldername(name))[1]
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('anfitriao', 'admin') AND p.deleted_at IS NULL
    )
  );

-- ── Conferência pós-aplicação ───────────────────────────────
-- Rode supabase/tests/security_tests.sql - deve terminar com todas as linhas ok = true.
-- SELECT id, file_size_limit, allowed_mime_types FROM storage.buckets;          -- 5 MB e só imagens
-- SELECT tgname FROM pg_trigger WHERE tgname IN ('profiles_protect_fields', 'reports_protect_fields'); -- 2 linhas
