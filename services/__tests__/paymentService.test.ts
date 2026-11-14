const mockInvoke = jest.fn();
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: { onAuthStateChange: jest.fn(), signOut: jest.fn() },
    from: jest.fn(),
    rpc: jest.fn(),
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
  })),
}));

import { supabase } from '../../lib/supabase';
import { createPixCharge, getPaymentByBooking, simulatePixPayment } from '../paymentService';

const payment = {
  id: 'p1', booking_id: 'b1', status: 'aguardando', amount: 627,
  pix_copy_paste: 'SIMULADO-x', pix_qr_image: null, expires_at: '2026-12-01T12:30:00.000Z',
};

/** Erro no formato do supabase-js: o corpo da resposta vem em error.context. */
const httpError = (code: unknown) => ({ message: 'Edge Function returned a non-2xx status code', context: { json: async () => ({ error: code }) } });

beforeEach(() => jest.clearAllMocks());

describe('paymentService.createPixCharge', () => {
  it('chama pix-create-charge só com o id da reserva (sem valores) e devolve a cobrança', async () => {
    mockInvoke.mockResolvedValue({ data: { payment }, error: null });
    const r = await createPixCharge('b1');
    expect(mockInvoke).toHaveBeenCalledWith('pix-create-charge', { body: { booking_id: 'b1' } });
    expect(r).toEqual({ data: payment, error: null, code: null });
  });

  it('envia o CPF quando informado', async () => {
    mockInvoke.mockResolvedValue({ data: { payment }, error: null });
    await createPixCharge('b1', '529.982.247-25');
    expect(mockInvoke).toHaveBeenCalledWith('pix-create-charge', { body: { booking_id: 'b1', cpf: '529.982.247-25' } });
  });

  it('traduz o código de erro da função para uma mensagem em português', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: httpError('cpf_required') });
    const r = await createPixCharge('b1');
    expect(r.code).toBe('cpf_required');
    expect(r.error).toMatch(/CPF/);
    expect(r.data).toBeNull();
  });

  it('código desconhecido ou corpo ilegível viram erro genérico (não mostra texto do servidor)', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: httpError('<script>alert(1)</script>') });
    expect((await createPixCharge('b1')).code).toBe('unknown');

    mockInvoke.mockResolvedValue({ data: null, error: { message: 'falha de rede' } });
    const r = await createPixCharge('b1');
    expect(r.code).toBe('unknown');
    expect(r.error).not.toContain('falha de rede');
  });

  it('resposta sem cobrança é tratada como erro', async () => {
    mockInvoke.mockResolvedValue({ data: {}, error: null });
    expect((await createPixCharge('b1')).code).toBe('unknown');
  });
});

describe('paymentService.simulatePixPayment', () => {
  it('chama pix-simulate-payment', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true }, error: null });
    expect(await simulatePixPayment('b1')).toEqual({ data: true, error: null, code: null });
    expect(mockInvoke).toHaveBeenCalledWith('pix-simulate-payment', { body: { booking_id: 'b1' } });
  });

  it('fora do modo simulado a função responde 404 e o app mostra erro genérico', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: httpError('not_found') });
    const r = await simulatePixPayment('b1');
    expect(r.data).toBeNull();
    expect(r.code).toBe('unknown');
  });
});

describe('paymentService.getPaymentByBooking', () => {
  it('lê só as colunas públicas da cobrança (nunca a divisão do valor)', async () => {
    const builder: any = {
      select: jest.fn(() => builder),
      eq: jest.fn(() => builder),
      maybeSingle: jest.fn(() => Promise.resolve({ data: payment, error: null })),
    };
    (supabase.from as jest.Mock).mockReturnValue(builder);

    const r = await getPaymentByBooking('b1');

    expect(supabase.from).toHaveBeenCalledWith('payments');
    const cols = builder.select.mock.calls[0][0] as string;
    expect(cols).not.toMatch(/host_amount|platform_fee|provider_charge_id/);
    expect(builder.eq).toHaveBeenCalledWith('booking_id', 'b1');
    expect(r).toEqual({ data: payment, error: null });
  });
});
