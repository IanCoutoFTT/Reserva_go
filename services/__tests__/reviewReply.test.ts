const mockRpc = jest.fn();
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: { onAuthStateChange: jest.fn(), signOut: jest.fn() },
    from: jest.fn(),
    rpc: (...args: unknown[]) => mockRpc(...args),
  })),
}));

import { replyToReview } from '../reviewService';

beforeEach(() => jest.clearAllMocks());

describe('reviewService.replyToReview', () => {
  it('chama a função do banco com o id e o texto', async () => {
    mockRpc.mockResolvedValue({ error: null });
    expect(await replyToReview('r1', 'Obrigado!')).toEqual({ data: true, error: null });
    expect(mockRpc).toHaveBeenCalledWith('reply_to_review', { p_review_id: 'r1', p_reply: 'Obrigado!' });
  });
  it('mostra a mensagem de regra do banco em português', async () => {
    mockRpc.mockResolvedValue({ error: { code: '23514', message: 'O prazo de 24 horas para corrigir a resposta acabou.' } });
    expect((await replyToReview('r1', 'x')).error).toMatch(/24 horas/);
  });
  it('outros erros viram texto genérico, sem vazar mensagem técnica', async () => {
    mockRpc.mockResolvedValue({ error: { code: 'P0002', message: 'Avaliação não encontrada.' } });
    const r = await replyToReview('r1', 'x');
    expect(r.data).toBeNull();
    expect(r.error).toBe('Não foi possível enviar a resposta agora. Tente novamente.');
  });
});
