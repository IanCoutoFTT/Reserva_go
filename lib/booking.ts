import type { BookingStatus } from '../services/types';

// Nada no banco grava 'realizada' sozinho: a reserva fica como 'reservada' para
// sempre. Quem exibe ou conta estadias concluídas calcula pela data, com a mesma
// regra que a policy de avaliações usa no Supabase (check_out <= hoje).

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Data de hoje no horário do aparelho, no formato YYYY-MM-DD (o mesmo das colunas DATE). */
export function todayISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** A estadia já terminou quando o check-out é hoje ou antes. */
export function stayEnded(checkOut: string, now: Date = new Date()): boolean {
  return checkOut <= todayISO(now);
}

/** Status que o usuário enxerga: cancelada continua cancelada; reservada com check-out vencido vira realizada. */
export function effectiveStatus(
  booking: { status: BookingStatus; check_out: string },
  now: Date = new Date()
): BookingStatus {
  if (booking.status === 'cancelada') return 'cancelada';
  if (booking.status === 'realizada') return 'realizada';
  return stayEnded(booking.check_out, now) ? 'realizada' : 'reservada';
}

/**
 * O hóspede só pode cancelar até o dia do check-in (o banco recusa depois -
 * migração 009, achado T-05 do 3º teste de segurança).
 */
export function canCancelStay(checkIn: string, now: Date = new Date()): boolean {
  return checkIn >= todayISO(now);
}

export type BookingTab = 'confirmadas' | 'canceladas';

/**
 * Minhas Viagens separa as reservas em duas abas: quem não quer ver canceladas
 * sem necessidade fica só na primeira. "Canceladas" reúne apenas o status
 * cancelada; todo o resto (reservada, em andamento, já realizada) é "Confirmadas".
 */
export function bookingTabOf(status: string): BookingTab {
  return status === 'cancelada' ? 'canceladas' : 'confirmadas';
}

/**
 * Texto da confirmação ao cancelar. Reserva JÁ PAGA avisa que esta versão não devolve o
 * valor automaticamente (Termos de Serviço): a equipe trata o caso depois.
 */
export function cancelConfirmMessage(propertyTitle: string, paid: boolean): string {
  const base = `Tem certeza que deseja cancelar a reserva de "${propertyTitle}"?`;
  return paid
    ? `${base}\n\nEssa reserva já foi paga. Nesta versão o valor não é devolvido automaticamente: a equipe analisa o caso depois do cancelamento.`
    : base;
}

// ── Não comparecimento (no-show, migração 018) ───────────────

/** O anfitrião registrou que o hóspede não apareceu. A situação no banco continua "reservada". */
export function isNoShow(booking: { no_show_at?: string | null }): boolean {
  return !!booking.no_show_at;
}

/**
 * O anfitrião pode marcar o não comparecimento: reserva ativa, ainda não marcada e já
 * passado o dia do check-in (no dia, o hóspede ainda pode chegar). O banco repete a regra.
 */
export function canMarkNoShow(
  booking: { status: BookingStatus; check_in: string; no_show_at?: string | null },
  now: Date = new Date()
): boolean {
  return booking.status === 'reservada' && !isNoShow(booking) && todayISO(now) > booking.check_in;
}

/** O dono pode desfazer a marcação por até 48 horas (o admin, sempre). */
export function canClearNoShow(booking: { no_show_at?: string | null }, now: Date = new Date()): boolean {
  if (!booking.no_show_at) return false;
  const marked = new Date(booking.no_show_at).getTime();
  return Number.isFinite(marked) && now.getTime() - marked <= 48 * 60 * 60 * 1000;
}

// ── Pagamento pendente (migração 019) ────────────────────────

/**
 * A reserva está aguardando pagamento: ativa, não paga e com cobrança aberta, ou que exige
 * pagamento mas cuja cobrança ainda nem nasceu (o botão "Pagar agora" cria a cobrança).
 */
export function isAwaitingPayment(b: {
  active: boolean;
  noShow?: boolean;
  paymentStatus?: string | null;
  paymentRequired?: boolean;
}): boolean {
  if (!b.active || b.noShow || b.paymentStatus === 'pago') return false;
  return b.paymentStatus === 'aguardando' || (!!b.paymentRequired && !b.paymentStatus);
}

/** Rótulo do pagamento na lista do anfitrião: "Pago", "Aguardando pagamento" ou vazio. */
export function hostPaymentLabel(b: { status: string; paymentStatus?: string | null; paymentRequired?: boolean }): string {
  if (b.paymentStatus === 'pago') return 'Pago';
  if (b.status === 'cancelada') return '';
  if (b.paymentStatus === 'aguardando' || (!!b.paymentRequired && !b.paymentStatus)) return 'Aguardando pagamento';
  return '';
}
