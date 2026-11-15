import { canClearNoShow, canMarkNoShow, isNoShow } from '../booking';

const NOW = new Date(2026, 11, 10, 15, 0, 0); // 10/12/2026, horário local

describe('isNoShow', () => {
  it('só é não comparecimento quando no_show_at está preenchido', () => {
    expect(isNoShow({ no_show_at: '2026-12-10T10:00:00Z' })).toBe(true);
    expect(isNoShow({ no_show_at: null })).toBe(false);
    expect(isNoShow({})).toBe(false);
  });
});

describe('canMarkNoShow', () => {
  const base = { status: 'reservada' as const, check_in: '2026-12-05', no_show_at: null };

  it('depois do dia do check-in, em reserva ativa: pode', () => {
    expect(canMarkNoShow(base, NOW)).toBe(true);
  });
  it('no próprio dia do check-in ainda não (o hóspede pode chegar)', () => {
    expect(canMarkNoShow({ ...base, check_in: '2026-12-10' }, NOW)).toBe(false);
  });
  it('antes do check-in: não', () => {
    expect(canMarkNoShow({ ...base, check_in: '2026-12-20' }, NOW)).toBe(false);
  });
  it('reserva cancelada ou já marcada: não', () => {
    expect(canMarkNoShow({ ...base, status: 'cancelada' }, NOW)).toBe(false);
    expect(canMarkNoShow({ ...base, no_show_at: '2026-12-09T10:00:00Z' }, NOW)).toBe(false);
  });
});

describe('canClearNoShow', () => {
  it('dentro de 48 horas da marcação: pode desfazer', () => {
    expect(canClearNoShow({ no_show_at: new Date(NOW.getTime() - 47 * 3600_000).toISOString() }, NOW)).toBe(true);
  });
  it('depois de 48 horas: não (só o admin)', () => {
    expect(canClearNoShow({ no_show_at: new Date(NOW.getTime() - 49 * 3600_000).toISOString() }, NOW)).toBe(false);
  });
  it('sem marcação ou data inválida: não', () => {
    expect(canClearNoShow({ no_show_at: null }, NOW)).toBe(false);
    expect(canClearNoShow({}, NOW)).toBe(false);
    expect(canClearNoShow({ no_show_at: 'lixo' }, NOW)).toBe(false);
  });
});
