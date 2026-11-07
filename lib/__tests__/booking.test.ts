import { canCancelStay, effectiveStatus, stayEnded, todayISO, bookingTabOf } from '../booking';

const agora = new Date(2026, 9, 22, 15, 30); // 22/10/2026 15:30, horário local

describe('todayISO', () => {
  it('formata a data local com zeros à esquerda', () => {
    expect(todayISO(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(todayISO(agora)).toBe('2026-10-22');
  });
});

describe('stayEnded', () => {
  it('check-out no passado: terminou', () => {
    expect(stayEnded('2026-10-21', agora)).toBe(true);
  });

  it('check-out hoje: terminou (mesma regra da policy de avaliações)', () => {
    expect(stayEnded('2026-10-22', agora)).toBe(true);
  });

  it('check-out amanhã: ainda não terminou', () => {
    expect(stayEnded('2026-10-23', agora)).toBe(false);
  });
});

describe('effectiveStatus', () => {
  it('cancelada continua cancelada mesmo com check-out vencido', () => {
    expect(effectiveStatus({ status: 'cancelada', check_out: '2026-10-01' }, agora)).toBe('cancelada');
  });

  it('reservada com check-out vencido vira realizada', () => {
    expect(effectiveStatus({ status: 'reservada', check_out: '2026-10-10' }, agora)).toBe('realizada');
  });

  it('reservada com check-out futuro continua reservada', () => {
    expect(effectiveStatus({ status: 'reservada', check_out: '2026-10-30' }, agora)).toBe('reservada');
  });

  it('realizada gravada no banco é respeitada', () => {
    expect(effectiveStatus({ status: 'realizada', check_out: '2026-12-01' }, agora)).toBe('realizada');
  });
});

describe('canCancelStay (T-05, 3º teste de segurança)', () => {
  const now = new Date(2026, 9, 29, 15, 0); // 29/10/2026
  it('permite cancelar antes e no dia do check-in', () => {
    expect(canCancelStay('2026-11-10', now)).toBe(true);
    expect(canCancelStay('2026-10-29', now)).toBe(true);
  });
  it('não permite depois que a estadia começou', () => {
    expect(canCancelStay('2026-10-28', now)).toBe(false);
  });
});

describe('bookingTabOf', () => {
  it('cancelada vai para a aba Canceladas', () => {
    expect(bookingTabOf('cancelada')).toBe('canceladas');
  });

  it('reservada, realizada e qualquer outro status ficam em Confirmadas', () => {
    expect(bookingTabOf('reservada')).toBe('confirmadas');
    expect(bookingTabOf('realizada')).toBe('confirmadas');
    expect(bookingTabOf('algo-inesperado')).toBe('confirmadas');
  });
});
