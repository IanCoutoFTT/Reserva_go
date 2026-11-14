-- ============================================================
-- Migração 013: pagamento por Pix (cobrança, confirmação e divisão do valor)
-- ============================================================
--
-- Até aqui a reserva grava "pix" como forma de pagamento, mas ninguém paga: o
-- app não cobra nada. Esta migração cria a base para cobrar de verdade:
--
--  * payments: uma cobrança Pix por reserva (código "copia e cola", imagem do QR
--    Code, validade, situação). Os usuários só LEEM (hóspede, anfitrião da cabana
--    e admin). Quem grava é o servidor (Edge Function com a service_role), nunca
--    o app. Assim ninguém marca o próprio pagamento como pago.
--  * Divisão do valor calculada AQUI, a partir da reserva, e nunca enviada pelo
--    cliente nem pela Edge Function:
--        anfitrião  = diárias (noites x preço da noite)
--        plataforma = total pago - diárias   (taxa de serviço, já com o desconto do Pix)
--    Para o Pix: total = diárias x 1,10 x 0,95, então a plataforma fica com 4,5%.
--  * register_pix_charge: registra a cobrança criada no provedor.
--    mark_payment_paid: confirma o pagamento (chamada pelo webhook), idempotente.
--    expire_pix_payments: expira cobranças vencidas e cancela a reserva, para o
--    período voltar a ficar livre.
--    Todas executáveis SÓ pela service_role.
--  * payout_accounts: conta do anfitrião no provedor de pagamento (para o repasse).
--
-- O app só usa isso quando o pagamento está ligado (EXPO_PUBLIC_PIX_ENABLED);
-- com ele desligado a reserva funciona exatamente como antes.
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================

DO $$ BEGIN
  CREATE TYPE public.payment_status AS ENUM ('aguardando', 'pago', 'expirado', 'falhou');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.payments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id         UUID NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE,
  provider           TEXT NOT NULL CHECK (char_length(provider) BETWEEN 1 AND 30),
  provider_charge_id TEXT NOT NULL UNIQUE CHECK (char_length(provider_charge_id) BETWEEN 1 AND 200),
  status             public.payment_status NOT NULL DEFAULT 'aguardando',
  amount             NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  host_amount        NUMERIC(10,2) NOT NULL CHECK (host_amount >= 0),
  platform_fee       NUMERIC(10,2) NOT NULL CHECK (platform_fee >= 0),
  pix_copy_paste     TEXT CHECK (pix_copy_paste IS NULL OR char_length(pix_copy_paste) <= 2000),
  pix_qr_image       TEXT CHECK (pix_qr_image IS NULL OR char_length(pix_qr_image) <= 100000),
  expires_at         TIMESTAMPTZ NOT NULL,
  paid_at            TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payments_divisao_fecha CHECK (host_amount + platform_fee = amount)
);

CREATE INDEX IF NOT EXISTS idx_payments_status_expires ON public.payments(status, expires_at);

DROP TRIGGER IF EXISTS payments_updated_at ON public.payments;
CREATE TRIGGER payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Só leitura para o app; escrita só pela service_role (que ignora RLS).
REVOKE ALL ON public.payments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.payments TO authenticated;

DROP POLICY IF EXISTS "payments_guest_read" ON public.payments;
CREATE POLICY "payments_guest_read" ON public.payments
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND b.guest_id = auth.uid())
  );

DROP POLICY IF EXISTS "payments_host_read" ON public.payments;
CREATE POLICY "payments_host_read" ON public.payments
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      JOIN public.properties p ON p.id = b.property_id
      WHERE b.id = booking_id AND p.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "payments_admin_read" ON public.payments;
CREATE POLICY "payments_admin_read" ON public.payments
  FOR SELECT TO authenticated USING (public.is_admin());

-- ── Conta de recebimento do anfitrião ────────────────────────
CREATE TABLE IF NOT EXISTS public.payout_accounts (
  user_id    UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider   TEXT NOT NULL CHECK (char_length(provider) BETWEEN 1 AND 30),
  account_id TEXT NOT NULL CHECK (char_length(account_id) BETWEEN 1 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS payout_accounts_updated_at ON public.payout_accounts;
CREATE TRIGGER payout_accounts_updated_at
  BEFORE UPDATE ON public.payout_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.payout_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payout_accounts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payout_accounts TO authenticated;

DROP POLICY IF EXISTS "payout_accounts_own" ON public.payout_accounts;
CREATE POLICY "payout_accounts_own" ON public.payout_accounts
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND public.is_active_user());

-- ── Registrar a cobrança criada no provedor ──────────────────
CREATE OR REPLACE FUNCTION public.register_pix_charge(
  p_user_id     UUID,
  p_booking_id  UUID,
  p_provider    TEXT,
  p_charge_id   TEXT,
  p_copy_paste  TEXT,
  p_qr_image    TEXT,
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
  IF b.pay_method::text <> 'pix' THEN
    RAISE EXCEPTION 'Essa reserva não é para pagar com Pix.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_expires_at <= NOW() THEN
    RAISE EXCEPTION 'A cobrança já nasceu vencida.' USING ERRCODE = 'check_violation';
  END IF;

  -- Divisão calculada a partir da reserva, nunca de valor recebido de fora.
  v_host := LEAST(ROUND(b.nights * b.price_per_night, 2), b.total);

  INSERT INTO public.payments (
    booking_id, provider, provider_charge_id, status,
    amount, host_amount, platform_fee, pix_copy_paste, pix_qr_image, expires_at
  ) VALUES (
    b.id, p_provider, p_charge_id, 'aguardando',
    b.total, v_host, b.total - v_host, p_copy_paste, p_qr_image, p_expires_at
  )
  ON CONFLICT (booking_id) DO UPDATE SET
    provider = EXCLUDED.provider,
    provider_charge_id = EXCLUDED.provider_charge_id,
    status = 'aguardando',
    amount = EXCLUDED.amount,
    host_amount = EXCLUDED.host_amount,
    platform_fee = EXCLUDED.platform_fee,
    pix_copy_paste = EXCLUDED.pix_copy_paste,
    pix_qr_image = EXCLUDED.pix_qr_image,
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

-- ── Confirmar o pagamento (webhook do provedor) ──────────────
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
BEGIN
  SELECT * INTO pay FROM public.payments WHERE provider_charge_id = p_charge_id FOR UPDATE;
  IF NOT FOUND OR pay.status = 'pago' THEN
    RETURN FALSE;
  END IF;

  UPDATE public.payments SET status = 'pago', paid_at = NOW() WHERE id = pay.id;

  SELECT * INTO b FROM public.bookings WHERE id = pay.booking_id;
  SELECT * INTO prop FROM public.properties WHERE id = b.property_id;

  PERFORM public.create_notification(
    b.guest_id, 'reserva', '✅ Pagamento confirmado',
    'Recebemos o Pix da sua reserva em "' || prop.title || '".',
    prop.id, b.id
  );
  PERFORM public.create_notification(
    prop.owner_id, 'reserva', '💰 Pagamento recebido',
    'O hóspede pagou a reserva de "' || prop.title || '". Seu repasse: R$ '
      || TO_CHAR(pay.host_amount, 'FM999G990D00') || '.',
    prop.id, b.id
  );

  -- Pagou depois de a reserva ter sido cancelada (Pix vencido pago na última hora):
  -- o dinheiro entrou e a estadia não existe mais. Alguém precisa devolver.
  IF b.status::text = 'cancelada' THEN
    FOR v_admin IN SELECT id FROM public.profiles WHERE role = 'admin' AND deleted_at IS NULL LOOP
      PERFORM public.create_notification(
        v_admin, 'aviso', '⚠️ Pagamento de reserva cancelada',
        'Entrou um Pix de R$ ' || TO_CHAR(pay.amount, 'FM999G990D00')
          || ' de uma reserva já cancelada ("' || prop.title || '"). É preciso devolver o valor.',
        prop.id, b.id
      );
    END LOOP;
  END IF;

  RETURN TRUE;
END;
$$;

-- ── Expirar Pix vencido e liberar as datas ───────────────────
-- Agendar a cada poucos minutos (ver docs/pagamento-pix.md). Devolve quantas expirou.
CREATE OR REPLACE FUNCTION public.expire_pix_payments()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r       RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR r IN
    SELECT pay.id AS payment_id, b.id AS booking_id, b.guest_id, b.property_id, prop.title
      FROM public.payments pay
      JOIN public.bookings b ON b.id = pay.booking_id
      JOIN public.properties prop ON prop.id = b.property_id
     WHERE pay.status = 'aguardando' AND pay.expires_at < NOW()
     FOR UPDATE OF pay
  LOOP
    UPDATE public.payments SET status = 'expirado' WHERE id = r.payment_id;

    UPDATE public.bookings
       SET status = 'cancelada', cancelled_at = NOW(),
           cancel_reason = 'Pix não pago dentro do prazo'
     WHERE id = r.booking_id AND status::text = 'reservada';

    PERFORM public.create_notification(
      r.guest_id, 'reserva', 'Reserva cancelada: Pix não pago',
      'O prazo para pagar o Pix da reserva em "' || r.title || '" acabou e as datas foram liberadas.',
      r.property_id, r.booking_id
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.register_pix_charge(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_payment_paid(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_pix_payments() FROM PUBLIC, anon, authenticated;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.register_pix_charge(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ) TO service_role;
    GRANT EXECUTE ON FUNCTION public.mark_payment_paid(TEXT) TO service_role;
    GRANT EXECUTE ON FUNCTION public.expire_pix_payments() TO service_role;
  END IF;
END $$;

-- ── Conferência pós-aplicação (SQL Editor) ──────────────────
-- SELECT to_regclass('public.payments'), to_regclass('public.payout_accounts');   -- as duas tabelas
-- SELECT proname FROM pg_proc WHERE proname IN ('register_pix_charge','mark_payment_paid','expire_pix_payments');   -- 3 linhas
