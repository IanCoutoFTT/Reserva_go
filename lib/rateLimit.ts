// Limite de envio (migração 017). O banco recusa o excesso com uma mensagem que começa
// com "Limite de envio:"; aqui o app a reconhece para mostrar o MOTIVO à pessoa, em vez
// do aviso genérico de "não foi possível enviar".

const PREFIX = 'Limite de envio:';

/** Texto amigável se o erro for de limite de envio; senão null (e quem chama usa o aviso de sempre). */
export function rateLimitMessage(error: string | null | undefined): string | null {
  if (typeof error !== 'string') return null;
  const i = error.indexOf(PREFIX);
  if (i < 0) return null;
  const text = error.slice(i + PREFIX.length).trim();
  if (!text) return null;
  return text.charAt(0).toUpperCase() + text.slice(1);
}
