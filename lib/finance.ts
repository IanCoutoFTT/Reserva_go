// Resumo financeiro do painel do admin (aba "Financeiro"). Funções puras: recebem as
// linhas de `payments` (que o admin pode ler, migração 013) e devolvem os totais.
// A divisão entre anfitrião e plataforma já vem calculada pelo banco em cada linha.

export type FinanceMethod = 'pix' | 'card';

export interface FinanceRow {
  id: string;
  status: string; // aguardando | pago | expirado | falhou
  amount: number;
  hostAmount: number;
  platformFee: number;
  paidAt: string | null;
  createdAt: string;
  booking: { status: string; method: FinanceMethod | null; title: string } | null;
}

export interface MethodTotals {
  count: number;
  total: number;
}

export interface FinanceSummary {
  paidCount: number;
  /** Tudo que entrou (pagamentos confirmados). */
  paidTotal: number;
  /** Fica com a plataforma: taxa de serviço. */
  platformTotal: number;
  /** Vai para os anfitriões: as diárias. */
  hostTotal: number;
  avgTicket: number;
  pendingCount: number;
  pendingTotal: number;
  expiredCount: number;
  /** Pagos cuja reserva foi cancelada depois: o dinheiro entrou e é preciso devolver. */
  toRefundCount: number;
  toRefundTotal: number;
  byMethod: Record<FinanceMethod, MethodTotals>;
  recent: FinanceRow[];
}

type Raw = Record<string, unknown> | null | undefined;

const first = (v: unknown): Raw => (Array.isArray(v) ? (v[0] as Raw) : (v as Raw));
const money = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
export const roundMoney = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;

/** Linha crua do PostgREST (com bookings/properties embutidos, objeto ou lista) -> FinanceRow. */
export function toFinanceRow(raw: Record<string, unknown>): FinanceRow {
  const b = first(raw.bookings);
  const prop = first(b?.properties);
  const method = b?.pay_method === 'pix' || b?.pay_method === 'card' ? (b.pay_method as FinanceMethod) : null;
  return {
    id: String(raw.id ?? ''),
    status: String(raw.status ?? ''),
    amount: money(raw.amount),
    hostAmount: money(raw.host_amount),
    platformFee: money(raw.platform_fee),
    paidAt: typeof raw.paid_at === 'string' ? raw.paid_at : null,
    createdAt: typeof raw.created_at === 'string' ? raw.created_at : '',
    booking: b ? { status: String(b.status ?? ''), method, title: typeof prop?.title === 'string' ? prop.title : 'Cabana' } : null,
  };
}

export function summarizeFinance(rows: FinanceRow[], recentLimit = 10): FinanceSummary {
  const paid = rows.filter((r) => r.status === 'pago');
  const pending = rows.filter((r) => r.status === 'aguardando');
  const refund = paid.filter((r) => r.booking?.status === 'cancelada');
  const sum = (list: FinanceRow[], pick: (r: FinanceRow) => number) => roundMoney(list.reduce((s, r) => s + pick(r), 0));

  const byMethod: Record<FinanceMethod, MethodTotals> = { pix: { count: 0, total: 0 }, card: { count: 0, total: 0 } };
  for (const r of paid) {
    const m = r.booking?.method;
    if (m) {
      byMethod[m].count += 1;
      byMethod[m].total = roundMoney(byMethod[m].total + r.amount);
    }
  }

  const paidTotal = sum(paid, (r) => r.amount);
  return {
    paidCount: paid.length,
    paidTotal,
    platformTotal: sum(paid, (r) => r.platformFee),
    hostTotal: sum(paid, (r) => r.hostAmount),
    avgTicket: paid.length ? roundMoney(paidTotal / paid.length) : 0,
    pendingCount: pending.length,
    pendingTotal: sum(pending, (r) => r.amount),
    expiredCount: rows.filter((r) => r.status === 'expirado' || r.status === 'falhou').length,
    toRefundCount: refund.length,
    toRefundTotal: sum(refund, (r) => r.amount),
    byMethod,
    recent: [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, recentLimit),
  };
}

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pago: 'Pago',
  aguardando: 'Aguardando',
  expirado: 'Expirado',
  falhou: 'Falhou',
};
