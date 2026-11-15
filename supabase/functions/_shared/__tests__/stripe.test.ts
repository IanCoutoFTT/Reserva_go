import { stripeApi } from '../stripe.ts';

const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

describe('stripeApi.createPaymentIntent', () => {
  it('manda valor em centavos, brl, metadados e a chave de idempotência (sem payment_method_types)', async () => {
    const fetchImpl = jest.fn(async () => json(200, { id: 'pi_123', client_secret: 'pi_123_secret_abc' }));
    const api = stripeApi({ secretKey: 'sk_test_x', fetchImpl: fetchImpl as unknown as typeof fetch });
    const r = await api.createPaymentIntent({ amountCents: 66000, bookingId: 'b-1', description: 'ReservaGO: Chalé', idempotencyKey: 'rg-b-1-5' });
    expect(r).toEqual({ id: 'pi_123', clientSecret: 'pi_123_secret_abc' });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.stripe.com/v1/payment_intents');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer sk_test_x');
    expect(headers['Idempotency-Key']).toBe('rg-b-1-5');
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    const form = new URLSearchParams(init.body as string);
    expect(form.get('amount')).toBe('66000');
    expect(form.get('currency')).toBe('brl');
    // payment_method_types não é mais aceito pela API da Stripe (400): nunca enviar.
    expect(form.has('payment_method_types[]')).toBe(false);
    expect(form.has('payment_method_types')).toBe(false);
    expect(form.get('metadata[booking_id]')).toBe('b-1');
    expect(form.get('metadata[app]')).toBe('reservago');
  });

  it('erro da Stripe vira exceção com a mensagem, sem vazar a chave', async () => {
    const api = stripeApi({ secretKey: 'sk_test_segredo', fetchImpl: (async () => json(401, { error: { message: 'Invalid API Key provided' } })) as unknown as typeof fetch });
    await expect(api.createPaymentIntent({ amountCents: 100, bookingId: 'b', description: 'd', idempotencyKey: 'k' })).rejects.toThrow(/401.*Invalid API Key/);
    await expect(api.createPaymentIntent({ amountCents: 100, bookingId: 'b', description: 'd', idempotencyKey: 'k' })).rejects.not.toThrow(/sk_test_segredo/);
  });

  it('resposta sem id ou client_secret é erro', async () => {
    const api = stripeApi({ secretKey: 'sk_test_x', fetchImpl: (async () => json(200, { id: 'pi_1' })) as unknown as typeof fetch });
    await expect(api.createPaymentIntent({ amountCents: 100, bookingId: 'b', description: 'd', idempotencyKey: 'k' })).rejects.toThrow();
  });
});

describe('stripeApi.getClientSecret', () => {
  const make = (body: unknown) => stripeApi({ secretKey: 'sk_test_x', fetchImpl: (async () => json(200, body)) as unknown as typeof fetch });

  it('devolve o client_secret de uma cobrança que ainda aceita pagamento', async () => {
    expect(await make({ status: 'requires_payment_method', client_secret: 'sec' }).getClientSecret('pi_1')).toBe('sec');
    expect(await make({ status: 'requires_action', client_secret: 'sec' }).getClientSecret('pi_1')).toBe('sec');
  });
  it('devolve null se já foi paga, cancelada ou está processando', async () => {
    for (const status of ['succeeded', 'canceled', 'processing']) {
      expect(await make({ status, client_secret: 'sec' }).getClientSecret('pi_1')).toBeNull();
    }
  });
  it('consulta o PaymentIntent certo, com o id escapado', async () => {
    const fetchImpl = jest.fn(async () => json(200, { status: 'succeeded' }));
    await stripeApi({ secretKey: 'sk_test_x', fetchImpl: fetchImpl as unknown as typeof fetch }).getClientSecret('pi_1/../x');
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe('https://api.stripe.com/v1/payment_intents/pi_1%2F..%2Fx');
  });
});
