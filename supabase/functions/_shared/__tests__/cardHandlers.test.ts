import { createHmac } from 'crypto';
import { createCardIntentHandler, stripeWebhookHandler, type CardDeps } from '../cardHandlers.ts';
import type { BookingRow, PaymentRow } from '../handlers.ts';
import type { StripeApi } from '../stripe.ts';

const NOW = new Date('2026-12-01T12:00:00Z');
const GUEST = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const HOST = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const BOOKING_ID = '11111111-2222-4333-8444-555555555555';
const SECRET = 'whsec_teste';

const booking = (over: Partial<BookingRow> = {}): BookingRow => ({
  id: BOOKING_ID, guest_id: GUEST, status: 'reservada', pay_method: 'card',
  total: 660, nights: 2, price_per_night: 300, property_title: 'Chale Cartao', owner_id: HOST, ...over,
});
const payment = (over: Partial<PaymentRow> = {}): PaymentRow => ({
  id: 'pay-1', booking_id: BOOKING_ID, provider: 'stripe', provider_charge_id: 'pi_1', status: 'aguardando',
  amount: 660, host_amount: 600, platform_fee: 60, pix_copy_paste: null, pix_qr_image: null,
  expires_at: '2026-12-01T12:20:00.000Z', ...over,
});

function makeStripe(over: Partial<StripeApi> = {}): StripeApi {
  return {
    createPaymentIntent: jest.fn(async () => ({ id: 'pi_1', clientSecret: 'pi_1_secret_zzz' })),
    getClientSecret: jest.fn(async () => 'pi_1_secret_zzz'),
    ...over,
  };
}

function makeDeps(over: Partial<CardDeps> = {}): CardDeps {
  return {
    now: () => NOW,
    log: jest.fn(),
    getUserId: jest.fn(async (h: string | null) => (h === 'Bearer guest' ? GUEST : h === 'Bearer other' ? OTHER : null)),
    loadBooking: jest.fn(async () => booking()),
    loadPayment: jest.fn(async () => null),
    loadPaymentByCharge: jest.fn(async () => payment()),
    loadPayoutAccount: jest.fn(async () => ({ account_id: null, has_pix_key: true })),
    stripe: makeStripe(),
    registerCardCharge: jest.fn(async (a) => payment({ provider: a.provider, provider_charge_id: a.chargeId, expires_at: a.expiresAt.toISOString() })),
    markPaid: jest.fn(async () => true),
    hmacHex: async (key, msg) => createHmac('sha256', key).update(msg).digest('hex'),
    ...over,
  };
}

describe('createCardIntentHandler', () => {
  it('sem login: 401, e nada é consultado nem cobrado', async () => {
    const d = makeDeps();
    expect((await createCardIntentHandler(d, null, { booking_id: BOOKING_ID })).status).toBe(401);
    expect(d.loadBooking).not.toHaveBeenCalled();
    expect(d.stripe!.createPaymentIntent).not.toHaveBeenCalled();
  });

  it('servidor sem chave da Stripe: 503 card_not_configured', async () => {
    const r = await createCardIntentHandler(makeDeps({ stripe: null }), 'Bearer guest', { booking_id: BOOKING_ID });
    expect(r).toEqual({ status: 503, body: { error: 'card_not_configured' } });
  });

  it('id de reserva inválido: 400', async () => {
    expect((await createCardIntentHandler(makeDeps(), 'Bearer guest', { booking_id: 'x' })).status).toBe(400);
    expect((await createCardIntentHandler(makeDeps(), 'Bearer guest', null)).status).toBe(400);
  });

  it('reserva de OUTRA pessoa: 404 e a Stripe não é chamada', async () => {
    const d = makeDeps();
    const r = await createCardIntentHandler(d, 'Bearer other', { booking_id: BOOKING_ID });
    expect(r.status).toBe(404);
    expect(d.stripe!.createPaymentIntent).not.toHaveBeenCalled();
  });

  it('reserva cancelada ou de Pix: 409', async () => {
    const cancelled = makeDeps({ loadBooking: async () => booking({ status: 'cancelada' }) });
    expect((await createCardIntentHandler(cancelled, 'Bearer guest', { booking_id: BOOKING_ID })).body).toEqual({ error: 'booking_not_active' });
    const pix = makeDeps({ loadBooking: async () => booking({ pay_method: 'pix' }) });
    expect((await createCardIntentHandler(pix, 'Bearer guest', { booking_id: BOOKING_ID })).body).toEqual({ error: 'booking_not_card' });
  });

  it('já paga: 409 already_paid', async () => {
    const d = makeDeps({ loadPayment: async () => payment({ status: 'pago' }) });
    expect((await createCardIntentHandler(d, 'Bearer guest', { booking_id: BOOKING_ID })).body).toEqual({ error: 'already_paid' });
  });

  it('anfitrião sem dados para receber: 422 e nada é cobrado', async () => {
    const d = makeDeps({ loadPayoutAccount: async () => null });
    const r = await createCardIntentHandler(d, 'Bearer guest', { booking_id: BOOKING_ID });
    expect(r).toEqual({ status: 422, body: { error: 'host_without_payout_account' } });
    expect(d.stripe!.createPaymentIntent).not.toHaveBeenCalled();
  });

  it('cria a cobrança: valor da RESERVA em centavos, prazo de 30 min, e devolve o client_secret sem a divisão', async () => {
    const d = makeDeps();
    const r = await createCardIntentHandler(d, 'Bearer guest', { booking_id: BOOKING_ID, amount: 1, total: 1 }); // valor vindo do app é ignorado
    expect(r.status).toBe(200);

    const sent = (d.stripe!.createPaymentIntent as jest.Mock).mock.calls[0][0];
    expect(sent.amountCents).toBe(66000);
    expect(sent.bookingId).toBe(BOOKING_ID);
    expect(sent.idempotencyKey).toMatch(/^rg-/);

    const reg = (d.registerCardCharge as jest.Mock).mock.calls[0][0];
    expect(reg).toMatchObject({ userId: GUEST, bookingId: BOOKING_ID, provider: 'stripe', chargeId: 'pi_1' });
    expect(reg.expiresAt.toISOString()).toBe('2026-12-01T12:30:00.000Z');

    expect(r.body.client_secret).toBe('pi_1_secret_zzz');
    const p = r.body.payment as Record<string, unknown>;
    expect(Object.keys(p).sort()).toEqual(['amount', 'booking_id', 'expires_at', 'id', 'status']);
    expect(JSON.stringify(r.body)).not.toContain('host_amount');
    expect(JSON.stringify(r.body)).not.toContain('pi_1"'); // id do provedor não vai para o app
  });

  it('reabrir a tela: mesma cobrança, sem criar outra na Stripe', async () => {
    const d = makeDeps({ loadPayment: async () => payment() });
    const r = await createCardIntentHandler(d, 'Bearer guest', { booking_id: BOOKING_ID });
    expect(r.status).toBe(200);
    expect(r.body.client_secret).toBe('pi_1_secret_zzz');
    expect(d.stripe!.getClientSecret).toHaveBeenCalledWith('pi_1');
    expect(d.stripe!.createPaymentIntent).not.toHaveBeenCalled();
    expect(d.registerCardCharge).not.toHaveBeenCalled();
  });

  it('reabrir uma cobrança que a Stripe já não aceita pagar: 409 payment_not_payable', async () => {
    const d = makeDeps({ loadPayment: async () => payment(), stripe: makeStripe({ getClientSecret: async () => null }) });
    expect((await createCardIntentHandler(d, 'Bearer guest', { booking_id: BOOKING_ID })).body).toEqual({ error: 'payment_not_payable' });
  });

  it('cobrança vencida: cria uma nova', async () => {
    const d = makeDeps({ loadPayment: async () => payment({ status: 'expirado', expires_at: '2026-12-01T11:00:00.000Z' }) });
    const r = await createCardIntentHandler(d, 'Bearer guest', { booking_id: BOOKING_ID });
    expect(r.status).toBe(200);
    expect(d.stripe!.createPaymentIntent).toHaveBeenCalledTimes(1);
  });

  it('Stripe fora do ar: 502 provider_error, nada é gravado, e o erro vai ao log', async () => {
    const d = makeDeps({ stripe: makeStripe({ createPaymentIntent: async () => { throw new Error('Stripe respondeu 500'); } }) });
    const r = await createCardIntentHandler(d, 'Bearer guest', { booking_id: BOOKING_ID });
    expect(r).toEqual({ status: 502, body: { error: 'provider_error' } });
    expect(d.registerCardCharge).not.toHaveBeenCalled();
    expect(d.log).toHaveBeenCalled();
  });

  it('banco recusa registrar: 409 charge_not_registered', async () => {
    const d = makeDeps({ registerCardCharge: async () => { throw new Error('Já existe uma cobrança para essa reserva.'); } });
    expect((await createCardIntentHandler(d, 'Bearer guest', { booking_id: BOOKING_ID })).body).toEqual({ error: 'charge_not_registered' });
  });
});

describe('stripeWebhookHandler', () => {
  const eventOf = (over: Record<string, unknown> = {}, type = 'payment_intent.succeeded') =>
    JSON.stringify({ type, data: { object: { id: 'pi_1', currency: 'brl', amount_received: 66000, ...over } } });
  const header = (body: string, t = Math.floor(NOW.getTime() / 1000), secret = SECRET) =>
    `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;

  it('sem segredo configurado: 401 (nunca aberto por esquecimento)', async () => {
    const body = eventOf();
    expect((await stripeWebhookHandler(makeDeps(), header(body), null, body)).status).toBe(401);
  });

  it('assinatura inválida, ausente ou de outro segredo: 400 e nada é marcado como pago', async () => {
    const d = makeDeps();
    const body = eventOf();
    expect((await stripeWebhookHandler(d, null, SECRET, body)).status).toBe(400);
    expect((await stripeWebhookHandler(d, 'lixo', SECRET, body)).status).toBe(400);
    expect((await stripeWebhookHandler(d, header(body, undefined, 'whsec_outro'), SECRET, body)).status).toBe(400);
    expect((await stripeWebhookHandler(d, header(body), SECRET, body.replace('66000', '1'))).status).toBe(400);
    expect(d.markPaid).not.toHaveBeenCalled();
  });

  it('mensagem antiga (repetição) é recusada', async () => {
    const d = makeDeps();
    const body = eventOf();
    const old = Math.floor(NOW.getTime() / 1000) - 3600;
    expect((await stripeWebhookHandler(d, header(body, old), SECRET, body)).status).toBe(400);
    expect(d.markPaid).not.toHaveBeenCalled();
  });

  it('pagamento concluído: confirma pela id do PaymentIntent', async () => {
    const d = makeDeps();
    const body = eventOf();
    const r = await stripeWebhookHandler(d, header(body), SECRET, body);
    expect(r).toEqual({ status: 200, body: { ok: true, changed: true } });
    expect(d.markPaid).toHaveBeenCalledWith('pi_1');
  });

  it('webhook repetido: 200 com changed=false', async () => {
    const d = makeDeps({ markPaid: async () => false });
    const body = eventOf();
    expect((await stripeWebhookHandler(d, header(body), SECRET, body)).body).toEqual({ ok: true, changed: false });
  });

  it('outros eventos: 200 ignorado, sem marcar nada', async () => {
    const d = makeDeps();
    const body = eventOf({}, 'payment_intent.created');
    expect(await stripeWebhookHandler(d, header(body), SECRET, body)).toEqual({ status: 200, body: { ignored: true } });
    expect(d.markPaid).not.toHaveBeenCalled();
  });

  it('cobrança que não é nossa: 200 ignorado', async () => {
    const d = makeDeps({ loadPaymentByCharge: async () => null });
    const body = eventOf({ id: 'pi_desconhecido' });
    const r = await stripeWebhookHandler(d, header(body), SECRET, body);
    expect(r.status).toBe(200);
    expect(r.body.reason).toBe('unknown_charge');
    expect(d.markPaid).not.toHaveBeenCalled();
  });

  it('valor ou moeda divergentes do banco: NÃO confirma e registra no log', async () => {
    const d = makeDeps();
    const menos = eventOf({ amount_received: 100 });
    expect((await stripeWebhookHandler(d, header(menos), SECRET, menos)).body.reason).toBe('amount_mismatch');
    const usd = eventOf({ currency: 'usd' });
    expect((await stripeWebhookHandler(d, header(usd), SECRET, usd)).body.reason).toBe('amount_mismatch');
    expect(d.markPaid).not.toHaveBeenCalled();
    expect(d.log).toHaveBeenCalledTimes(2);
  });

  it('corpo que não é JSON (mas bem assinado): 400', async () => {
    const d = makeDeps();
    const body = 'isto nao e json';
    expect((await stripeWebhookHandler(d, header(body), SECRET, body)).status).toBe(400);
  });

  it('falha do banco ao confirmar: 500 para a Stripe tentar de novo', async () => {
    const d = makeDeps({ markPaid: async () => { throw new Error('db fora'); } });
    const body = eventOf();
    expect((await stripeWebhookHandler(d, header(body), SECRET, body)).status).toBe(500);
  });
});
