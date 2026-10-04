-- ============================================================
-- FIX: profiles_public_read não estava escondendo contas excluídas
-- STATUS: PROPOSTO — ainda NÃO aplicado no banco. Rode este arquivo inteiro
-- no SQL Editor do Supabase (Dashboard → SQL Editor → New query → colar →
-- Run) pra aplicar de verdade. Depois de rodar, atualize esta linha pra
-- "JÁ APLICADO", igual o padrão do 001_....sql.
-- ============================================================
-- Achado em teste manual do botão "Excluir conta" (03/09/2026): depois do
-- soft delete (profiles.deleted_at preenchido), o perfil continuava visível
-- numa consulta pública comum (anon key), mesmo o supabase/schema.sql
-- declarando "profiles_public_read" com `USING (deleted_at IS NULL)`.
-- Confirmado com curl direto na REST API, sem passar pelo app:
--
--   curl "$SUPABASE_URL/rest/v1/profiles?id=eq.<uuid>&select=id,deleted_at" \
--     -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
--   -> devolveu a linha normalmente, com deleted_at preenchido.
--
-- Ou seja: a policy que está rodando de verdade no banco não bate com o que
-- o schema.sql descreve (provavelmente uma versão antiga da policy, de antes
-- do filtro deleted_at existir, nunca foi substituída de fato no banco).
--
-- Correção: DROP + CREATE de novo (idempotente - garante que qualquer versão
-- antiga da policy seja substituída, não só "criada se não existir").
-- ============================================================

DROP POLICY IF EXISTS "profiles_public_read" ON profiles;

CREATE POLICY "profiles_public_read" ON profiles
  FOR SELECT USING (deleted_at IS NULL);

-- ── Conferência pós-aplicação ──────────────────────────────
-- Depois de rodar o bloco acima, use isto (com a ANON key, não a
-- service_role) pra confirmar que a policy nova está valendo: deve devolver
-- 0 linhas pra qualquer conta com deleted_at preenchido.
--
--   select id, email, deleted_at from profiles where deleted_at is not null;
--   -- (rodando como anon/authenticated comum, não como superusuário do SQL
--   --  Editor - o SQL Editor roda como superusuário e ignora RLS, então
--   --  esse teste só vale de verdade via REST API com a anon key)
