// Dados dos gráficos do painel do admin. Funções puras: recebem as linhas e devolvem uma
// série por dia (do mais antigo para o de hoje), no horário do aparelho.

export interface DayPoint {
  /** YYYY-MM-DD (dia local). */
  key: string;
  /** "dd/mm". */
  label: string;
  value: number;
}

const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Os últimos `days` dias, terminando em hoje, do mais antigo ao mais recente. */
export function lastDays(days: number, now: Date = new Date()): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    out.push({ key: dayKey(d), label: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}` });
  }
  return out;
}

function localDayOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : dayKey(d);
}

/** Total recebido por dia (só pagamentos "pago", pelo dia do pagamento). */
export function revenueByDay(
  rows: { status: string; amount: number; paidAt: string | null }[],
  days = 7,
  now: Date = new Date()
): DayPoint[] {
  const series = lastDays(days, now).map((d) => ({ ...d, value: 0 }));
  const index = new Map(series.map((p, i) => [p.key, i]));
  for (const r of rows) {
    if (r.status !== 'pago') continue;
    const i = index.get(localDayOf(r.paidAt) ?? '');
    if (i !== undefined) series[i].value = Math.round((series[i].value + r.amount) * 100) / 100;
  }
  return series;
}

/** Quantidade de itens criados por dia (por exemplo, reservas pela data de criação). */
export function countByDay(isoDates: (string | null | undefined)[], days = 7, now: Date = new Date()): DayPoint[] {
  const series = lastDays(days, now).map((d) => ({ ...d, value: 0 }));
  const index = new Map(series.map((p, i) => [p.key, i]));
  for (const iso of isoDates) {
    const i = index.get(localDayOf(iso) ?? '');
    if (i !== undefined) series[i].value += 1;
  }
  return series;
}

export function seriesTotal(series: DayPoint[]): number {
  return Math.round(series.reduce((s, p) => s + p.value, 0) * 100) / 100;
}
