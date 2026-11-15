// Indicador "digitando..." do chat. Usa o canal de broadcast do Realtime: não grava nada no banco,
// só avisa a outra ponta enquanto alguém digita.

/** No máximo um aviso a cada tanto tempo, para não inundar o canal a cada letra. */
export const TYPING_THROTTLE_MS = 2500;
/** Quanto tempo o "digitando..." fica na tela depois do último aviso. */
export const TYPING_TTL_MS = 4000;

export function shouldSendTyping(lastSentAt: number, now: number, throttleMs: number = TYPING_THROTTLE_MS): boolean {
  return now - lastSentAt >= throttleMs;
}
