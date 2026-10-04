jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: { onAuthStateChange: jest.fn(), signOut: jest.fn() },
    from: jest.fn(),
  })),
}));

// getOrCreateSupportConversation reaproveita getOrCreateConversation (a
// mesma function do botão "Contato" em details.tsx) - mockada aqui pra
// isolar o teste na lógica própria do supportService (achar o admin e
// montar os parâmetros certos), sem duplicar a cobertura de
// messageService.test.ts.
jest.mock('../messageService', () => ({
  getOrCreateConversation: jest.fn(),
}));

import { supabase } from '../../lib/supabase';
import { getOrCreateConversation } from '../messageService';
import { __resetSupportAdminCache, getOrCreateSupportConversation, getSupportAdminId } from '../supportService';

function makeBuilder(result: { data: any; error: any }): any {
  const builder: any = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    is: jest.fn(() => builder),
    order: jest.fn(() => builder),
    limit: jest.fn(() => builder),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
  };
  return builder;
}

const mockFrom = supabase.from as jest.Mock;
const mockGetOrCreateConversation = getOrCreateConversation as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  __resetSupportAdminCache(); // cache em memória não pode vazar de um teste pro outro
});

describe('supportService.getSupportAdminId', () => {
  it('busca o admin mais antigo (role=admin, sem soft-delete) e devolve o id', async () => {
    const builder = makeBuilder({ data: { id: 'admin-1' }, error: null });
    mockFrom.mockReturnValue(builder);

    const result = await getSupportAdminId();

    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(builder.select).toHaveBeenCalledWith('id');
    expect(builder.eq).toHaveBeenCalledWith('role', 'admin');
    expect(builder.is).toHaveBeenCalledWith('deleted_at', null);
    expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: true });
    expect(builder.limit).toHaveBeenCalledWith(1);
    expect(result).toEqual({ data: 'admin-1', error: null });
  });

  it('sem nenhum admin cadastrado ainda, devolve null - estado válido, não é erro', async () => {
    mockFrom.mockReturnValue(makeBuilder({ data: null, error: null }));

    const result = await getSupportAdminId();

    expect(result).toEqual({ data: null, error: null });
  });

  it('propaga erro do banco', async () => {
    mockFrom.mockReturnValue(makeBuilder({ data: null, error: { message: 'timeout' } }));

    const result = await getSupportAdminId();

    expect(result).toEqual({ data: null, error: 'timeout' });
  });

  it('usa cache em memória - uma segunda chamada não bate no banco de novo', async () => {
    const builder = makeBuilder({ data: { id: 'admin-1' }, error: null });
    mockFrom.mockReturnValue(builder);

    await getSupportAdminId();
    const second = await getSupportAdminId();

    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(second).toEqual({ data: 'admin-1', error: null });
  });
});

describe('supportService.getOrCreateSupportConversation', () => {
  it('acha o admin e reaproveita getOrCreateConversation (guest, admin, sem cabana)', async () => {
    mockFrom.mockReturnValue(makeBuilder({ data: { id: 'admin-1' }, error: null }));
    mockGetOrCreateConversation.mockResolvedValue({ data: 'conv-1', error: null });

    const result = await getOrCreateSupportConversation('guest-1');

    expect(mockGetOrCreateConversation).toHaveBeenCalledWith('guest-1', 'admin-1', null);
    expect(result).toEqual({ data: 'conv-1', error: null });
  });

  it('sem admin configurado, devolve erro claro sem chamar getOrCreateConversation', async () => {
    mockFrom.mockReturnValue(makeBuilder({ data: null, error: null }));

    const result = await getOrCreateSupportConversation('guest-1');

    expect(mockGetOrCreateConversation).not.toHaveBeenCalled();
    expect(result.data).toBeNull();
    expect(result.error).toMatch(/admin/i);
  });

  it('propaga erro da busca do admin', async () => {
    mockFrom.mockReturnValue(makeBuilder({ data: null, error: { message: 'falha de conexão' } }));

    const result = await getOrCreateSupportConversation('guest-1');

    expect(mockGetOrCreateConversation).not.toHaveBeenCalled();
    expect(result).toEqual({ data: null, error: 'falha de conexão' });
  });
});
