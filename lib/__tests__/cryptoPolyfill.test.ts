// Teste de segurança 29/10/2026 (S-12): getRandomValues precisa vir de um
// gerador criptográfico (expo-crypto), nunca de Math.random.
describe('installCryptoSubtlePolyfillIfNeeded', () => {
  const g = globalThis as any;
  let originalCrypto: any;

  beforeEach(() => {
    jest.resetModules();
    originalCrypto = g.crypto;
    // simula o Hermes do app: nenhum global crypto
    Object.defineProperty(g, 'crypto', { value: undefined, configurable: true, writable: true });
  });

  afterEach(() => {
    Object.defineProperty(g, 'crypto', { value: originalCrypto, configurable: true, writable: true });
    jest.restoreAllMocks();
  });

  it('usa expo-crypto para getRandomValues e não chama Math.random', () => {
    const secure = jest.fn((arr: Uint8Array) => {
      arr.fill(7);
      return arr;
    });
    jest.doMock('expo-crypto', () => ({ getRandomValues: secure }));
    const mathRandom = jest.spyOn(Math, 'random');

    const { installCryptoSubtlePolyfillIfNeeded } = require('../cryptoPolyfill');
    installCryptoSubtlePolyfillIfNeeded();

    const out = g.crypto.getRandomValues(new Uint8Array(16));
    expect(secure).toHaveBeenCalled();
    expect(Array.from(out)).toEqual(new Array(16).fill(7));
    expect(mathRandom).not.toHaveBeenCalled();
  });

  it('sem expo-crypto no binário, NÃO instala getRandomValues (não cai para Math.random)', () => {
    jest.doMock('expo-crypto', () => {
      throw new Error("Cannot find native module 'ExpoCrypto'");
    });
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    const { installCryptoSubtlePolyfillIfNeeded } = require('../cryptoPolyfill');
    installCryptoSubtlePolyfillIfNeeded();

    expect(typeof g.crypto?.getRandomValues).not.toBe('function');
    expect(typeof g.crypto?.subtle?.digest).toBe('function');
  });
});
