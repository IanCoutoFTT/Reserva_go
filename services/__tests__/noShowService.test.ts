const mockRpc = jest.fn();
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: { onAuthStateChange: jest.fn(), signOut: jest.fn() },
    from: jest.fn(),
    rpc: (...args: unknown[]) => mockRpc(...args),
  })),
}));

import { clearNoShow, markNoShow } from '../bookingService';

beforeEach(() => jest.clearAllMocks());

describe('bookingService.markNoShow', () => {
  it('chama a função do banco só com o id da reserva', async () => {
    mockRpc.mockResolvedValue({ error: null });
    const r = await markNoShow('b1');
    expect(mockRpc).toHaveBeenCalledWith('mark_no_show', { p_booking_id: 'b1' });
    expect(r).toEqual({ data: true, error: null });
  });

  it('mostra a mensagem de regra do banco (check_violation) em português', async () => {
    mockRpc.mockResolvedValue({ error: { code: '23514', message: 'Só dá para marcar o não comparecimento depois do dia do check-in.' } });
    expect((await markNoShow('b1')).error).toBe('Só dá para marcar o não comparecimento depois do dia do check-in.');
  });

  it('qualquer outro erro vira texto genérico (sem vazar mensagem técnica)', async () => {
    mockRpc.mockResolvedValue({ error: { code: 'P0002', message: 'Reserva não encontrada.' } });
    const r = await markNoShow('b1');
    expect(r.data).toBeNull();
    expect(r.error).toBe('Não foi possível registrar agora. Tente novamente.');
    mockRpc.mockResolvedValue({ error: { code: '42501', message: 'permission denied for function x' } });
    expect((await markNoShow('b1')).error).not.toContain('permission denied');
  });
});

describe('bookingService.clearNoShow', () => {
  it('chama clear_no_show', async () => {
    mockRpc.mockResolvedValue({ error: null });
    expect(await clearNoShow('b1')).toEqual({ data: true, error: null });
    expect(mockRpc).toHaveBeenCalledWith('clear_no_show', { p_booking_id: 'b1' });
  });
  it('prazo vencido: mostra a mensagem do banco', async () => {
    mockRpc.mockResolvedValue({ error: { code: '23514', message: 'O prazo de 48 horas para desfazer acabou. Fale com a equipe.' } });
    expect((await clearNoShow('b1')).error).toMatch(/48 horas/);
  });
});
