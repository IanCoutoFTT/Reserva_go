-- ============================================================
-- Migração 017: limite de envio (anti-spam e abuso)
-- ============================================================
--
-- Até aqui nada impedia alguém de mandar centenas de mensagens por minuto, abrir
-- dezenas de conversas, denunciar o mesmo anúncio sem parar ou criar anúncios em
-- série (o app, ou um script com a chave anon, chamam a API direto). O limite vale
-- aqui, no banco, e não só na tela:
--
--  * Mensagens: no máximo 15 por minuto e 200 por hora; a mesma mensagem repetida
--    4 vezes em 5 minutos é recusada (flood).
--  * Conversas novas: no máximo 20 por hora.
--  * Denúncias: no máximo 5 por hora e 20 por dia, e a mesma denúncia (mesmo anúncio
--    ou mesmo usuário) não pode se repetir em 24 horas.
--  * Anúncios novos: no máximo 5 por hora.
--
-- Os limites só valem para as chamadas do app (papéis anon e authenticated, como em
-- is_app_request(), migração 008). O SQL Editor, a service_role e os scripts de
-- demonstração não são limitados.
-- As mensagens de erro começam com "Limite de envio:" para o app reconhecê-las e
-- mostrá-las à pessoa (lib/rateLimit.ts). Os gatilhos são SECURITY INVOKER de
-- propósito: precisam enxergar o papel de quem chama.
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_messages_sender_created ON public.messages (sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_reporter_created ON public.reports (reporter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_properties_owner_created ON public.properties (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_guest_created ON public.conversations (guest_id, created_at DESC);

-- ── Mensagens ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_message_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  c_per_minute CONSTANT INTEGER := 15;
  c_per_hour   CONSTANT INTEGER := 200;
  c_repeats    CONSTANT INTEGER := 4;
  v_minute INTEGER;
  v_hour   INTEGER;
  v_same   INTEGER;
BEGIN
  IF NOT public.is_app_request() THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 minute'),
         COUNT(*)
    INTO v_minute, v_hour
    FROM public.messages
   WHERE sender_id = NEW.sender_id AND created_at > NOW() - INTERVAL '1 hour';

  IF v_minute >= c_per_minute THEN
    RAISE EXCEPTION 'Limite de envio: você mandou mensagens demais em pouco tempo. Aguarde um minuto e tente de novo.';
  END IF;
  IF v_hour >= c_per_hour THEN
    RAISE EXCEPTION 'Limite de envio: você atingiu o máximo de mensagens por hora. Tente de novo mais tarde.';
  END IF;

  SELECT COUNT(*) INTO v_same
    FROM public.messages
   WHERE sender_id = NEW.sender_id
     AND content = NEW.content
     AND created_at > NOW() - INTERVAL '5 minutes';
  IF v_same >= c_repeats THEN
    RAISE EXCEPTION 'Limite de envio: essa mesma mensagem já foi enviada várias vezes. Evite repetir o texto.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_rate_limit ON public.messages;
CREATE TRIGGER messages_rate_limit
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_message_rate_limit();

-- ── Conversas novas ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_conversation_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  c_per_hour CONSTANT INTEGER := 20;
BEGIN
  IF NOT public.is_app_request() THEN
    RETURN NEW;
  END IF;
  IF (SELECT COUNT(*) FROM public.conversations
       WHERE guest_id = NEW.guest_id AND created_at > NOW() - INTERVAL '1 hour') >= c_per_hour THEN
    RAISE EXCEPTION 'Limite de envio: você abriu conversas demais em pouco tempo. Tente de novo mais tarde.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS conversations_rate_limit ON public.conversations;
CREATE TRIGGER conversations_rate_limit
  BEFORE INSERT ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_conversation_rate_limit();

-- ── Denúncias ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_report_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  c_per_hour CONSTANT INTEGER := 5;
  c_per_day  CONSTANT INTEGER := 20;
  v_hour INTEGER;
  v_day  INTEGER;
BEGIN
  IF NOT public.is_app_request() THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.reports
     WHERE reporter_id = NEW.reporter_id
       AND property_id IS NOT DISTINCT FROM NEW.property_id
       AND reported_user_id IS NOT DISTINCT FROM NEW.reported_user_id
       AND created_at > NOW() - INTERVAL '24 hours'
  ) THEN
    RAISE EXCEPTION 'Limite de envio: você já fez essa denúncia nas últimas 24 horas. Nossa equipe já foi avisada.';
  END IF;

  SELECT COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour'),
         COUNT(*)
    INTO v_hour, v_day
    FROM public.reports
   WHERE reporter_id = NEW.reporter_id AND created_at > NOW() - INTERVAL '24 hours';

  IF v_hour >= c_per_hour THEN
    RAISE EXCEPTION 'Limite de envio: você fez denúncias demais em pouco tempo. Tente de novo mais tarde.';
  END IF;
  IF v_day >= c_per_day THEN
    RAISE EXCEPTION 'Limite de envio: você atingiu o máximo de denúncias por dia.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reports_rate_limit ON public.reports;
CREATE TRIGGER reports_rate_limit
  BEFORE INSERT ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.enforce_report_rate_limit();

-- ── Anúncios novos ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_listing_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  c_per_hour CONSTANT INTEGER := 5;
BEGIN
  IF NOT public.is_app_request() THEN
    RETURN NEW;
  END IF;
  IF (SELECT COUNT(*) FROM public.properties
       WHERE owner_id = NEW.owner_id AND created_at > NOW() - INTERVAL '1 hour') >= c_per_hour THEN
    RAISE EXCEPTION 'Limite de envio: você criou anúncios demais em pouco tempo. Tente de novo mais tarde.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS properties_rate_limit ON public.properties;
CREATE TRIGGER properties_rate_limit
  BEFORE INSERT ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.enforce_listing_rate_limit();

-- ── Conferência pós-aplicação (SQL Editor) ──────────────────
-- SELECT tgname FROM pg_trigger WHERE tgname IN
--   ('messages_rate_limit','conversations_rate_limit','reports_rate_limit','properties_rate_limit');   -- 4 linhas
