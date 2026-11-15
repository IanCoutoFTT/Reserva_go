import { useCallback, useEffect, useRef, useState } from 'react';
import { joinTyping, TypingChannel } from '../services/typingService';
import { shouldSendTyping, TYPING_TTL_MS } from './typing';

/**
 * Indicador "digitando..." de uma conversa. `otherTyping` fica true por alguns segundos depois de
 * cada aviso da outra pessoa; `notifyTyping` avisa a outra ponta (com limite de frequência).
 * Sem conversa ou sem usuário, não entra em canal nenhum.
 */
export function useTypingIndicator(conversationId: string | null, userId: string | null) {
  const [otherTyping, setOtherTyping] = useState(false);
  const channelRef = useRef<TypingChannel | null>(null);
  const lastSentRef = useRef(0);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setOtherTyping(false);
    lastSentRef.current = 0;
    if (!conversationId || !userId) return;

    const channel = joinTyping(conversationId, userId, () => {
      setOtherTyping(true);
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
      clearTimerRef.current = setTimeout(() => setOtherTyping(false), TYPING_TTL_MS);
    });
    channelRef.current = channel;

    return () => {
      channel.leave();
      channelRef.current = null;
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    };
  }, [conversationId, userId]);

  const notifyTyping = useCallback(() => {
    const now = Date.now();
    if (!channelRef.current || !shouldSendTyping(lastSentRef.current, now)) return;
    lastSentRef.current = now;
    channelRef.current.sendTyping();
  }, []);

  return { otherTyping, notifyTyping };
}
