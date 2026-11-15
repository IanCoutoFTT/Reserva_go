describe('lib/card', () => {
  const load = (env: Record<string, string | undefined>) => {
    jest.resetModules();
    for (const k of ['EXPO_PUBLIC_CARD_ENABLED', 'EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY', 'EXPO_PUBLIC_PIX_ENABLED']) {
      if (env[k] === undefined) delete process.env[k];
      else process.env[k] = env[k];
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('../card') as typeof import('../card');
  };

  afterAll(() => {
    delete process.env.EXPO_PUBLIC_CARD_ENABLED;
    delete process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    delete process.env.EXPO_PUBLIC_PIX_ENABLED;
  });

  it('desligado por padrão: sem variáveis, nada cobra', () => {
    const c = load({});
    expect(c.CARD_ENABLED).toBe(false);
    expect(c.PAYMENTS_ENABLED).toBe(false);
  });

  it('só liga com a flag E a chave publicável', () => {
    expect(load({ EXPO_PUBLIC_CARD_ENABLED: 'true' }).CARD_ENABLED).toBe(false);
    expect(load({ EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_abc' }).CARD_ENABLED).toBe(false);
    expect(load({ EXPO_PUBLIC_CARD_ENABLED: 'false', EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_abc' }).CARD_ENABLED).toBe(false);
    expect(load({ EXPO_PUBLIC_CARD_ENABLED: 'true', EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_abc' }).CARD_ENABLED).toBe(true);
  });

  it('PAYMENTS_ENABLED vale para Pix ou cartão', () => {
    expect(load({ EXPO_PUBLIC_PIX_ENABLED: 'true' }).PAYMENTS_ENABLED).toBe(true);
    expect(load({ EXPO_PUBLIC_CARD_ENABLED: 'true', EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_abc' }).PAYMENTS_ENABLED).toBe(true);
  });

  it('isStripeTestKey reconhece só a chave de teste', () => {
    const c = load({});
    expect(c.isStripeTestKey('pk_test_123')).toBe(true);
    expect(c.isStripeTestKey('pk_live_123')).toBe(false);
    expect(c.isStripeTestKey('')).toBe(false);
  });
});
