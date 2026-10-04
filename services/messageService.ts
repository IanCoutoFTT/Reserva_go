import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { ConversationWithParticipants, Message, NewMessage, ServiceResult, toResult } from './types';

// Acesso a `conversations` e `messages` (supabase/schema.sql). Realtime já
// está habilitado pra `messages` (ALTER PUBLICATION supabase_realtime ADD
// TABLE messages, schema.sql linha 665).

export async function getConversations(userId: string): Promise<ServiceResult<ConversationWithParticipants[]>> {
  const { data, error } = await supabase
    .from('conversations')
    .select('*, guest:profiles!conversations_guest_id_fkey(name, avatar_url), host:profiles!conversations_host_id_fkey(name, avatar_url)')
    .or(`guest_id.eq.${userId},host_id.eq.${userId}`)
    .order('last_message_at', { ascending: false });
  return toResult(data as unknown as ConversationWithParticipants[] | null, error);
}

/** IDs de conversas com pelo menos 1 mensagem não lida recebida por esse usuário (RLS já restringe às conversas dele). */
export async function getUnreadConversationIds(userId: string): Promise<ServiceResult<string[]>> {
  const { data, error } = await supabase
    .from('messages')
    .select('conversation_id')
    .neq('sender_id', userId)
    .is('read_at', null);

  if (error) return toResult<string[]>(null, error);
  const ids = Array.from(new Set((data ?? []).map((m: { conversation_id: string }) => m.conversation_id)));
  return { data: ids, error: null };
}

/**
 * Acha uma conversa já existente entre esse hóspede e anfitrião (pro mesmo
 * anúncio, se informado) ou cria uma nova - usado pelo botão "Contato" em
 * app/details.tsx, que antes não tinha nenhuma função pra isso (só dava pra
 * listar/enviar mensagem em conversas que já existiam). Devolve o id da
 * conversa, pra navegar direto pra ela em app/(tabs)/messages.tsx.
 *
 * Precisa da policy `conversations_participant_insert` (nova, ver
 * supabase/migrations/004_conversations_insert_policy.sql) - antes dessa
 * migração, conversations só tinha policy de leitura, nenhuma de escrita.
 */
export async function getOrCreateConversation(
  guestId: string,
  hostId: string,
  propertyId?: string | null
): Promise<ServiceResult<string>> {
  let query = supabase.from('conversations').select('id').eq('guest_id', guestId).eq('host_id', hostId);
  if (propertyId) query = query.eq('property_id', propertyId);

  const { data: existing, error: findError } = await query.limit(1);
  if (findError) return { data: null, error: findError.message };
  if (existing && existing.length > 0) return { data: existing[0].id, error: null };

  const { data: created, error: createError } = await supabase
    .from('conversations')
    .insert({ guest_id: guestId, host_id: hostId, property_id: propertyId ?? null })
    .select('id')
    .single();

  if (createError) return { data: null, error: createError.message };
  return { data: created.id, error: null };
}

export async function getMessages(conversationId: string): Promise<ServiceResult<Message[]>> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  return toResult(data, error);
}

export async function sendMessage(dados: NewMessage): Promise<ServiceResult<Message>> {
  // messages_last_trigger (schema.sql linha 294) já atualiza
  // conversations.last_message/last_message_at sozinho.
  const { data, error } = await supabase.from('messages').insert(dados).select().single();
  return toResult(data, error);
}

/**
 * Assina novas mensagens em tempo real. O parâmetro `userId` identifica o
 * canal (não filtra no Postgres - `messages` não tem coluna de usuário
 * direta, só `conversation_id`/`sender_id`); quem realmente restringe quais
 * INSERTs este usuário recebe é a policy `messages_participant_read`
 * (schema.sql linha 619), que o Realtime do Supabase respeita.
 * Retorna a função de unsubscribe.
 */
export function subscribeToMessages(
  userId: string,
  callback: (message: Message) => void
): () => void {
  const topic = `messages:${userId}`;

  // Bug real encontrado ao vivo (branch feature/mensagens, 07/09/2026, sem
  // relação com o resto das mudanças desta branch): trocar de conta (logout
  // + login Google de novo) faz o React reconectar os effects da tela
  // inteira depois do app voltar do navegador externo do OAuth - esse effect
  // roda de novo sem o cleanup anterior (o `return () => removeChannel(...)`
  // lá embaixo) ter sido chamado primeiro. supabase-js reaproveita o channel
  // já existente pro mesmo tópico em vez de criar um novo, e chamar `.on()`
  // de novo nele depois que ele já foi assinado quebra com "cannot add
  // `postgres_changes` callbacks ... after `subscribe()`." Remover qualquer
  // channel remanescente com esse tópico antes de assinar de novo deixa a
  // function idempotente, não importa quantas vezes o effect rodar sem
  // limpeza.
  const stale = supabase.getChannels().find((c) => c.topic === `realtime:${topic}`);
  if (stale) supabase.removeChannel(stale);

  const channel = supabase
    .channel(topic)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages' },
      (payload: RealtimePostgresChangesPayload<Message>) => {
        callback(payload.new as Message);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export async function markAsRead(ids: string[]): Promise<ServiceResult<Message[]>> {
  if (ids.length === 0) return { data: [], error: null };
  const { data, error } = await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .in('id', ids)
    .select();
  return toResult(data, error);
}
