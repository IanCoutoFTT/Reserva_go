import { createChargeHandler, simulatePaymentHandler, webhookHandler, type BookingRow, type PaymentRow, type PixDeps } from '../handlers.ts';
import { asaasProvider, mockProvider, type PixProvider } from '../providers.ts';

const NOW = new Date('2026-12-01T12:00:00Z');
const GUEST = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const HOST = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const BOOKING_ID = '11111111-2222-4333-8444-555555555555';

const booking = (over: Partial<BookingRow> = {}): BookingRow => ({
  id: BOOKING_ID, guest_id: GUEST, status: 'reservada', pay_method: 'pix',
  total: 627, nights: 2, price_per_night: 300, property_title: 'Chale Pix', owner_id: HOST, ...over,
});

const payment = (over: Partial<PaymentRow> = {}): PaymentRow => ({
  id: 'pay-row-1', booking_id: BOOKING_ID, provider: 'mock', provider_charge_id: 'mock_1', status: 'aguardando',
  amount: 627, host_amount: 600, platform_fee: 27, pix_copy_paste: 'SIMULADO-x', pix_qr_image: null,
  expires_at: '2026-12-01T12:20:00.000Z', ...over,
});

function makeDeps(over: Partial<PixDeps> = {}, provider: PixProvider = mockProvider(() => NOW)) {
  const deps: PixDeps = {
    provider,
    now: () => NOW,
    log: jest.fn(),
    getUserId: jest.fn(async (h: string | null) => (h === 'Bearer guest' ? GUEST : h === 'Bearer other' ? OTHER : null)),
    getUserProfile: jest.fn(async () => ({ name: 'Hóspede', email: 'g@x.com' })),
    loadBooking: jest.fn(async () => booking()),
    loadPayment: jest.fn(async () => null),
    loadPayoutAccount: jest.fn(async () => ({ account_id: 'wallet-host', has_pix_key: true })),
    registerCharge: jest.fn(async (a) => payment({ provider: a.provider, provider_charge_id: a.chargeId, pix_copy_paste: a.copyPaste, expires_at: a.expiresAt.toISOString() })),
    markPaid: jest.fn(async () => true),
    ...over,
  };
  return deps;
}

describe('createChargeHandler', () => {
  it('sem login: 401, e nada é consultado', async () => {
    const d = makeDeps();
    expect((await createChargeHandler(d, null, { booking_id: BOOKING_ID })).status).toBe(401);
    expect(d.loadBooking).not.toHaveBeenCalled();
  });

  it('id de reserva inválido: 400', async () => {
    expect((await createChargeHandler(makeDeps(), 'Bearer guest', { booking_id: 'x' })).status).toBe(400);
    expect((await createChargeHandler(makeDeps(), 'Bearer guest', null)).status).toBe(400);
  });

  it('reserva de OUTRA pessoa: 404 (não revela que existe) e o provedor não é chamado', async () => {
    const d = makeDeps();
    const spy = jest.spyOn(d.provider, 'createCharge');
    const r = await createChargeHandler(d, 'Bearer other', { booking_id: BOOKING_ID });
    expect(r.status).toBe(404);
    expect(spy).not.toHaveBeenCalled();
  });

  it('reserva cancelada ou de cartão: 409', async () => {
    expect((await createChargeHandler(makeDeps({ loadBooking: async () => booking({ status: 'cancelada' }) }), 'Bearer guest', { booking_id: BOOKING_ID })).status).toBe(409);
    expect((await createChargeHandler(makeDeps({ loadBooking: async () => booking({ pay_method: 'card' }) }), 'Bearer guest', { booking_id: BOOKING_ID })).status).toBe(409);
  });

  it('cria a cobrança: expira em 30 min e a resposta NÃO traz a divisão nem o id do provedor', async () => {
    const d = makeDeps();
    const r = await createChargeHandler(d, 'Bearer guest', { booking_id: BOOKING_ID });
    expect(r.status).toBe(200);
    const sent = (d.registerCharge as jest.Mock).mock.calls[0][0];
    expect(sent.userId).toBe(GUEST);
    expect(sent.expiresAt.toISOString()).toBe('2026-12-01T12:30:00.000Z');
    const p = r.body.payment as Record<string, unknown>;
    expect(p.pix_copy_paste).toEqual(expect.stringContaining('SIMULADO-'));
    expect(p).not.toHaveProperty('host_amount');
    expect(p).not.toHaveProperty('platform_fee');
    expect(p).not.toHaveProperty('provider_charge_id');
  });

  it('o valor cobrado vem da reserva no banco, não do pedido do app', async () => {
    const d = makeDeps();
    const spy = jest.spyOn(d.provider, 'createCharge');
    await createChargeHandler(d, 'Bearer guest', { booking_id: BOOKING_ID, amount: 1, total: 1, host_amount: 999 });
    expect(spy.mock.calls[0][0]).toMatchObject({ amount: 627, hostAmount: 600, platformFee: 27 });
  });

  it('cobrança aberta e ainda válida: devolve a mesma, sem criar outra no provedor', async () => {
    const d = makeDeps({ loadPayment: async () => payment() });
    const spy = jest.spyOn(d.provider, 'createCharge');
    const r = await createChargeHandler(d, 'Bearer guest', { booking_id: BOOKING_ID });
    expect(r.status).toBe(200);
    expect((r.body.payment as { id: string }).id).toBe('pay-row-1');
    expect(spy).not.toHaveBeenCalled();
    expect(d.registerCharge).not.toHaveBeenCalled();
  });

  it('cobrança vencida (ainda não expirada pelo banco): cria uma nova', async () => {
    const d = makeDeps({ loadPayment: async () => payment({ expires_at: '2026-12-01T11:59:00.000Z' }) });
    const spy = jest.spyOn(d.provider, 'createCharge');
    expect((await createChargeHandler(d, 'Bearer guest', { booking_id: BOOKING_ID })).status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('já paga: 409', async () => {
    const d = makeDeps({ loadPayment: async () => payment({ status: 'pago' }) });
    const r = await createChargeHandler(d, 'Bearer guest', { booking_id: BOOKING_ID });
    expect(r).toEqual({ status: 409, body: { error: 'already_paid' } });
  });

  it('anfitrião sem dados de recebimento: 422 em qualquer provedor, sem chamar o provedor', async () => {
    for (const payout of [null, { account_id: null, has_pix_key: false }]) {
      const d = makeDeps({ loadPayoutAccount: async () => payout });
      const spy = jest.spyOn(d.provider, 'createCharge');
      const r = await createChargeHandler(d, 'Bearer guest', { booking_id: BOOKING_ID });
      expect(r).toEqual({ status: 422, body: { error: 'host_without_payout_account' } });
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it('com só a chave Pix cadastrada o provedor simulado cobra normalmente', async () => {
    const d = makeDeps({ loadPayoutAccount: async () => ({ account_id: null, has_pix_key: true }) });
    expect((await createChargeHandler(d, 'Bearer guest', { booking_id: BOOKING_ID })).status).toBe(200);
  });

  it('falha do provedor: 502, sem registrar nada', async () => {
    const d = makeDeps();
    jest.spyOn(d.provider, 'createCharge').mockRejectedValue(new Error('timeout'));
    const r = await createChargeHandler(d, 'Bearer guest', { booking_id: BOOKING_ID });
    expect(r.status).toBe(502);
    expect(d.registerCharge).not.toHaveBeenCalled();
  });

  it('o banco recusou registrar: 409', async () => {
    const d = makeDeps({ registerCharge: jest.fn(async () => { throw new Error('Já existe uma cobrança'); }) });
    expect((await createChargeHandler(d, 'Bearer guest', { booking_id: BOOKING_ID })).status).toBe(409);
  });

  describe('com provedor real (Asaas)', () => {
    const asaas = () => asaasProvider({ apiKey: 'k', baseUrl: 'https://x/v3' });

    it('sem CPF válido: 422 cpf_required e o provedor não é chamado', async () => {
      const d = makeDeps({}, asaas());
      const spy = jest.spyOn(d.provider, 'createCharge');
      for (const cpf of [undefined, '123', '111.111.111-11']) {
        const r = await createChargeHandler(d, 'Bearer guest', { booking_id: BOOKING_ID, cpf });
        expect(r).toEqual({ status: 422, body: { error: 'cpf_required' } });
      }
      expect(spy).not.toHaveBeenCalled();
    });

    it('só com chave Pix (sem a conta no provedor), o repasse automático não é possível: 422', async () => {
      const d = makeDeps({ loadPayoutAccount: async () => ({ account_id: null, has_pix_key: true }) }, asaas());
      const r = await createChargeHandler(d, 'Bearer guest', { booking_id: BOOKING_ID, cpf: '529.982.247-25' });
      expect(r).toEqual({ status: 422, body: { error: 'host_without_payout_account' } });
    });

    it('anfitrião sem conta de recebimento: 422', async () => {
      const d = makeDeps({ loadPayoutAccount: async () => null }, asaas());
      const r = await createChargeHandler(d, 'Bearer guest', { booking_id: BOOKING_ID, cpf: '529.982.247-25' });
      expect(r).toEqual({ status: 422, body: { error: 'host_without_payout_account' } });
    });

    it('com CPF e conta do anfitrião: manda o CPF só com dígitos e a conta certa', async () => {
      const d = makeDeps({}, asaas());
      const spy = jest.spyOn(d.provider, 'createCharge').mockResolvedValue({ chargeId: 'pay_9', copyPaste: '0002...', qrImageBase64: 'abc' });
      const r = await createChargeHandler(d, 'Bearer guest', { booking_id: BOOKING_ID, cpf: '529.982.247-25' });
      expect(r.status).toBe(200);
      expect(spy.mock.calls[0][0]).toMatchObject({ hostAccountId: 'wallet-host', payer: { cpf: '52998224725' } });
      expect(d.loadPayoutAccount).toHaveBeenCalledWith(HOST);
    });
  });
});

describe('webhookHandler', () => {
  const body = { event: 'PAYMENT_RECEIVED', charge_id: 'mock_1' };

  it('sem segredo configurado, recusa todo mundo', async () => {
    expect((await webhookHandler(makeDeps(), '', '', body)).status).toBe(401);
    expect((await webhookHandler(makeDeps(), 'qualquer', null, body)).status).toBe(401);
  });

  it('token errado ou ausente: 401, e nada é confirmado', async () => {
    const d = makeDeps();
    expect((await webhookHandler(d, 'errado', 'segredo', body)).status).toBe(401);
    expect((await webhookHandler(d, null, 'segredo', body)).status).toBe(401);
    expect(d.markPaid).not.toHaveBeenCalled();
  });

  it('token certo e evento de pagamento: confirma', async () => {
    const d = makeDeps();
    const r = await webhookHandler(d, 'segredo', 'segredo', body);
    expect(r).toEqual({ status: 200, body: { ok: true, changed: true } });
    expect(d.markPaid).toHaveBeenCalledWith('mock_1');
  });

  it('reenvio do mesmo aviso: 200 com changed=false', async () => {
    const d = makeDeps({ markPaid: async () => false });
    expect((await webhookHandler(d, 'segredo', 'segredo', body)).body).toEqual({ ok: true, changed: false });
  });

  it('evento que não interessa: 200 "ignored" (para o provedor não reenviar)', async () => {
    const d = makeDeps();
    const r = await webhookHandler(d, 'segredo', 'segredo', { event: 'OUTRO' });
    expect(r).toEqual({ status: 200, body: { ignored: true } });
    expect(d.markPaid).not.toHaveBeenCalled();
  });

  it('erro ao confirmar: 500, para o provedor tentar de novo', async () => {
    const d = makeDeps({ markPaid: jest.fn(async () => { throw new Error('db fora do ar'); }) });
    expect((await webhookHandler(d, 'segredo', 'segredo', body)).status).toBe(500);
  });
});

describe('simulatePaymentHandler (só modo simulado)', () => {
  it('com provedor real a rota "não existe": 404', async () => {
    const d = makeDeps({}, asaasProvider({ apiKey: 'k', baseUrl: 'https://x/v3' }));
    const r = await simulatePaymentHandler(d, 'Bearer guest', { booking_id: BOOKING_ID });
    expect(r.status).toBe(404);
    expect(d.markPaid).not.toHaveBeenCalled();
  });

  it('sem login: 401; reserva de outra pessoa: 404', async () => {
    expect((await simulatePaymentHandler(makeDeps(), null, { booking_id: BOOKING_ID })).status).toBe(401);
    const d = makeDeps({ loadPayment: async () => payment() });
    expect((await simulatePaymentHandler(d, 'Bearer other', { booking_id: BOOKING_ID })).status).toBe(404);
    expect(d.markPaid).not.toHaveBeenCalled();
  });

  it('sem cobrança ou já paga: 404 / 409', async () => {
    expect((await simulatePaymentHandler(makeDeps(), 'Bearer guest', { booking_id: BOOKING_ID })).status).toBe(404);
    const d = makeDeps({ loadPayment: async () => payment({ status: 'pago' }) });
    expect((await simulatePaymentHandler(d, 'Bearer guest', { booking_id: BOOKING_ID })).status).toBe(409);
  });

  it('o hóspede paga a própria cobrança aberta', async () => {
    const d = makeDeps({ loadPayment: async () => payment() });
    const r = await simulatePaymentHandler(d, 'Bearer guest', { booking_id: BOOKING_ID });
    expect(r).toEqual({ status: 200, body: { ok: true, changed: true } });
    expect(d.markPaid).toHaveBeenCalledWith('mock_1');
  });
});
