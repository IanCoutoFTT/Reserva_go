import { formatCountdown, formatCpf, secondsLeft } from '../pix';

describe('secondsLeft', () => {
  const now = new Date('2026-12-01T12:00:00Z');
  it('conta os segundos até o vencimento', () => {
    expect(secondsLeft('2026-12-01T12:30:00Z', now)).toBe(1800);
    expect(secondsLeft('2026-12-01T12:00:00.400Z', now)).toBe(1); // arredonda para cima
  });
  it('vencido ou data inválida vira 0, nunca negativo', () => {
    expect(secondsLeft('2026-12-01T11:00:00Z', now)).toBe(0);
    expect(secondsLeft('lixo', now)).toBe(0);
  });
});

describe('formatCountdown', () => {
  it('mm:ss com zero à esquerda', () => {
    expect(formatCountdown(1800)).toBe('30:00');
    expect(formatCountdown(65)).toBe('01:05');
    expect(formatCountdown(9)).toBe('00:09');
    expect(formatCountdown(0)).toBe('00:00');
    expect(formatCountdown(-5)).toBe('00:00');
  });
});

describe('formatCpf', () => {
  it('aplica a máscara enquanto digita', () => {
    expect(formatCpf('5')).toBe('5');
    expect(formatCpf('5299')).toBe('529.9');
    expect(formatCpf('5299822')).toBe('529.982.2');
    expect(formatCpf('52998224725')).toBe('529.982.247-25');
  });
  it('ignora letras e passa de 11 dígitos', () => {
    expect(formatCpf('529.982.247-25999abc')).toBe('529.982.247-25');
  });
});
