-- ============================================================
-- Migração 005: corrige search_path da function handle_new_user()
-- ============================================================
--
-- Contexto (branch feature/mensagens, 08/09/2026): dois cadastros reais
-- (Ian Couto, Thiago Patrick) fizeram login com o Google normalmente
-- (sessão criada com sucesso), mas NENHUM perfil apareceu em `profiles`.
-- O app caiu no fallback local de context/AuthContext.tsx (role fixa
-- 'hospede', nada persistido no banco) sem avisar de forma visível que
-- algo tinha dado errado.
--
-- Diagnóstico (SQL Editor, sessão registrada com o usuário):
-- 1. `SELECT tgname, tgenabled FROM pg_trigger WHERE tgname =
--    'on_auth_user_created'` -> trigger existe e está habilitada ('O').
-- 2. `SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname =
--    'handle_new_user'` -> a function rodando no banco JÁ tinha divergido
--    do que estava documentado em supabase/schema.sql: ganhou `role`,
--    `created_at`, `updated_at`, `ON CONFLICT (id) DO NOTHING` e um bloco
--    `EXCEPTION WHEN OTHERS THEN RAISE LOG ... RETURN NEW` - mudanças
--    aplicadas direto no banco em algum momento, nunca commitadas aqui.
-- 3. Rodar o MESMO insert manualmente (dentro de BEGIN/ROLLBACK, com o
--    UUID real de um dos dois usuários órfãos) funcionou sem erro nenhum.
--
-- Isso é a assinatura clássica de uma function SECURITY DEFINER sem
-- `search_path` fixo: rodar manualmente no SQL Editor funciona porque essa
-- sessão já tem `public` no search_path por padrão; disparada sozinha pela
-- trigger durante um cadastro de verdade, o contexto interno do Supabase
-- Auth não necessariamente inclui `public` no search_path, então
-- `INSERT INTO profiles` (sem prefixo de schema) falha com "relation
-- profiles does not exist" - e o bloco EXCEPTION (que só existia no banco,
-- não no schema.sql) engolia esse erro silenciosamente com `RAISE LOG`
-- (só aparece nos Logs internos do Postgres, nunca pro client) e devolvia
-- `RETURN NEW`, deixando o INSERT em auth.users completar normalmente.
--
-- Correção: fixa `SET search_path = public` na function e qualifica a
-- tabela como `public.profiles` (redundante com o search_path, mas remove
-- qualquer ambiguidade). Mantém tudo que já existia no banco (role,
-- timestamps, ON CONFLICT, o bloco EXCEPTION) - o objetivo aqui é só
-- consertar a resolução do nome da tabela, não mudar o comportamento já
-- validado em produção.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  INSERT INTO public.profiles (id, name, email, avatar_url, role, created_at, updated_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NULL),
    'hospede',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'Error in handle_new_user: %', SQLERRM;
    RETURN NEW;
END;
$function$;

-- Backfill: os 2 usuários que já tinham logado e ficado sem perfil antes
-- desta correção (a trigger só dispara em INSERT novo em auth.users, não
-- retroativamente - por isso precisam ser inseridos manualmente uma vez).
INSERT INTO profiles (id, name, email, avatar_url, role, created_at, updated_at)
SELECT id, COALESCE(raw_user_meta_data->>'full_name', ''), COALESCE(email, ''),
       COALESCE(raw_user_meta_data->>'avatar_url', NULL), 'hospede', NOW(), NOW()
FROM auth.users
WHERE id IN ('9857d8be-3204-4bc6-b90c-b5035319ce81', '00edcda3-9c32-41b0-9501-3f590e7ddd5e')
ON CONFLICT (id) DO NOTHING;

-- Verificação pós-aplicação (rodar no SQL Editor):
-- SELECT id, name, email, role FROM profiles;
-- Deve devolver 4 linhas: Junior Prado, Deusmair Junio Souza Prado,
-- Ian_ Couto e Thiago Patrick.
