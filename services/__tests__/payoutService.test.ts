jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: { onAuthStateChange: jest.fn(), signOut: jest.fn() },
    from: jest.fn(),
    rpc: jest.fn(),
  })),
}));

import { supabase } from '../../lib/supabase';
import { getMyPayout, savePayout } from '../payoutService';

const value = { full_name: 'Maria da Silva', document: '52998224725', pix_key_type: 'cpf' as const, pix_key: '52998224725' };

function builder(result: { data: any; error: any }): any {
  const b: any = {
    select: jest.fn(() => b),
    eq: jest.fn(() => b),
    upsert: jest.fn(() => b),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
    single: jest.fn(() => Promise.resolve(result)),
  };
  return b;
}
const mockFrom = supabase.from as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('payoutService.getMyPayout', () => {
  it('lê só a linha do próprio usuário e devolve os dados', async () => {
    const b = builder({ data: value, error: null });
    mockFrom.mockReturnValue(b);
    expect(await getMyPayout('u1')).toEqual({ data: value, error: null });
    expect(mockFrom).toHaveBeenCalledWith('payout_accounts');
    expect(b.eq).toHaveBeenCalledWith('user_id', 'u1');
  });

  it('sem cadastro devolve null, sem erro', async () => {
    mockFrom.mockReturnValue(builder({ data: null, error: null }));
    expect(await getMyPayout('u1')).toEqual({ data: null, error: null });
  });

  it('erro técnico vira mensagem simples', async () => {
    mockFrom.mockReturnValue(builder({ data: null, error: { message: 'relation "payout_accounts" does not exist', code: '42P01' } }));
    const r = await getMyPayout('u1');
    expect(r.data).toBeNull();
    expect(r.error).not.toContain('relation');
  });
});

describe('payoutService.savePayout', () => {
  it('grava (upsert por user_id) e devolve o que o banco normalizou', async () => {
    const b = builder({ data: value, error: null });
    mockFrom.mockReturnValue(b);
    const r = await savePayout('u1', value);
    expect(b.upsert).toHaveBeenCalledWith({ user_id: 'u1', ...value }, { onConflict: 'user_id' });
    expect(r).toEqual({ data: value, error: null });
  });

  it('mostra a mensagem em português que o gatilho do banco devolve', async () => {
    mockFrom.mockReturnValue(builder({ data: null, error: { message: 'CPF inválido.', code: '23514' } }));
    expect(await savePayout('u1', value)).toEqual({ data: null, error: 'CPF inválido.' });
  });

  it('erro de constraint em inglês ou outro código vira texto genérico', async () => {
    mockFrom.mockReturnValue(builder({ data: null, error: { message: 'new row violates check constraint "payout_accounts_campos_validos"', code: '23514' } }));
    const a = await savePayout('u1', value);
    expect(a.error).not.toContain('constraint');

    mockFrom.mockReturnValue(builder({ data: null, error: { message: 'permission denied for table payout_accounts', code: '42501' } }));
    const b = await savePayout('u1', value);
    expect(b.error).not.toContain('permission');
  });
});
