const mockInvoke = jest.fn();
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: { onAuthStateChange: jest.fn(), signOut: jest.fn() },
    from: jest.fn(),
    rpc: jest.fn(),
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
  })),
}));

import { createCardIntent } from '../paymentService';

const payment = { id: 'p1', booking_id: 'b1', status: 'aguardando', amount: 660, expires_at: '2026-12-01T12:30:00.000Z' };
const httpError = (code: unknown) => ({ message: 'Edge Function returned a non-2xx status code', context: { json: async () => ({ error: code }) } });

beforeEach(() => jest.clearAllMocks());

describe('paymentService.createCardIntent', () => {
  it('chama card-create-intent só com o id da reserva (sem valores) e devolve a cobrança e o client_secret', async () => {
    mockInvoke.mockResolvedValue({ data: { payment, client_secret: 'pi_1_secret_abc' }, error: null });
    const r = await createCardIntent('b1');
    expect(mockInvoke).toHaveBeenCalledWith('card-create-intent', { body: { booking_id: 'b1' } });
    expect(r).toEqual({ data: { payment, clientSecret: 'pi_1_secret_abc' }, error: null, code: null });
  });

  it('traduz os códigos de erro do cartão para mensagens em português', async () => {
    for (const [code, trecho] of [
      ['card_not_configured', /cartão não está disponível/],
      ['host_without_payout_account', /anfitrião ainda não configurou/],
      ['booking_not_card', /cartão/],
      ['payment_not_payable', /não aceita mais pagamento/],
      ['already_paid', /já foi paga/],
    ] as const) {
      mockInvoke.mockResolvedValue({ data: null, error: httpError(code) });
      const r = await createCardIntent('b1');
      expect(r.code).toBe(code);
      expect(r.error).toMatch(trecho);
      expect(r.data).toBeNull();
    }
  });

  it('código desconhecido ou falha de rede viram erro genérico (não mostra texto do servidor)', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: httpError('<script>x</script>') });
    expect((await createCardIntent('b1')).code).toBe('unknown');
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'falha de rede' } });
    const r = await createCardIntent('b1');
    expect(r.code).toBe('unknown');
    expect(r.error).not.toContain('falha de rede');
  });

  it('resposta sem client_secret ou sem cobrança é tratada como erro', async () => {
    mockInvoke.mockResolvedValue({ data: { payment }, error: null });
    expect((await createCardIntent('b1')).code).toBe('unknown');
    mockInvoke.mockResolvedValue({ data: { payment, client_secret: '' }, error: null });
    expect((await createCardIntent('b1')).code).toBe('unknown');
    mockInvoke.mockResolvedValue({ data: { client_secret: 'x' }, error: null });
    expect((await createCardIntent('b1')).code).toBe('unknown');
  });
});
