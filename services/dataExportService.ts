import { buildDataExport, type RawUserData } from '../lib/dataExport';
import { supabase } from '../lib/supabase';
import { ServiceResult } from './types';

// "Baixar meus dados" (LGPD). Só LÊ, e só o que o próprio usuário já consegue ler pelas
// regras de acesso (RLS) do banco. Nada é gravado e nada sai do aparelho sozinho: o
// arquivo só é entregue à tela de compartilhamento do Android quando a pessoa pede.

const LIMIT = 2000;

async function rows(query: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Record<string, unknown>[]> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data as Record<string, unknown>[] | null) ?? [];
}

export async function exportMyData(userId: string): Promise<ServiceResult<Record<string, unknown>>> {
  try {
    // Tabelas opcionais (só existem com o pagamento ligado): falha nelas não derruba o resto.
    const optional = async (q: PromiseLike<{ data: unknown; error: { message: string } | null }>) => {
      try {
        return await rows(q);
      } catch {
        return [];
      }
    };

    const [profileRes, properties, bookings, reviews, favorites, notifications, reports, conversations, payoutRes] = await Promise.all([
      supabase.rpc('get_my_profile').single(),
      rows(supabase.from('properties').select('*').eq('owner_id', userId).limit(LIMIT)),
      rows(supabase.from('bookings').select('*').eq('guest_id', userId).limit(LIMIT)),
      rows(supabase.from('reviews').select('*').eq('author_id', userId).limit(LIMIT)),
      rows(supabase.from('favorites').select('*').eq('user_id', userId).limit(LIMIT)),
      rows(supabase.from('notifications').select('*').eq('user_id', userId).limit(LIMIT)),
      rows(supabase.from('reports').select('*').eq('reporter_id', userId).limit(LIMIT)),
      rows(supabase.from('conversations').select('id').or(`guest_id.eq.${userId},host_id.eq.${userId}`).limit(LIMIT)),
      supabase.from('payout_accounts').select('full_name, document, pix_key_type, pix_key').eq('user_id', userId).maybeSingle(),
    ]);

    const bookingIds = bookings.map((b) => String(b.id));
    const conversationIds = conversations.map((c) => String(c.id));

    const [payments, messages] = await Promise.all([
      bookingIds.length ? optional(supabase.from('payments').select('*').in('booking_id', bookingIds).limit(LIMIT)) : Promise.resolve([]),
      conversationIds.length
        ? rows(supabase.from('messages').select('*').eq('sender_id', userId).in('conversation_id', conversationIds).limit(LIMIT))
        : Promise.resolve([]),
    ]);

    const raw: RawUserData = {
      profile: (profileRes as { data?: Record<string, unknown> | null }).data ?? null,
      properties,
      bookings,
      payments,
      reviews,
      favorites,
      notifications,
      messages,
      reports,
      payout: (payoutRes as { data?: RawUserData['payout'] }).data ?? null,
    };
    return { data: buildDataExport(raw), error: null };
  } catch (e) {
    console.log('[dataExport] falhou ->', e instanceof Error ? e.message : e);
    return { data: null, error: 'Não foi possível reunir seus dados agora. Tente novamente.' };
  }
}
