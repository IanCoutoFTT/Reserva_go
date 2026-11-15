import { supabase } from '../lib/supabase';

// Canal de broadcast por conversa (Supabase Realtime): quem digita avisa, a outra ponta mostra
// "digitando...". Nada é gravado no banco. O canal leva só o id de quem digita.

export interface TypingChannel {
  sendTyping: () => void;
  leave: () => void;
}

/** Entra no canal da conversa; `onOtherTyping` é chamado quando a OUTRA pessoa está digitando. */
export function joinTyping(conversationId: string, userId: string, onOtherTyping: () => void): TypingChannel {
  const channel = supabase.channel(`typing:${conversationId}`, { config: { broadcast: { self: false } } });
  channel
    .on('broadcast', { event: 'typing' }, (msg: { payload?: { userId?: string } }) => {
      if (msg?.payload?.userId && msg.payload.userId !== userId) onOtherTyping();
    })
    .subscribe();

  return {
    sendTyping: () => {
      void channel.send({ type: 'broadcast', event: 'typing', payload: { userId } });
    },
    leave: () => {
      void supabase.removeChannel(channel);
    },
  };
}
