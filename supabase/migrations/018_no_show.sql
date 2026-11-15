-- ============================================================
-- Migração 018: não comparecimento (no-show)
-- ============================================================
--
-- Quando o hóspede reserva e não aparece, hoje a reserva segue como "realizada" depois
-- do check-out e ele ainda poderia avaliar uma estadia que não fez. Esta migração dá ao
-- anfitrião o jeito de registrar o não comparecimento:
--
--  * bookings.no_show_at / no_show_by: quando e por quem foi marcado. A situação
--    "reservada" não muda (evita mexer no tipo booking_status e em tudo que o lê); o
--    app trata no_show_at preenchido como "Não compareceu".
--  * mark_no_show(reserva): só o DONO da cabana (ou um admin) marca, e só depois do dia
--    do check-in, em reserva ativa, que não tenha avaliação. Avisa o hóspede e, se o
--    pagamento já foi feito, os admins (para acompanhar eventual contestação).
--  * clear_no_show(reserva): desfaz uma marcação feita por engano. O dono tem 48 horas;
--    o admin, a qualquer momento. Avisa o hóspede.
--  * Quem teve não comparecimento NÃO pode avaliar a cabana (política de reviews).
--  * Ninguém, pelo app, escreve em no_show_at direto: só pelas funções acima.
--
-- O pagamento fica como está: não há reembolso automático (Termos de Serviço).
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS no_show_at TIMESTAMPTZ;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS no_show_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ── Ninguém grava no_show_* direto pelo app ─────────────────
-- SECURITY INVOKER de propósito: precisa enxergar o papel de quem chama. As funções abaixo
-- são SECURITY DEFINER (rodam como dono) e por isso passam por aqui sem serem barradas.
CREATE OR REPLACE FUNCTION public.protect_no_show_columns()
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
    NEW.no_show_at := NULL;
    NEW.no_show_by := NULL;
  ELSE
    NEW.no_show_at := OLD.no_show_at;
    NEW.no_show_by := OLD.no_show_by;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_protect_no_show ON public.bookings;
CREATE TRIGGER bookings_protect_no_show
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.protect_no_show_columns();

-- ── Marcar o não comparecimento ─────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_no_show(p_booking_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  b        public.bookings%ROWTYPE;
  prop     public.properties%ROWTYPE;
  v_paid   BOOLEAN;
  v_admin  UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'É preciso estar logado.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reserva não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO prop FROM public.properties WHERE id = b.property_id;

  -- Só o dono da cabana ou um admin (mesma resposta para quem é de fora: não revela a reserva).
  IF prop.owner_id IS DISTINCT FROM v_uid AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Reserva não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  IF b.status::text <> 'reservada' THEN
    RAISE EXCEPTION 'Só uma reserva ativa pode ser marcada como não comparecimento.' USING ERRCODE = 'check_violation';
  END IF;
  IF b.no_show_at IS NOT NULL THEN
    RAISE EXCEPTION 'Essa reserva já foi marcada como não comparecimento.' USING ERRCODE = 'check_violation';
  END IF;
  IF CURRENT_DATE <= b.check_in THEN
    RAISE EXCEPTION 'Só dá para marcar o não comparecimento depois do dia do check-in.' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.reviews r WHERE r.booking_id = b.id) THEN
    RAISE EXCEPTION 'O hóspede já avaliou essa estadia, então ela aconteceu.' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.bookings SET no_show_at = NOW(), no_show_by = v_uid WHERE id = b.id;

  PERFORM public.create_notification(
    b.guest_id, 'reserva', 'Reserva marcada como não comparecimento',
    'O anfitrião de "' || prop.title || '" registrou que você não compareceu à reserva de '
      || TO_CHAR(b.check_in, 'DD/MM') || ' a ' || TO_CHAR(b.check_out, 'DD/MM')
      || '. Se foi um engano, fale com o anfitrião ou com a equipe.',
    prop.id, b.id
  );

  -- Pagamento já feito: os admins acompanham, caso o hóspede conteste.
  SELECT EXISTS (SELECT 1 FROM public.payments p WHERE p.booking_id = b.id AND p.status = 'pago') INTO v_paid;
  IF v_paid THEN
    FOR v_admin IN SELECT id FROM public.profiles WHERE role = 'admin' AND deleted_at IS NULL LOOP
      PERFORM public.create_notification(
        v_admin, 'aviso', '⚠️ Reserva paga marcada como não comparecimento',
        'A reserva paga em "' || prop.title || '" foi marcada como não comparecimento. O pagamento não é devolvido automaticamente.',
        prop.id, b.id
      );
    END LOOP;
  END IF;
END;
$$;

-- ── Desfazer (marcação por engano) ──────────────────────────
CREATE OR REPLACE FUNCTION public.clear_no_show(p_booking_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  UUID := auth.uid();
  b      public.bookings%ROWTYPE;
  prop   public.properties%ROWTYPE;
  v_adm  BOOLEAN := public.is_admin();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'É preciso estar logado.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reserva não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO prop FROM public.properties WHERE id = b.property_id;

  IF prop.owner_id IS DISTINCT FROM v_uid AND NOT v_adm THEN
    RAISE EXCEPTION 'Reserva não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  IF b.no_show_at IS NULL THEN
    RAISE EXCEPTION 'Essa reserva não está marcada como não comparecimento.' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT v_adm AND b.no_show_at < NOW() - INTERVAL '48 hours' THEN
    RAISE EXCEPTION 'O prazo de 48 horas para desfazer acabou. Fale com a equipe.' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.bookings SET no_show_at = NULL, no_show_by = NULL WHERE id = b.id;

  PERFORM public.create_notification(
    b.guest_id, 'reserva', 'Não comparecimento desfeito',
    'A marcação de não comparecimento da sua reserva em "' || prop.title || '" foi desfeita.',
    prop.id, b.id
  );
END;
$$;

-- ── Quem teve não comparecimento não avalia ─────────────────
-- Mesma regra da migração 006 (reserva própria, da cabana, não cancelada, já encerrada) mais
-- "sem não comparecimento".
DROP POLICY IF EXISTS "reviews_guest_insert" ON reviews;
CREATE POLICY "reviews_guest_insert" ON reviews
  FOR INSERT WITH CHECK (
    author_id = auth.uid()
    AND booking_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.id = booking_id
        AND b.guest_id = auth.uid()
        AND b.property_id = reviews.property_id
        AND b.status::text <> 'cancelada'
        AND b.no_show_at IS NULL
        AND b.check_out <= CURRENT_DATE
    )
  );

REVOKE ALL ON FUNCTION public.mark_no_show(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.clear_no_show(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_no_show(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_no_show(UUID) TO authenticated;

-- ── Conferência pós-aplicação (SQL Editor) ──────────────────
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'bookings' AND column_name IN ('no_show_at','no_show_by');  -- 2 linhas
-- SELECT proname FROM pg_proc WHERE proname IN ('mark_no_show','clear_no_show');                                                    -- 2 linhas
-- SELECT tgname FROM pg_trigger WHERE tgname = 'bookings_protect_no_show';                                                          -- 1 linha
