-- ============================================================
-- Migração 014: dados para recebimento (nome, CPF e chave Pix) de anfitrião e admin
-- ============================================================
--
-- A 013 criou payout_accounts só com a conta do provedor (walletId). Para a
-- plataforma conseguir repassar o dinheiro por Pix, quem recebe precisa informar
-- quem é e para onde mandar: nome completo, CPF e chave Pix.
--
--  * Colunas novas: full_name, document (CPF só com dígitos), pix_key_type
--    (cpf | email | telefone | aleatoria) e pix_key. provider/account_id passam a
--    ser opcionais (continuam servindo para repasse automático por provedor).
--  * Quem decide é o BANCO (gatilho validate_payout_account): confere nome e
--    sobrenome, CPF pelos dígitos verificadores, e o formato de cada tipo de chave,
--    e GRAVA normalizado (CPF e telefone só com números, e-mail em minúsculas).
--    Chave do tipo CPF precisa ser o CPF do próprio titular.
--  * Só anfitrião e admin cadastram. Só o DONO lê e edita (RLS da 013): nem o
--    admin enxerga pelo app. O repasse é feito pelo servidor (service_role).
--  * Segurança contra troca de destino: quando os dados mudam, o dono recebe um
--    aviso ("se não foi você, fale com o suporte").
--  * register_pix_charge passa a exigir que o anfitrião da cabana já tenha dados
--    de recebimento: sem eles não há como repassar o valor, então nem se cobra.
--  * Idempotente: pode rodar mais de uma vez.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_valid_cpf(p_cpf TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  d TEXT := regexp_replace(COALESCE(p_cpf, ''), '\D', '', 'g');
  s INT;
  r INT;
BEGIN
  IF length(d) <> 11 OR d ~ '^(\d)\1{10}$' THEN
    RETURN FALSE;
  END IF;
  FOR k IN 9..10 LOOP
    s := 0;
    FOR i IN 1..k LOOP
      s := s + substr(d, i, 1)::INT * (k + 2 - i);
    END LOOP;
    r := (s * 10) % 11;
    IF r = 10 THEN r := 0; END IF;
    IF r <> substr(d, k + 1, 1)::INT THEN
      RETURN FALSE;
    END IF;
  END LOOP;
  RETURN TRUE;
END;
$$;

ALTER TABLE public.payout_accounts ADD COLUMN IF NOT EXISTS full_name    TEXT;
ALTER TABLE public.payout_accounts ADD COLUMN IF NOT EXISTS document     TEXT;
ALTER TABLE public.payout_accounts ADD COLUMN IF NOT EXISTS pix_key_type TEXT;
ALTER TABLE public.payout_accounts ADD COLUMN IF NOT EXISTS pix_key      TEXT;
ALTER TABLE public.payout_accounts ALTER COLUMN provider   DROP NOT NULL;
ALTER TABLE public.payout_accounts ALTER COLUMN account_id DROP NOT NULL;

ALTER TABLE public.payout_accounts DROP CONSTRAINT IF EXISTS payout_accounts_campos_validos;
ALTER TABLE public.payout_accounts ADD CONSTRAINT payout_accounts_campos_validos CHECK (
  (pix_key_type IS NULL OR pix_key_type IN ('cpf', 'email', 'telefone', 'aleatoria'))
  AND (pix_key IS NULL) = (pix_key_type IS NULL)
  AND (pix_key IS NULL OR char_length(pix_key) <= 100)
  AND (full_name IS NULL OR char_length(full_name) BETWEEN 5 AND 100)
  AND (document IS NULL OR document ~ '^\d{11}$')
  AND (provider IS NULL) = (account_id IS NULL)
  AND ((pix_key IS NOT NULL) OR (account_id IS NOT NULL))
);

CREATE OR REPLACE FUNCTION public.validate_payout_account()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_digits TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = NEW.user_id AND role IN ('anfitriao', 'admin') AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Só anfitriões e administradores cadastram dados de recebimento.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.pix_key IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.full_name := btrim(regexp_replace(COALESCE(NEW.full_name, ''), '\s+', ' ', 'g'));
  IF char_length(NEW.full_name) < 5 OR position(' ' IN NEW.full_name) = 0 THEN
    RAISE EXCEPTION 'Informe o nome completo (nome e sobrenome).' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT public.is_valid_cpf(NEW.document) THEN
    RAISE EXCEPTION 'CPF inválido.' USING ERRCODE = 'check_violation';
  END IF;
  NEW.document := regexp_replace(NEW.document, '\D', '', 'g');

  CASE NEW.pix_key_type
    WHEN 'cpf' THEN
      v_digits := regexp_replace(NEW.pix_key, '\D', '', 'g');
      IF v_digits <> NEW.document THEN
        RAISE EXCEPTION 'A chave Pix do tipo CPF precisa ser o seu próprio CPF.' USING ERRCODE = 'check_violation';
      END IF;
      NEW.pix_key := v_digits;
    WHEN 'email' THEN
      NEW.pix_key := lower(btrim(NEW.pix_key));
      IF NEW.pix_key !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' OR char_length(NEW.pix_key) > 77 THEN
        RAISE EXCEPTION 'E-mail da chave Pix inválido.' USING ERRCODE = 'check_violation';
      END IF;
    WHEN 'telefone' THEN
      v_digits := regexp_replace(NEW.pix_key, '\D', '', 'g');
      IF v_digits ~ '^[1-9][0-9][2-9][0-9]{7,8}$' THEN
        v_digits := '55' || v_digits;            -- veio sem o código do país
      END IF;
      IF v_digits !~ '^55[1-9][0-9][2-9][0-9]{7,8}$' THEN
        RAISE EXCEPTION 'Celular da chave Pix inválido. Use DDD + número.' USING ERRCODE = 'check_violation';
      END IF;
      NEW.pix_key := '+' || v_digits;
    WHEN 'aleatoria' THEN
      NEW.pix_key := lower(btrim(NEW.pix_key));
      IF NEW.pix_key !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'Chave aleatória inválida.' USING ERRCODE = 'check_violation';
      END IF;
    ELSE
      RAISE EXCEPTION 'Tipo de chave Pix inválido.' USING ERRCODE = 'check_violation';
  END CASE;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payout_accounts_validate ON public.payout_accounts;
CREATE TRIGGER payout_accounts_validate
  BEFORE INSERT OR UPDATE ON public.payout_accounts
  FOR EACH ROW EXECUTE FUNCTION public.validate_payout_account();

-- Avisa o dono quando os dados de recebimento são cadastrados ou mudam.
CREATE OR REPLACE FUNCTION public.notify_payout_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.pix_key IS NOT DISTINCT FROM OLD.pix_key
     AND NEW.document IS NOT DISTINCT FROM OLD.document
     AND NEW.account_id IS NOT DISTINCT FROM OLD.account_id THEN
    RETURN NEW;
  END IF;

  PERFORM public.create_notification(
    NEW.user_id, 'aviso',
    '🔐 Dados de recebimento ' || CASE WHEN TG_OP = 'INSERT' THEN 'cadastrados' ELSE 'alterados' END,
    'Seus dados para receber pagamentos foram ' || CASE WHEN TG_OP = 'INSERT' THEN 'cadastrados' ELSE 'alterados' END
      || '. Se não foi você, fale com o suporte agora.'
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_payout_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_payout_account() FROM PUBLIC, anon, authenticated;
-- is_valid_cpf é só uma conta (sem acesso a tabela): o gatilho roda com o usuário
-- do app e precisa poder chamá-la.
REVOKE ALL ON FUNCTION public.is_valid_cpf(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_valid_cpf(TEXT) TO authenticated;

DROP TRIGGER IF EXISTS payout_accounts_notify ON public.payout_accounts;
CREATE TRIGGER payout_accounts_notify
  AFTER INSERT OR UPDATE ON public.payout_accounts
  FOR EACH ROW EXECUTE FUNCTION public.notify_payout_change();

-- ── register_pix_charge: só cobra se o anfitrião tem para onde repassar ──
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

-- ── Conferência pós-aplicação (SQL Editor) ──────────────────
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'payout_accounts' AND column_name IN ('full_name','document','pix_key_type','pix_key');   -- 4 linhas
-- SELECT tgname FROM pg_trigger WHERE tgname IN ('payout_accounts_validate','payout_accounts_notify');          -- 2 linhas
