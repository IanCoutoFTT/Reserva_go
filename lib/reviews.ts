// Resposta do anfitrião às avaliações (migração 020). Regras puras, repetidas pelo banco.

export const REPLY_MAX = 500;
export const REPLY_EDIT_HOURS = 24;

/** Texto limpo (sem espaços nas pontas) ou o motivo de não aceitar. */
export function validateReply(text: string): { ok: true; value: string } | { ok: false; error: string } {
  const value = text.trim();
  if (!value) return { ok: false, error: 'Escreva a resposta.' };
  if (value.length > REPLY_MAX) return { ok: false, error: `A resposta pode ter no máximo ${REPLY_MAX} caracteres.` };
  return { ok: true, value };
}

/**
 * O dono da cabana pode responder (ou corrigir) a avaliação: ainda sem resposta, ou com resposta de
 * menos de 24 horas.
 */
export function canReplyToReview(
  r: { host_reply?: string | null; host_replied_at?: string | null },
  isOwner: boolean,
  now: Date = new Date()
): boolean {
  if (!isOwner) return false;
  if (!r.host_reply) return true;
  const at = r.host_replied_at ? new Date(r.host_replied_at).getTime() : NaN;
  return Number.isFinite(at) && now.getTime() - at <= REPLY_EDIT_HOURS * 60 * 60 * 1000;
}
