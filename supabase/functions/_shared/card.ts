// Regras puras do pagamento por cartão (Stripe). Sem Deno, sem rede, sem banco:
// rodam nas Edge Functions e nos testes do Jest, como _shared/pix.ts.

import { PIX_EXPIRATION_MINUTES, timingSafeEqual } from './pix.ts';

/** O cartão tem o mesmo prazo do Pix: 30 min. Depois a reserva é cancelada (expire_pix_payments). */
export const CARD_EXPIRATION_MINUTES = PIX_EXPIRATION_MINUTES;

/** Quanto o webhook aceita de diferença entre o relógio da Stripe e o nosso (padrão recomendado pela Stripe). */
export const STRIPE_TOLERANCE_SECONDS = 300;

/** Reais -> centavos, sem erro de ponto flutuante (627.4 vira 62740, não 62739). */
export function toCents(reais: number): number {
  return Math.round((reais + Number.EPSILON) * 100);
}

/**
 * Chave de idempotência da criação do PaymentIntent: a mesma reserva, dentro da mesma
 * janela de 30 min, nunca gera duas cobranças (duplo toque no botão). Passada a janela
 * (cobrança vencida), nasce uma chave nova.
 */
export function intentIdempotencyKey(bookingId: string, now: Date): string {
  const windowMs = CARD_EXPIRATION_MINUTES * 60_000;
  return `rg-${bookingId}-${Math.floor(now.getTime() / windowMs)}`;
}

export interface StripeSignature {
  timestamp: number;
  signatures: string[];
}

/** "t=1700000000,v1=abc,v1=def" -> { timestamp, signatures }. null se não for um cabeçalho válido. */
export function parseStripeSignature(header: string | null | undefined): StripeSignature | null {
  if (typeof header !== 'string' || header.length === 0 || header.length > 1000) return null;
  let timestamp = NaN;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === 't') timestamp = Number(value);
    else if (key === 'v1' && /^[0-9a-f]{64}$/i.test(value)) signatures.push(value.toLowerCase());
  }
  if (!Number.isInteger(timestamp) || timestamp <= 0 || signatures.length === 0) return null;
  return { timestamp, signatures };
}

/**
 * Confere a assinatura do webhook da Stripe: HMAC-SHA256 de "<timestamp>.<corpo cru>" com
 * o segredo do endpoint (whsec_...). Recusa também mensagens antigas demais (repetição).
 * `hmacHex` vem de fora (Web Crypto no Deno, crypto do Node nos testes).
 */
export async function verifyStripeSignature(
  rawBody: string,
  header: string | null | undefined,
  secret: string,
  nowSeconds: number,
  hmacHex: (key: string, message: string) => Promise<string>,
  toleranceSeconds: number = STRIPE_TOLERANCE_SECONDS
): Promise<boolean> {
  if (!secret) return false;
  const parsed = parseStripeSignature(header);
  if (!parsed) return false;
  if (Math.abs(nowSeconds - parsed.timestamp) > toleranceSeconds) return false;
  const expected = (await hmacHex(secret, `${parsed.timestamp}.${rawBody}`)).toLowerCase();
  // Compara com todas as assinaturas v1 (a Stripe manda mais de uma na troca de segredo) sem parar na primeira.
  let match = false;
  for (const sig of parsed.signatures) if (timingSafeEqual(sig, expected)) match = true;
  return match;
}
