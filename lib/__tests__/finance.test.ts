import { summarizeFinance, toFinanceRow, type FinanceRow } from '../finance';

const row = (over: Partial<FinanceRow> & { method?: 'pix' | 'card'; bookingStatus?: string } = {}): FinanceRow => {
  const { method = 'pix', bookingStatus = 'reservada', ...rest } = over;
  return {
    id: Math.random().toString(36).slice(2), status: 'pago', amount: 660, hostAmount: 600, platformFee: 60,
    paidAt: '2026-12-01T12:00:00Z', createdAt: '2026-12-01T11:50:00Z',
    booking: { status: bookingStatus, method, title: 'Chale' }, ...rest,
  };
};

describe('toFinanceRow', () => {
  it('lê a linha do PostgREST com a reserva e a cabana embutidas (objeto)', () => {
    const r = toFinanceRow({
      id: 'p1', status: 'pago', amount: '660.00', host_amount: 600, platform_fee: '60', paid_at: '2026-12-01T12:00:00Z', created_at: '2026-12-01T11:50:00Z',
      bookings: { status: 'reservada', pay_method: 'card', properties: { title: 'Cabana do Lago' } },
    });
    expect(r).toMatchObject({ id: 'p1', amount: 660, hostAmount: 600, platformFee: 60, booking: { status: 'reservada', method: 'card', title: 'Cabana do Lago' } });
  });

  it('aceita o embed como lista e tolera campos faltando', () => {
    const r = toFinanceRow({ id: 'p2', status: 'aguardando', amount: 100, bookings: [{ status: 'reservada', pay_method: 'pix', properties: [{ title: 'Chalé' }] }] });
    expect(r.booking).toEqual({ status: 'reservada', method: 'pix', title: 'Chalé' });
    expect(r.hostAmount).toBe(0);
    expect(r.paidAt).toBeNull();
    expect(toFinanceRow({ id: 'p3', status: 'pago', amount: 'abc' }).amount).toBe(0);
    expect(toFinanceRow({ id: 'p4', status: 'pago', amount: 1 }).booking).toBeNull();
  });

  it('forma de pagamento desconhecida vira null', () => {
    expect(toFinanceRow({ id: 'p5', status: 'pago', amount: 1, bookings: { status: 'reservada', pay_method: 'boleto' } }).booking?.method).toBeNull();
  });
});

describe('summarizeFinance', () => {
  it('sem pagamentos: tudo zerado', () => {
    const s = summarizeFinance([]);
    expect(s).toMatchObject({ paidCount: 0, paidTotal: 0, platformTotal: 0, hostTotal: 0, avgTicket: 0, pendingCount: 0, toRefundCount: 0, recent: [] });
    expect(s.byMethod).toEqual({ pix: { count: 0, total: 0 }, card: { count: 0, total: 0 } });
  });

  it('soma só o que foi pago: plataforma + anfitriões = total recebido', () => {
    const s = summarizeFinance([row(), row({ amount: 627, hostAmount: 600, platformFee: 27, method: 'pix' }), row({ status: 'aguardando', amount: 1000, hostAmount: 900, platformFee: 100 })]);
    expect(s.paidCount).toBe(2);
    expect(s.paidTotal).toBe(1287);
    expect(s.platformTotal).toBe(87);
    expect(s.hostTotal).toBe(1200);
    expect(s.platformTotal + s.hostTotal).toBe(s.paidTotal);
    expect(s.avgTicket).toBe(643.5);
  });

  it('separa pendentes e vencidos/recusados, sem somar ao recebido', () => {
    const s = summarizeFinance([row({ status: 'aguardando', amount: 300 }), row({ status: 'aguardando', amount: 200 }), row({ status: 'expirado' }), row({ status: 'falhou' })]);
    expect(s).toMatchObject({ paidCount: 0, paidTotal: 0, pendingCount: 2, pendingTotal: 500, expiredCount: 2 });
  });

  it('totais por forma de pagamento', () => {
    const s = summarizeFinance([row({ method: 'pix', amount: 627 }), row({ method: 'card', amount: 660 }), row({ method: 'card', amount: 330 })]);
    expect(s.byMethod.pix).toEqual({ count: 1, total: 627 });
    expect(s.byMethod.card).toEqual({ count: 2, total: 990 });
  });

  it('pagamento de reserva cancelada vai para "a devolver"', () => {
    const s = summarizeFinance([row({ amount: 660, bookingStatus: 'cancelada' }), row({ amount: 100, hostAmount: 90, platformFee: 10 }), row({ status: 'expirado', bookingStatus: 'cancelada' })]);
    expect(s.toRefundCount).toBe(1);
    expect(s.toRefundTotal).toBe(660);
  });

  it('não acumula erro de centavos', () => {
    const rows = Array.from({ length: 10 }, () => row({ amount: 0.1, hostAmount: 0.1, platformFee: 0 }));
    expect(summarizeFinance(rows).paidTotal).toBe(1);
  });

  it('últimas movimentações: mais recentes primeiro e no máximo o limite', () => {
    const rows = Array.from({ length: 15 }, (_, i) => row({ id: `p${i}`, createdAt: `2026-12-${String(i + 1).padStart(2, '0')}T10:00:00Z` }));
    const s = summarizeFinance(rows, 10);
    expect(s.recent).toHaveLength(10);
    expect(s.recent[0].id).toBe('p14');
    expect(s.recent[9].id).toBe('p5');
  });
});
