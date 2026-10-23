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
