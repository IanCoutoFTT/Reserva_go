import { computeSplit, isUuid, isValidCpf, onlyDigits, pixExpiry, roundMoney, timingSafeEqual } from '../pix.ts';

describe('computeSplit (espelha register_pix_charge da migração 013)', () => {
  it('anfitrião recebe as diárias e a plataforma a diferença (2 noites x R$ 300, Pix: total 627)', () => {
    expect(computeSplit(2, 300, 627)).toEqual({ hostAmount: 600, platformFee: 27 });
  });

  it('a soma sempre fecha com o total, sem sobra de centavos', () => {
    for (const [nights, price] of [[1, 99.99], [3, 149.9], [7, 333.33], [2, 10]] as const) {
      const total = roundMoney(nights * price * 1.1 * 0.95);
      const s = computeSplit(nights, price, total);
      expect(roundMoney(s.hostAmount + s.platformFee)).toBe(total);
    }
  });

  it('o repasse nunca passa do total (total menor que as diárias)', () => {
    expect(computeSplit(2, 300, 500)).toEqual({ hostAmount: 500, platformFee: 0 });
  });
});

describe('isValidCpf', () => {
  it('aceita CPF válido, com ou sem máscara', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('52998224725')).toBe(true);
  });
  it('recusa dígito verificador errado, sequência repetida, tamanho errado e não-texto', () => {
    expect(isValidCpf('529.982.247-24')).toBe(false);
    expect(isValidCpf('111.111.111-11')).toBe(false);
    expect(isValidCpf('1234')).toBe(false);
    expect(isValidCpf(52998224725)).toBe(false);
    expect(isValidCpf(null)).toBe(false);
  });
  it('onlyDigits tira a máscara', () => {
    expect(onlyDigits('529.982.247-25')).toBe('52998224725');
  });
});

describe('timingSafeEqual', () => {
  it('só aceita textos iguais', () => {
    expect(timingSafeEqual('segredo', 'segredo')).toBe(true);
    expect(timingSafeEqual('segredo', 'segredx')).toBe(false);
    expect(timingSafeEqual('segredo', 'segredo2')).toBe(false);
  });
  it('recusa ausente ou vazio contra vazio configurado', () => {
    expect(timingSafeEqual(null, 'x')).toBe(false);
    expect(timingSafeEqual('x', undefined)).toBe(false);
    expect(timingSafeEqual(null, null)).toBe(false);
  });
});

describe('pixExpiry e isUuid', () => {
  it('Pix vence 30 minutos depois', () => {
    const now = new Date('2026-12-01T12:00:00Z');
    expect(pixExpiry(now).toISOString()).toBe('2026-12-01T12:30:00.000Z');
  });
  it('isUuid', () => {
    expect(isUuid('00000000-0000-4000-a000-00000000000a')).toBe(true);
    expect(isUuid('nao-e-uuid')).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
});
