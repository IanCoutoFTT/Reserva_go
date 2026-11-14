// Apoio da tela de pagamento Pix: chaves de liga/desliga e cálculos pequenos.

/**
 * O pagamento Pix só aparece quando o build é feito com EXPO_PUBLIC_PIX_ENABLED=true.
 * Desligado (padrão), a reserva funciona exatamente como antes: confirma na hora,
 * sem cobrar. Ligue só depois de aplicar a migração 013 e publicar as Edge Functions
 * (docs/pagamento-pix.md).
 */
export const PIX_ENABLED = process.env.EXPO_PUBLIC_PIX_ENABLED === 'true';

/** Mostra o botão "Simular pagamento (teste)". Só funciona com PIX_PROVIDER=mock no servidor. */
export const PIX_SIMULATION = process.env.EXPO_PUBLIC_PIX_SIMULATION === 'true';

/** Situação do Pix embutida numa reserva (objeto, lista ou vazio) -> "aguardando" | "pago" | ... | null. */
export function paymentStatusOf(embed: { status: string } | { status: string }[] | null | undefined): string | null {
  const first = Array.isArray(embed) ? embed[0] : embed;
  return first?.status ?? null;
}

/** Segundos que faltam até o vencimento (0 se já venceu). */
export function secondsLeft(expiresAtISO: string, now: Date = new Date()): number {
  const ms = new Date(expiresAtISO).getTime() - now.getTime();
  return Number.isFinite(ms) ? Math.max(0, Math.ceil(ms / 1000)) : 0;
}

/** 1830 -> "30:30". */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

/** Máscara de CPF enquanto digita: "52998224725" -> "529.982.247-25". */
export function formatCpf(input: string): string {
  const d = input.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}
