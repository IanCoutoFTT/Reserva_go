// Datas como texto "YYYY-MM-DD" (o mesmo formato das colunas DATE do banco), sem fuso:
// um período é [início, fim), ou seja, o dia do fim fica livre (como o check-out de uma reserva).

const pad = (n: number) => String(n).padStart(2, '0');

export function isoOf(year: number, month0: number, day: number): string {
  return `${year}-${pad(month0 + 1)}-${pad(day)}`;
}

export function toISO(d: Date): string {
  return isoOf(d.getFullYear(), d.getMonth(), d.getDate());
}

export function parseISO(iso: string): { year: number; month0: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const year = Number(m[1]);
  const month0 = Number(m[2]) - 1;
  const day = Number(m[3]);
  const d = new Date(year, month0, day);
  return d.getFullYear() === year && d.getMonth() === month0 && d.getDate() === day ? { year, month0, day } : null;
}

export function addDays(iso: string, days: number): string {
  const p = parseISO(iso);
  if (!p) return iso;
  return toISO(new Date(p.year, p.month0, p.day + days));
}

/** Noites entre duas datas (saída - entrada). */
export function nightsBetween(start: string, end: string): number {
  const a = parseISO(start);
  const b = parseISO(end);
  if (!a || !b) return 0;
  const ms = Date.UTC(b.year, b.month0, b.day) - Date.UTC(a.year, a.month0, a.day);
  return Math.round(ms / 86_400_000);
}

/** "2026-12-25" -> "25/12/2026". */
export function formatBR(iso: string): string {
  const p = parseISO(iso);
  return p ? `${pad(p.day)}/${pad(p.month0 + 1)}/${p.year}` : '';
}

export type Range = { start: string; end: string };

/** O dia cai dentro de algum período [início, fim)? */
export function isInRanges(iso: string, ranges: readonly Range[]): boolean {
  return ranges.some((r) => iso >= r.start && iso < r.end);
}

/** O período [start, end) bate em algum dos períodos indisponíveis? */
export function overlapsRanges(start: string, end: string, ranges: readonly Range[]): boolean {
  return ranges.some((r) => start < r.end && r.start < end);
}

/** Células do mês para um calendário de segunda... domingo: null = espaço antes do dia 1. */
export function monthCells(year: number, month0: number): (string | null)[] {
  const first = new Date(year, month0, 1);
  const lead = first.getDay(); // domingo = 0
  const total = new Date(year, month0 + 1, 0).getDate();
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= total; d++) cells.push(isoOf(year, month0, d));
  return cells;
}

export const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/**
 * Toque num dia do seletor de período: o primeiro toque define o início; o segundo, o fim (se for
 * depois do início e o período não cobrir um dia indisponível); um toque antes do início, ou com
 * período já completo, recomeça. Devolve o novo estado.
 */
export function pickDay(
  current: { start: string | null; end: string | null },
  day: string,
  unavailable: readonly Range[] = []
): { start: string | null; end: string | null } {
  const { start, end } = current;
  if (!start || end || day <= start) return { start: day, end: null };
  if (overlapsRanges(start, day, unavailable)) return { start: day, end: null };
  return { start, end: day };
}
