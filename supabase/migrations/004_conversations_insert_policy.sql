-- ============================================================
-- Migração 004: policy de INSERT em "conversations"
-- ============================================================
--
-- Contexto (branch feature/contato-denuncia): o botão "Contato" no card do
-- anfitrião em app/details.tsx não tinha nenhum onPress. Pra funcionar, ele
-- precisa poder criar uma conversa nova (services/messageService.ts,
-- getOrCreateConversation()) quando o hóspede fala com o anfitrião pela
-- primeira vez.
--
-- Conferido em supabase/schema.sql: a tabela `conversations` só tinha UMA
-- policy no total - "conversations_participant_read" (SELECT). Não existe
-- (e nunca existiu) nenhuma policy de INSERT. Com RLS habilitado (está,
-- desde a correção registrada no PROJETO.md item 11) e nenhuma policy de
-- INSERT, o Postgres nega por padrão - ou seja, hoje NENHUM client
-- consegue criar uma conversa nova, nem esse fluxo nem nenhum outro.
--
-- Esta migração adiciona a policy que faltava, no mesmo formato da que já
-- existe pra leitura (mesma condição: guest_id ou host_id = auth.uid()).

CREATE POLICY "conversations_participant_insert"
  ON conversations FOR INSERT
  WITH CHECK (guest_id = auth.uid() OR host_id = auth.uid());

-- Verificação pós-aplicação (rodar no SQL Editor):
-- SELECT policyname, cmd, with_check
-- FROM pg_policies
-- WHERE tablename = 'conversations';
-- Deve devolver 2 linhas agora: "conversations_participant_read" (SELECT)
-- e "conversations_participant_insert" (INSERT).
