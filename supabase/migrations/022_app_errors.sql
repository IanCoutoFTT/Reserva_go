-- ============================================================
-- Migração 022: monitoramento de erros do aplicativo
-- ============================================================
--
-- Quando o app quebra num celular, ninguém da equipe fica sabendo. Esta migração cria um
-- registro de erros próprio, gratuito e dentro do Supabase (um Sentry em miniatura):
--
--  * app_errors: mensagem, trecho do rastreio, tela, versão e plataforma. O app envia sozinho
--    quando uma tela quebra ou um erro não tratado acontece (lib/errorReporter.ts).
--  * Quem pode ESCREVER: qualquer instalação do app, mesmo sem login (o erro pode acontecer
--    antes do login). Quem pode LER e apagar: só o admin. Ninguém lê os erros dos outros.
--  * user_id é sempre o do login de quem envia (ou vazio): o app não escolhe.
--  * Textos são cortados nos limites (mensagem 500, rastreio 4000) em vez de recusados, e o app
--    já remove e-mails e códigos de acesso antes de enviar.
--  * Limite contra abuso: 30 erros por hora por usuário; sem login, 100 por minuto no total.
--    Passou do limite, o excesso é descartado em silêncio (não derruba o app que está quebrando).
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.app_errors (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  message     TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 500),
  stack       TEXT CHECK (stack IS NULL OR char_length(stack) <= 4000),
  screen      TEXT CHECK (screen IS NULL OR char_length(screen) <= 100),
  app_version TEXT CHECK (app_version IS NULL OR char_length(app_version) <= 40),
  platform    TEXT CHECK (platform IS NULL OR char_length(platform) <= 20)
);

CREATE INDEX IF NOT EXISTS idx_app_errors_created ON public.app_errors (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_errors_user_created ON public.app_errors (user_id, created_at DESC);

ALTER TABLE public.app_errors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_errors FROM PUBLIC, anon, authenticated;
GRANT INSERT ON public.app_errors TO anon, authenticated;
GRANT SELECT, DELETE ON public.app_errors TO authenticated;

DROP POLICY IF EXISTS "app_errors_insert" ON public.app_errors;
CREATE POLICY "app_errors_insert" ON public.app_errors
  FOR INSERT TO anon, authenticated WITH CHECK (TRUE);

DROP POLICY IF EXISTS "app_errors_admin_read" ON public.app_errors;
CREATE POLICY "app_errors_admin_read" ON public.app_errors
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "app_errors_admin_delete" ON public.app_errors;
CREATE POLICY "app_errors_admin_delete" ON public.app_errors
  FOR DELETE TO authenticated USING (public.is_admin());

-- ── Prepara e limita cada registro ──────────────────────────
-- SECURITY DEFINER: precisa contar os registros de todos, e quem envia não pode ler a tabela.
-- is_app_request() não serve aqui (o definer muda current_user): usa o papel da conexão.
CREATE OR REPLACE FUNCTION public.prepare_app_error()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_app BOOLEAN := COALESCE(NULLIF(current_setting('request.jwt.claims', TRUE), '')::json ->> 'role', '') IN ('anon', 'authenticated');
BEGIN
  IF v_app THEN
    NEW.user_id := v_uid; -- o app não escolhe de quem é o erro
    IF v_uid IS NOT NULL THEN
      IF (SELECT COUNT(*) FROM public.app_errors WHERE user_id = v_uid AND created_at > NOW() - INTERVAL '1 hour') >= 30 THEN
        RETURN NULL; -- descarta em silêncio
      END IF;
    ELSE
      IF (SELECT COUNT(*) FROM public.app_errors WHERE user_id IS NULL AND created_at > NOW() - INTERVAL '1 minute') >= 100 THEN
        RETURN NULL;
      END IF;
    END IF;
    NEW.created_at := NOW();
  END IF;

  NEW.message := left(btrim(COALESCE(NEW.message, '')), 500);
  IF NEW.message = '' THEN
    NEW.message := '(sem mensagem)';
  END IF;
  NEW.stack := left(NEW.stack, 4000);
  NEW.screen := left(NEW.screen, 100);
  NEW.app_version := left(NEW.app_version, 40);
  NEW.platform := left(NEW.platform, 20);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS app_errors_prepare ON public.app_errors;
CREATE TRIGGER app_errors_prepare
  BEFORE INSERT ON public.app_errors
  FOR EACH ROW EXECUTE FUNCTION public.prepare_app_error();

REVOKE ALL ON FUNCTION public.prepare_app_error() FROM PUBLIC, anon, authenticated;

-- ── Conferência pós-aplicação (SQL Editor) ──────────────────
-- SELECT to_regclass('public.app_errors');                                    -- a tabela
-- SELECT tgname FROM pg_trigger WHERE tgname = 'app_errors_prepare';          -- 1 linha
