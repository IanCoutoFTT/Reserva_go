-- ============================================================
-- Migração 016: avisos de pagamento pendente (Pix e cartão)
-- ============================================================
--
-- Hoje, se o hóspede reserva e toca em "Pagar depois", NADA o avisa de que a reserva
-- será cancelada em 30 minutos: a única notificação chega DEPOIS do cancelamento.
-- Esta migração acrescenta dois avisos, só para o hóspede:
--
--  1. Ao nascer a cobrança (ou nascer de novo, depois de vencida): "Reserva aguardando
--     pagamento. Pague em até N minutos ou ela será cancelada".
--  2. Um lembrete quando faltarem 10 minutos ou menos: "Falta pouco...". Enviado UMA
--     vez por cobrança (payments.reminder_sent_at).
--
-- O lembrete roda dentro de expire_pix_payments(), que o pg_cron já executa a cada 5
-- minutos (docs/pagamento-pix.md): não é preciso agendar nada novo. Por isso o lembrete
-- chega entre 5 e 10 minutos antes do vencimento.
--
-- São notificações dentro do app (tabela notifications, como as demais). Aviso no
-- celular com o app fechado exigiria notificação push, que o app ainda não tem.
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

-- ── 1. Reabrir a cobrança (vencida -> aguardando) zera o lembrete ──
CREATE OR REPLACE FUNCTION public.payments_reset_reminder()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'aguardando' AND OLD.status IS DISTINCT FROM 'aguardando' THEN
    NEW.reminder_sent_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payments_reset_reminder ON public.payments;
CREATE TRIGGER payments_reset_reminder
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.payments_reset_reminder();

-- ── 2. Aviso ao nascer a cobrança ───────────────────────────
CREATE OR REPLACE FUNCTION public.notify_payment_pending()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b        public.bookings%ROWTYPE;
  v_title  TEXT;
  v_mins   INTEGER;
  v_how    TEXT;
BEGIN
  IF NEW.status <> 'aguardando' THEN
    RETURN NEW;
  END IF;
  -- Só quando a cobrança NASCE (INSERT) ou volta a aguardar depois de vencida (UPDATE).
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM 'aguardando' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO b FROM public.bookings WHERE id = NEW.booking_id;
  SELECT title INTO v_title FROM public.properties WHERE id = b.property_id;
  v_mins := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (NEW.expires_at - NOW())) / 60.0))::INTEGER;
  v_how := CASE WHEN b.pay_method::text = 'card' THEN 'no cartão' ELSE 'o Pix' END;

  PERFORM public.create_notification(
    b.guest_id, 'reserva', '⏳ Reserva aguardando pagamento',
    CASE WHEN b.pay_method::text = 'card'
      THEN 'Pague no cartão a reserva em "' || v_title || '" em até ' || v_mins
           || ' minutos. Se não pagar, ela será cancelada e as datas liberadas.'
      ELSE 'Pague o Pix da reserva em "' || v_title || '" em até ' || v_mins
           || ' minutos. Se não pagar, ela será cancelada e as datas liberadas.'
    END,
    b.property_id, b.id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payments_notify_pending ON public.payments;
CREATE TRIGGER payments_notify_pending
  AFTER INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.notify_payment_pending();

-- ── 3. Lembrete: faltam 10 minutos ou menos ─────────────────
-- Devolve quantos lembretes enviou. Só service_role (e expire_pix_payments, que a chama).
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
  RETURN v_count;
END;
$$;

-- ── 4. expire_pix_payments: manda os lembretes e depois expira (como na 015) ──
-- O nome continua o mesmo para não quebrar o agendamento do pg_cron.
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
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_payment_pending() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.payments_reset_reminder() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.remind_pending_payments() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_pix_payments() FROM PUBLIC, anon, authenticated;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.remind_pending_payments() TO service_role;
    GRANT EXECUTE ON FUNCTION public.expire_pix_payments() TO service_role;
  END IF;
END $$;

-- ── Conferência pós-aplicação (SQL Editor) ──────────────────
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'reminder_sent_at';   -- 1 linha
-- SELECT tgname FROM pg_trigger WHERE tgname IN ('payments_notify_pending','payments_reset_reminder');                    -- 2 linhas
-- SELECT proname FROM pg_proc WHERE proname IN ('remind_pending_payments','notify_payment_pending');                       -- 2 linhas
