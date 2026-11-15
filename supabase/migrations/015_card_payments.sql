-- ============================================================
-- Migração 015: pagamento por cartão de crédito (Stripe, modo de teste)
-- ============================================================
--
-- A tabela payments (migração 013) já serve ao cartão: uma cobrança por reserva,
-- divisão calculada pelo banco, leitura só para hóspede, anfitrião e admin. O que
-- esta migração acrescenta:
--
--  * register_card_charge: registra a cobrança de CARTÃO criada no provedor
--    (PaymentIntent da Stripe). Mesmas regras de register_pix_charge: reserva
--    própria e ativa, anfitrião com dados para receber, divisão
--        anfitrião  = diárias (noites x preço da noite)
--        plataforma = total pago - diárias   (no cartão: a taxa de serviço de 10%)
--    Só a service_role executa (a Edge Function card-create-intent).
--  * mark_payment_paid e expire_pix_payments passam a falar "cartão" ou "Pix"
--    conforme a forma de pagamento da reserva. Para o Pix os textos continuam
--    IDÊNTICOS aos da migração 013. As duas continuam servindo aos dois meios:
--    a confirmação do cartão chega pelo webhook da Stripe e chama a mesma função,
--    e o cartão não pago em 30 minutos também libera as datas.
--
-- Nenhum dado de cartão passa ou é guardado aqui: quem recebe o número é a Stripe.
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================

CREATE OR REPLACE FUNCTION public.register_card_charge(
  p_user_id     UUID,
  p_booking_id  UUID,
  p_provider    TEXT,
  p_charge_id   TEXT,
  p_expires_at  TIMESTAMPTZ
)
RETURNS public.payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b       public.bookings%ROWTYPE;
  v_host  NUMERIC(10,2);
  v_pay   public.payments%ROWTYPE;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reserva não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  IF b.guest_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Essa reserva não é sua.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF b.status::text <> 'reservada' THEN
    RAISE EXCEPTION 'Essa reserva não está ativa.' USING ERRCODE = 'check_violation';
  END IF;
  IF b.pay_method::text <> 'card' THEN
    RAISE EXCEPTION 'Essa reserva não é para pagar com cartão.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_expires_at <= NOW() THEN
    RAISE EXCEPTION 'A cobrança já nasceu vencida.' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.payout_accounts po
      JOIN public.properties prop ON prop.owner_id = po.user_id
     WHERE prop.id = b.property_id
  ) THEN
    RAISE EXCEPTION 'O anfitrião ainda não cadastrou os dados para receber.' USING ERRCODE = 'check_violation';
  END IF;

  -- Divisão calculada a partir da reserva, nunca de valor recebido de fora.
  v_host := LEAST(ROUND(b.nights * b.price_per_night, 2), b.total);

  INSERT INTO public.payments (
    booking_id, provider, provider_charge_id, status,
    amount, host_amount, platform_fee, pix_copy_paste, pix_qr_image, expires_at
  ) VALUES (
    b.id, p_provider, p_charge_id, 'aguardando',
    b.total, v_host, b.total - v_host, NULL, NULL, p_expires_at
  )
  ON CONFLICT (booking_id) DO UPDATE SET
    provider = EXCLUDED.provider,
    provider_charge_id = EXCLUDED.provider_charge_id,
    status = 'aguardando',
    amount = EXCLUDED.amount,
    host_amount = EXCLUDED.host_amount,
    platform_fee = EXCLUDED.platform_fee,
    pix_copy_paste = NULL,
    pix_qr_image = NULL,
    expires_at = EXCLUDED.expires_at,
    paid_at = NULL
  WHERE public.payments.status IN ('expirado', 'falhou')
  RETURNING * INTO v_pay;

  IF v_pay.id IS NULL THEN
    RAISE EXCEPTION 'Já existe uma cobrança para essa reserva.' USING ERRCODE = 'unique_violation';
  END IF;

  RETURN v_pay;
END;
$$;

-- ── Confirmar o pagamento (webhook): textos por forma de pagamento ──
-- Devolve TRUE só na primeira confirmação; repetições do webhook devolvem FALSE.
CREATE OR REPLACE FUNCTION public.mark_payment_paid(p_charge_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pay      public.payments%ROWTYPE;
  b        public.bookings%ROWTYPE;
  prop     public.properties%ROWTYPE;
  v_admin  UUID;
  v_card   BOOLEAN;
BEGIN
  SELECT * INTO pay FROM public.payments WHERE provider_charge_id = p_charge_id FOR UPDATE;
  IF NOT FOUND OR pay.status = 'pago' THEN
    RETURN FALSE;
  END IF;

  UPDATE public.payments SET status = 'pago', paid_at = NOW() WHERE id = pay.id;

  SELECT * INTO b FROM public.bookings WHERE id = pay.booking_id;
  SELECT * INTO prop FROM public.properties WHERE id = b.property_id;
  v_card := b.pay_method::text = 'card';

  PERFORM public.create_notification(
    b.guest_id, 'reserva', '✅ Pagamento confirmado',
    CASE WHEN v_card
      THEN 'Recebemos o pagamento no cartão da sua reserva em "' || prop.title || '".'
      ELSE 'Recebemos o Pix da sua reserva em "' || prop.title || '".'
    END,
    prop.id, b.id
  );
  PERFORM public.create_notification(
    prop.owner_id, 'reserva', '💰 Pagamento recebido',
    'O hóspede pagou a reserva de "' || prop.title || '". Seu repasse: R$ '
      || TO_CHAR(pay.host_amount, 'FM999G990D00') || '.',
    prop.id, b.id
  );

  -- Pagou depois de a reserva ter sido cancelada (cobrança vencida paga na última hora):
  -- o dinheiro entrou e a estadia não existe mais. Alguém precisa devolver.
  IF b.status::text = 'cancelada' THEN
    FOR v_admin IN SELECT id FROM public.profiles WHERE role = 'admin' AND deleted_at IS NULL LOOP
      PERFORM public.create_notification(
        v_admin, 'aviso', '⚠️ Pagamento de reserva cancelada',
        CASE WHEN v_card
          THEN 'Entrou um pagamento no cartão de R$ '
          ELSE 'Entrou um Pix de R$ '
        END || TO_CHAR(pay.amount, 'FM999G990D00')
          || ' de uma reserva já cancelada ("' || prop.title || '"). É preciso devolver o valor.',
        prop.id, b.id
      );
    END LOOP;
  END IF;

  RETURN TRUE;
END;
$$;

-- ── Expirar cobrança vencida (Pix ou cartão) e liberar as datas ──
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

REVOKE ALL ON FUNCTION public.register_card_charge(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_payment_paid(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_pix_payments() FROM PUBLIC, anon, authenticated;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.register_card_charge(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ) TO service_role;
    GRANT EXECUTE ON FUNCTION public.mark_payment_paid(TEXT) TO service_role;
    GRANT EXECUTE ON FUNCTION public.expire_pix_payments() TO service_role;
  END IF;
END $$;

-- ── Conferência pós-aplicação (SQL Editor) ──────────────────
-- SELECT proname FROM pg_proc WHERE proname IN ('register_card_charge','mark_payment_paid','expire_pix_payments');   -- 3 linhas
