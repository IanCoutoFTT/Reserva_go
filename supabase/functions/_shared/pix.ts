// Regras puras do pagamento Pix. Sem Deno, sem rede, sem banco: por isso rodam
// tanto nas Edge Functions quanto nos testes do Jest (npm test).

/** Quanto tempo o hóspede tem para pagar o Pix. Depois disso a reserva é cancelada (expire_pix_payments, migração 013). */
export const PIX_EXPIRATION_MINUTES = 30;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface Split {
  hostAmount: number;
  platformFee: number;
}

/**
 * Divisão do valor pago. Espelha register_pix_charge (migração 013), que é quem
 * vale: o banco recalcula e grava. Aqui serve para dizer ao provedor quanto
 * repassar ao anfitrião no momento de criar a cobrança.
 *   anfitrião  = noites x preço da noite (nunca mais que o total)
 *   plataforma = total - anfitrião (taxa de serviço, já com o desconto do Pix)
 */
export function computeSplit(nights: number, pricePerNight: number, total: number): Split {
  const hostAmount = Math.min(roundMoney(nights * pricePerNight), roundMoney(total));
  return { hostAmount, platformFee: roundMoney(total - hostAmount) };
}

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/** Valida CPF pelos dois dígitos verificadores (aceita pontos e traço). */
export function isValidCpf(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (len: number): number => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

/** Compara dois textos sem parar no primeiro caractere diferente (token do webhook). */
export function timingSafeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export function pixExpiry(now: Date, minutes: number = PIX_EXPIRATION_MINUTES): Date {
  return new Date(now.getTime() + minutes * 60_000);
}
