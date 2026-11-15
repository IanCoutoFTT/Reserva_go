-- ============================================================
-- Migração 019: reserva que exige pagamento, mas cuja cobrança nunca nasceu
-- ============================================================
--
-- Com o pagamento ligado, o app cria a reserva e logo depois pede a cobrança (Pix ou
-- cartão). Se esse segundo passo falha (servidor da Stripe fora do ar, erro de rede,
-- o hóspede fecha o app...), sobra uma reserva "Confirmada" sem nenhuma cobrança: o
-- rotina expire_pix_payments só olhava cobranças (payments), então ela nunca vencia.
--
-- Esta migração fecha essa brecha:
--  * bookings.payment_required: o app novo marca TRUE nas reservas que precisam ser pagas
--    (Pix ou cartão com o pagamento ligado). Reservas de APKs antigos, sem a tela de
--    pagamento, ficam FALSE e não são tocadas.
--  * Reserva com payment_required, ativa, sem cobrança e com mais de 30 minutos é
--    CANCELADA pela rotina do pg_cron (expire_pix_payments), liberando as datas, e o
--    hóspede é avisado. Aos 20 minutos ele recebe um lembrete (uma vez).
--  * No app, essa reserva aparece como "Aguardando pagamento", com o botão Pagar agora,
--    que cria a cobrança que faltava.
--  * Ninguém altera payment_required nem o controle do lembrete depois da criação.
--
-- Limite conhecido: quem cria a reserva pela API pode mandar payment_required = FALSE e
-- escapar desta regra. Cobrar de forma obrigatória exigiria criar a reserva no servidor
-- (fica como trabalho futuro e consta no documento).
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS payment_required BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS payment_reminder_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_bookings_unpaid ON public.bookings (created_at)
  WHERE payment_required AND status = 'reservada';

-- ── Proteção das colunas novas ──────────────────────────────
-- SECURITY INVOKER: precisa enxergar o papel de quem chama (como em is_app_request).
CREATE OR REPLACE FUNCTION public.protect_payment_columns()
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
    NEW.payment_reminder_sent_at := NULL; -- payment_required vem do app, na criação
  ELSE
    NEW.payment_required := OLD.payment_required;
    NEW.payment_reminder_sent_at := OLD.payment_reminder_sent_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_protect_payment_flags ON public.bookings;
CREATE TRIGGER bookings_protect_payment_flags
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.protect_payment_columns();

-- ── Lembrete: cobrança aberta (016) + reserva sem cobrança ───
CREATE OR REPLACE FUNCTION public.remind_pending_payments()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r       RECORD;
  v_count INTEGER := 0;
  v_mins  INTEGER;
BEGIN
  -- Cobrança criada e ainda aberta, vencendo em 10 minutos ou menos (como na migração 016).
  FOR r IN
    SELECT pay.id AS payment_id, pay.expires_at, b.id AS booking_id, b.guest_id, b.property_id,
           b.pay_method::text AS method, prop.title
      FROM public.payments pay
      JOIN public.bookings b ON b.id = pay.booking_id
      JOIN public.properties prop ON prop.id = b.property_id
     WHERE pay.status = 'aguardando'
       AND pay.reminder_sent_at IS NULL
       AND b.status::text = 'reservada'
       AND pay.expires_at > NOW()
       AND pay.expires_at <= NOW() + INTERVAL '10 minutes'
     FOR UPDATE OF pay
  LOOP
    v_mins := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (r.expires_at - NOW())) / 60.0))::INTEGER;
    UPDATE public.payments SET reminder_sent_at = NOW() WHERE id = r.payment_id;
    PERFORM public.create_notification(
      r.guest_id, 'reserva', '⏰ Falta pouco para pagar',
      'Faltam cerca de ' || v_mins || ' minutos para pagar '
        || CASE WHEN r.method = 'card' THEN 'no cartão' ELSE 'o Pix' END
        || ' a reserva em "' || r.title || '". Depois disso ela será cancelada.',
      r.property_id, r.booking_id
    );
    v_count := v_count + 1;
  END LOOP;

  -- Reserva que exige pagamento, mas cuja cobrança nunca foi criada: lembrete aos 20 minutos.
  FOR r IN
    SELECT b.id AS booking_id, b.guest_id, b.property_id, b.created_at, prop.title
      FROM public.bookings b
      JOIN public.properties prop ON prop.id = b.property_id
     WHERE b.payment_required
       AND b.status::text = 'reservada'
       AND b.payment_reminder_sent_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.payments pay WHERE pay.booking_id = b.id)
       AND b.created_at <= NOW() - INTERVAL '20 minutes'
       AND b.created_at > NOW() - INTERVAL '30 minutes'
     FOR UPDATE OF b
  LOOP
    v_mins := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (r.created_at + INTERVAL '30 minutes' - NOW())) / 60.0))::INTEGER;
    UPDATE public.bookings SET payment_reminder_sent_at = NOW() WHERE id = r.booking_id;
    PERFORM public.create_notification(
      r.guest_id, 'reserva', '⏰ Falta pouco para pagar',
      'Você ainda não pagou a reserva em "' || r.title || '". Abra Minhas Viagens e toque em Pagar agora: ela será cancelada em cerca de '
        || v_mins || ' minutos.',
      r.property_id, r.booking_id
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ── Expirar: cobranças vencidas (como na 016) + reservas sem cobrança ──
-- O nome continua expire_pix_payments para não quebrar o agendamento do pg_cron.
CREATE OR REPLACE FUNCTION public.expire_pix_payments()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r       RECORD;
  v_count INTEGER := 0;
  v_card  BOOLEAN;
BEGIN
  PERFORM public.remind_pending_payments();

  FOR r IN
    SELECT pay.id AS payment_id, b.id AS booking_id, b.guest_id, b.property_id, b.pay_method::text AS method, prop.title
      FROM public.payments pay
      JOIN public.bookings b ON b.id = pay.booking_id
      JOIN public.properties prop ON prop.id = b.property_id
     WHERE pay.status = 'aguardando' AND pay.expires_at < NOW()
     FOR UPDATE OF pay
  LOOP
    v_card := r.method = 'card';
    UPDATE public.payments SET status = 'expirado' WHERE id = r.payment_id;

    UPDATE public.bookings
       SET status = 'cancelada', cancelled_at = NOW(),
           cancel_reason = CASE WHEN v_card THEN 'Pagamento no cartão não concluído dentro do prazo' ELSE 'Pix não pago dentro do prazo' END
     WHERE id = r.booking_id AND status::text = 'reservada';

    PERFORM public.create_notification(
      r.guest_id, 'reserva',
      CASE WHEN v_card THEN 'Reserva cancelada: pagamento não concluído' ELSE 'Reserva cancelada: Pix não pago' END,
      CASE WHEN v_card
        THEN 'O prazo para pagar no cartão a reserva em "' || r.title || '" acabou e as datas foram liberadas.'
        ELSE 'O prazo para pagar o Pix da reserva em "' || r.title || '" acabou e as datas foram liberadas.'
      END,
      r.property_id, r.booking_id
    );
    v_count := v_count + 1;
  END LOOP;

  -- Reserva que exige pagamento, ativa, sem nenhuma cobrança e com mais de 30 minutos.
  FOR r IN
    SELECT b.id AS booking_id, b.guest_id, b.property_id, prop.title
      FROM public.bookings b
      JOIN public.properties prop ON prop.id = b.property_id
     WHERE b.payment_required
       AND b.status::text = 'reservada'
       AND b.created_at < NOW() - INTERVAL '30 minutes'
       AND NOT EXISTS (SELECT 1 FROM public.payments pay WHERE pay.booking_id = b.id)
     FOR UPDATE OF b
  LOOP
    UPDATE public.bookings
       SET status = 'cancelada', cancelled_at = NOW(), cancel_reason = 'Pagamento não realizado dentro do prazo'
     WHERE id = r.booking_id;

    PERFORM public.create_notification(
      r.guest_id, 'reserva', 'Reserva cancelada: pagamento não realizado',
      'O prazo para pagar a reserva em "' || r.title || '" acabou e as datas foram liberadas.',
      r.property_id, r.booking_id
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_payment_columns() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.remind_pending_payments() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_pix_payments() FROM PUBLIC, anon, authenticated;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.remind_pending_payments() TO service_role;
    GRANT EXECUTE ON FUNCTION public.expire_pix_payments() TO service_role;
  END IF;
END $$;

-- ── Conferência pós-aplicação (SQL Editor) ──────────────────
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'bookings' AND column_name IN ('payment_required','payment_reminder_sent_at');  -- 2 linhas
-- SELECT tgname FROM pg_trigger WHERE tgname = 'bookings_protect_payment_flags';                                                                      -- 1 linha
