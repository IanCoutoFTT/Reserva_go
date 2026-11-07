import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';

/**
 * Chama `callback` toda vez que o app volta para o primeiro plano (tela
 * desbloqueada, voltou de outro app). O Android derruba a conexão em tempo real
 * do Supabase quando o app fica em segundo plano e eventos perdidos nesse
 * intervalo nunca chegam depois, então quem depende do Realtime (mensagens,
 * notificações) precisa buscar de novo ao voltar.
 */
export function useOnAppActive(callback: () => void, enabled = true) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled) return;

    let previous: AppStateStatus = AppState.currentState;
    const subscription = AppState.addEventListener('change', (next) => {
      if (previous !== 'active' && next === 'active') callbackRef.current();
      previous = next;
    });

    return () => subscription.remove();
  }, [enabled]);
}
