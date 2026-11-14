import { asaasProvider, mockProvider, type ChargeRequest } from '../providers.ts';

const req: ChargeRequest = {
  bookingId: '11111111-2222-4333-8444-555555555555',
  amount: 627,
  hostAmount: 600,
  platformFee: 27,
  description: 'ReservaGO: Chale Pix',
  expiresAt: new Date('2026-12-01T12:30:00Z'),
  hostAccountId: 'wallet-host',
  payer: { name: 'Hóspede', email: 'g@x.com', cpf: '52998224725' },
};

describe('provedor simulado', () => {
  const p = mockProvider(() => new Date('2026-12-01T12:00:00Z'));

  it('gera um código que NÃO é um Pix válido (ninguém paga sem querer)', async () => {
    const c = await p.createCharge(req);
    expect(c.chargeId).toBe(`mock_11111111_${new Date('2026-12-01T12:00:00Z').getTime()}`);
    expect(c.copyPaste.startsWith('SIMULADO-')).toBe(true);
    expect(c.copyPaste).toContain('R$627.00');
    expect(c.qrImageBase64).toBeNull();
  });

  it('não exige CPF nem conta do anfitrião', () => {
    expect(p.requiresCpf).toBe(false);
    expect(p.requiresHostAccount).toBe(false);
  });

  it('webhook: só o evento de pagamento com id vira "paid"', () => {
    expect(p.parseWebhook({ event: 'PAYMENT_RECEIVED', charge_id: 'mock_1' })).toEqual({ type: 'paid', chargeId: 'mock_1' });
    expect(p.parseWebhook({ event: 'PAYMENT_RECEIVED' })).toBeNull();
    expect(p.parseWebhook({ event: 'OUTRO', charge_id: 'x' })).toBeNull();
    expect(p.parseWebhook('texto')).toBeNull();
    expect(p.parseWebhook(null)).toBeNull();
  });
});

describe('provedor Asaas (formato do pedido; resposta real ainda a conferir no sandbox)', () => {
  const ok = (json: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(json) } as Response);

  function fakeFetch(handlers: Record<string, unknown>) {
    const calls: { method: string; url: string; headers: Record<string, string>; body: unknown }[] = [];
    const fn = jest.fn((url: string, init: RequestInit) => {
      calls.push({
        method: String(init.method),
        url,
        headers: init.headers as Record<string, string>,
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      });
      const key = Object.keys(handlers).find((k) => url.endsWith(k));
      return key ? ok(handlers[key]) : Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) } as Response);
    });
    return { fn: fn as unknown as typeof fetch, calls };
  }

  const handlers = {
    '/customers': { id: 'cus_1' },
    '/payments': { id: 'pay_1' },
    '/payments/pay_1/pixQrCode': { payload: '00020126...', encodedImage: 'iVBORw0KGgo=' },
  };

  it('cria cliente, cobrança Pix com o repasse ao anfitrião e busca o QR Code', async () => {
    const { fn, calls } = fakeFetch(handlers);
    const p = asaasProvider({ apiKey: 'chave-secreta', baseUrl: 'https://api-sandbox.asaas.com/v3/', fetchImpl: fn });

    const c = await p.createCharge(req);

    expect(c).toEqual({ chargeId: 'pay_1', copyPaste: '00020126...', qrImageBase64: 'iVBORw0KGgo=' });
    expect(calls.map((x) => `${x.method} ${x.url}`)).toEqual([
      'POST https://api-sandbox.asaas.com/v3/customers',
      'POST https://api-sandbox.asaas.com/v3/payments',
      'GET https://api-sandbox.asaas.com/v3/payments/pay_1/pixQrCode',
    ]);
    expect(calls[1].headers.access_token).toBe('chave-secreta');
    expect(calls[0].body).toMatchObject({ name: 'Hóspede', cpfCnpj: '52998224725' });
    expect(calls[1].body).toMatchObject({
      customer: 'cus_1',
      billingType: 'PIX',
      value: 627,
      dueDate: '2026-12-01',
      externalReference: req.bookingId,
      split: [{ walletId: 'wallet-host', fixedValue: 600 }],
    });
  });

  it('a chave secreta só vai no cabeçalho, nunca na URL nem no corpo', async () => {
    const { fn, calls } = fakeFetch(handlers);
    await asaasProvider({ apiKey: 'chave-secreta', baseUrl: 'https://x/v3', fetchImpl: fn }).createCharge(req);
    for (const c of calls) {
      expect(c.url).not.toContain('chave-secreta');
      expect(JSON.stringify(c.body ?? {})).not.toContain('chave-secreta');
    }
  });

  it('sem conta do anfitrião ou sem CPF, nem chama o provedor', async () => {
    const { fn } = fakeFetch(handlers);
    const p = asaasProvider({ apiKey: 'k', baseUrl: 'https://x/v3', fetchImpl: fn });
    await expect(p.createCharge({ ...req, hostAccountId: null })).rejects.toThrow(/conta de recebimento/);
    await expect(p.createCharge({ ...req, payer: { ...req.payer, cpf: null } })).rejects.toThrow(/CPF/);
    expect(fn).not.toHaveBeenCalled();
  });

  it('resposta de erro do provedor vira exceção (sem vazar o corpo)', async () => {
    const { fn } = fakeFetch({});
    const p = asaasProvider({ apiKey: 'k', baseUrl: 'https://x/v3', fetchImpl: fn });
    await expect(p.createCharge(req)).rejects.toThrow('Asaas POST /customers respondeu 404');
  });

  it('webhook: pagamento recebido ou confirmado vira "paid"; o resto é ignorado', () => {
    const p = asaasProvider({ apiKey: 'k', baseUrl: 'https://x/v3' });
    expect(p.parseWebhook({ event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1' } })).toEqual({ type: 'paid', chargeId: 'pay_1' });
    expect(p.parseWebhook({ event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_2' } })).toEqual({ type: 'paid', chargeId: 'pay_2' });
    expect(p.parseWebhook({ event: 'PAYMENT_CREATED', payment: { id: 'pay_3' } })).toBeNull();
    expect(p.parseWebhook({ event: 'PAYMENT_RECEIVED' })).toBeNull();
    expect(p.parseWebhook(undefined)).toBeNull();
    expect(p.webhookTokenHeader).toBe('asaas-access-token');
  });
});
