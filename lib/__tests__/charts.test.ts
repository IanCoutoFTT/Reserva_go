import { countByDay, lastDays, revenueByDay, seriesTotal } from '../charts';

// 10/12/2026 às 15h, horário local do aparelho
const NOW = new Date(2026, 11, 10, 15, 0, 0);
const local = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h, 0, 0).toISOString();

describe('lastDays', () => {
  it('7 dias terminando em hoje, do mais antigo ao mais novo', () => {
    const days = lastDays(7, NOW);
    expect(days).toHaveLength(7);
    expect(days[0]).toEqual({ key: '2026-12-04', label: '04/12' });
    expect(days[6]).toEqual({ key: '2026-12-10', label: '10/12' });
  });
  it('atravessa a virada do mês e do ano', () => {
    const days = lastDays(4, new Date(2027, 0, 2, 9, 0, 0));
    expect(days.map((d) => d.key)).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
  });
});

describe('revenueByDay', () => {
  it('soma só os pagamentos pagos, no dia do pagamento', () => {
    const s = revenueByDay(
      [
        { status: 'pago', amount: 660, paidAt: local(2026, 12, 10) },
        { status: 'pago', amount: 627, paidAt: local(2026, 12, 10, 9) },
        { status: 'pago', amount: 100, paidAt: local(2026, 12, 8) },
        { status: 'aguardando', amount: 999, paidAt: null },
        { status: 'expirado', amount: 888, paidAt: null },
      ],
      7,
      NOW
    );
    expect(s[6].value).toBe(1287);
    expect(s[4].value).toBe(100);
    expect(seriesTotal(s)).toBe(1387);
  });
  it('ignora pagamentos fora da janela e datas inválidas', () => {
    const s = revenueByDay(
      [
        { status: 'pago', amount: 500, paidAt: local(2026, 11, 1) },
        { status: 'pago', amount: 500, paidAt: 'lixo' },
        { status: 'pago', amount: 500, paidAt: null },
      ],
      7,
      NOW
    );
    expect(seriesTotal(s)).toBe(0);
  });
  it('não acumula erro de centavos', () => {
    const rows = Array.from({ length: 10 }, () => ({ status: 'pago', amount: 0.1, paidAt: local(2026, 12, 10) }));
    expect(revenueByDay(rows, 7, NOW)[6].value).toBe(1);
  });
});

describe('countByDay', () => {
  it('conta por dia e ignora o que está fora da semana', () => {
    const s = countByDay([local(2026, 12, 10), local(2026, 12, 10, 8), local(2026, 12, 5), local(2026, 11, 20), null, 'lixo'], 7, NOW);
    expect(s[6].value).toBe(2);
    expect(s[1].value).toBe(1);
    expect(seriesTotal(s)).toBe(3);
  });
  it('sem datas: tudo zero', () => {
    expect(seriesTotal(countByDay([], 7, NOW))).toBe(0);
  });
});
