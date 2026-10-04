import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { AppNotification, ServiceResult, toResult } from './types';

// Acesso à tabela `notifications` (supabase/schema.sql) + as duas funções
// auxiliares que já existem no banco pra isso: get_unread_notifications_count
// e mark_all_notifications_read. Realtime já habilitado pra `notifications`
// (ALTER PUBLICATION supabase_realtime ADD TABLE notifications, schema.sql).

export async function getNotifications(userId: string): Promise<ServiceResult<AppNotification[]>> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return toResult(data, error);
}

export async function getUnreadCount(userId: string): Promise<ServiceResult<number>> {
  const { data, error } = await supabase.rpc('get_unread_notifications_count', { p_user_id: userId });
  return toResult(data as number | null, error);
}

export async function markAllAsRead(userId: string): Promise<ServiceResult<null>> {
  const { error } = await supabase.rpc('mark_all_notifications_read', { p_user_id: userId });
  return toResult<null>(null, error);
}

/**
 * Marca como lidas as notificações ligadas a mensagens específicas
 * (notifications.message_id) - usado por messages.tsx ao abrir uma
 * conversa, pra manter o contador do sino em sincronia com o que já foi
 * lido no chat, sem marcar notificações de OUTROS tipos como lidas.
 */
export async function markMessageNotificationsAsRead(messageIds: string[]): Promise<ServiceResult<null>> {
  if (messageIds.length === 0) return { data: null, error: null };
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .in('message_id', messageIds);
  return toResult<null>(null, error);
}

/** Marcar UMA notificação como lida não tem function própria no banco - update direto, coberto por notifications_own_update (RLS). */
export async function markAsRead(id: string): Promise<ServiceResult<AppNotification>> {
  const { data, error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', id)
    .select()
    .single();
  return toResult(data, error);
}

/**
 * Assina novas notificações em tempo real pro usuário (filtro server-side
 * via user_id=eq.<userId> - diferente de messages, notifications TEM a
 * coluna direto, não precisa depender só da RLS). Retorna o unsubscribe.
 */
export function subscribeToNotifications(
  userId: string,
  callback: (notification: AppNotification) => void
): () => void {
  const channel = supabase
    .channel(`notifications:${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      (payload: RealtimePostgresChangesPayload<AppNotification>) => {
        callback(payload.new as AppNotification);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
