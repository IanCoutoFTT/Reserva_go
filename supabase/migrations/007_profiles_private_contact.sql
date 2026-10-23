-- ============================================================
-- Migração 007: e-mail e telefone deixam de ser públicos em `profiles`
-- ============================================================
--
-- Problema (LGPD): a policy profiles_public_read deixa qualquer pessoa -
-- inclusive sem login (chave anon, que vai embutida no app) - ler a linha
-- inteira de qualquer perfil. Isso expunha e-mail e telefone de todos os
-- usuários com um simples GET em /rest/v1/profiles?select=email,phone.
--
-- Correção: a policy de linhas continua igual (nome e foto precisam ser
-- públicos: aparecem em avaliações, conversas e reservas), mas a leitura das
-- colunas sensíveis `email` e `phone` é retirada de anon/authenticated por
-- privilégio de COLUNA. O próprio usuário continua vendo o seu perfil completo
-- pela função get_my_profile() (SECURITY DEFINER, só devolve a linha de
-- auth.uid()).
--
-- Efeito no app (mesmo commit): qualquer SELECT em profiles passa a listar as
-- colunas públicas explicitamente (`select('*')` agora é negado) e o perfil
-- próprio vem de supabase.rpc('get_my_profile'). Colunas novas que forem
-- criadas no futuro nascem SEM permissão de leitura (seguro por padrão).
--
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================

-- 1. Tira a leitura da tabela inteira e devolve só as colunas públicas.
REVOKE SELECT ON public.profiles FROM anon, authenticated;

GRANT SELECT (id, name, avatar_url, role, bio, interests, created_at, updated_at, deleted_at)
  ON public.profiles TO anon, authenticated;

-- 2. Perfil completo (com e-mail e telefone) só para o dono da conta.
--    Devolve 0 linhas quando a conta foi excluída (deleted_at preenchido), o
--    mesmo comportamento que a policy profiles_public_read já tinha, então o
--    app continua tratando PGRST116 como "conta indisponível".
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS SETOF public.profiles
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.profiles WHERE id = auth.uid() AND deleted_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.get_my_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;

-- ── Conferência pós-aplicação (SQL Editor) ──────────────────
-- 1) Colunas liberadas para leitura pública (NÃO deve listar email nem phone):
--    SELECT column_name FROM information_schema.column_privileges
--     WHERE table_name = 'profiles' AND grantee = 'anon' AND privilege_type = 'SELECT'
--     ORDER BY column_name;
-- 2) A função existe e só authenticated executa:
--    SELECT proname, proacl FROM pg_proc WHERE proname = 'get_my_profile';
-- 3) Com a chave anon, isto deve dar "permission denied for table profiles":
--    GET /rest/v1/profiles?select=email
