const mockInsert = jest.fn();
const mockDelete = jest.fn();
const mockFrom = jest.fn();
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: { onAuthStateChange: jest.fn(), signOut: jest.fn() },
    from: (...a: unknown[]) => mockFrom(...a),
    rpc: jest.fn(),
  })),
}));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.2.3' } } }));

import { clearErrors, getRecentErrors, reportError } from '../errorService';

const g = globalThis as unknown as { __DEV__: boolean };
const original = g.__DEV__;

beforeEach(() => {
  jest.clearAllMocks();
  g.__DEV__ = false; // em desenvolvimento o envio é desligado
  mockInsert.mockResolvedValue({ error: null });
  mockFrom.mockReturnValue({
    insert: mockInsert,
    select: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }),
    delete: () => ({ gte: mockDelete }),
  });
});
afterAll(() => {
  g.__DEV__ = original;
});

describe('reportError', () => {
  it('em desenvolvimento não envia nada', () => {
    g.__DEV__ = true;
    reportError(new Error('x'));
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('envia o relatório limpo, com versão e plataforma', () => {
    reportError(new Error('falha para ana@x.com'), 'details');
    expect(mockFrom).toHaveBeenCalledWith('app_errors');
    const sent = mockInsert.mock.calls[0][0];
    expect(sent).toMatchObject({ screen: 'details', app_version: '1.2.3' });
    expect(sent.message).toBe('falha para [e-mail]');
    expect(typeof sent.platform).toBe('string');
  });

  it('o mesmo erro em sequência é enviado uma vez só', () => {
    const err = new Error('repetido unico 123'); // o mesmo erro, do mesmo lugar
    reportError(err);
    reportError(err);
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it('nunca propaga falha: nem de rede, nem do banco', () => {
    mockInsert.mockRejectedValue(new Error('sem rede'));
    expect(() => reportError(new Error('erro com rede caida'))).not.toThrow();
    mockFrom.mockImplementation(() => {
      throw new Error('cliente quebrado');
    });
    expect(() => reportError(new Error('erro com cliente quebrado'))).not.toThrow();
  });
});

describe('getRecentErrors e clearErrors', () => {
  it('lista vazia quando não há erros', async () => {
    expect(await getRecentErrors()).toEqual({ data: [], error: null });
  });
  it('tabela inexistente (migração 022 não aplicada): aviso claro', async () => {
    mockFrom.mockReturnValue({
      select: () => ({ order: () => ({ limit: () => Promise.resolve({ data: null, error: { code: '42P01', message: 'x' } }) }) }),
    });
    expect((await getRecentErrors()).error).toMatch(/ainda não está ativo/);
  });
  it('clearErrors apaga e devolve sucesso', async () => {
    mockDelete.mockResolvedValue({ error: null });
    expect(await clearErrors()).toEqual({ data: true, error: null });
  });
});
