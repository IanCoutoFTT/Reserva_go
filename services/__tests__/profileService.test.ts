// Confirma que updateRole() usa o RPC set_own_role (migração 001 / RLS
// profiles_self_update) e NUNCA faz update direto na coluna role - um
// update direto seria rejeitado pelo banco de qualquer forma (WITH CHECK
// compara com a role atual via subquery), mas o objetivo aqui é travar o
// contrato do service em código, não só confiar que o banco rejeitaria.
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: { onAuthStateChange: jest.fn(), signOut: jest.fn() },
    rpc: jest.fn(),
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(),
    })),
    storage: { from: jest.fn() },
  })),
}));

// uploadAvatar lê o arquivo via expo-file-system (File.arrayBuffer()) -
// fetch(uri).blob() foi testado ao vivo num Android real e falhou com
// "Network request failed" no upload pro Storage (ver comentário na função).
const mockArrayBuffer = jest.fn();
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({ arrayBuffer: mockArrayBuffer })),
}));

import { supabase } from '../../lib/supabase';
import { getProfilesByIds, updateRole, uploadAvatar } from '../profileService';

const mockRpc = supabase.rpc as jest.Mock;
const mockFrom = supabase.from as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('profileService.updateRole', () => {
  it('chama supabase.rpc("set_own_role", ...) para uma role válida, sem tocar em from("profiles").update(...)', async () => {
    mockRpc.mockResolvedValue({
      data: { id: 'user-1', role: 'anfitriao' },
      error: null,
    });

    const result = await updateRole('anfitriao');

    expect(mockRpc).toHaveBeenCalledWith('set_own_role', { new_role: 'anfitriao' });
    expect(mockFrom).not.toHaveBeenCalled();
    expect(result).toEqual({ data: { id: 'user-1', role: 'anfitriao' }, error: null });
  });

  it('recusa role "admin" sem nem chamar o RPC (short-circuit no client)', async () => {
    const result = await updateRole('admin');

    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
    expect(result.data).toBeNull();
    expect(result.error).toMatch(/admin/i);
  });

  it('propaga o erro quando o RPC falha (ex.: RAISE EXCEPTION do set_own_role no banco)', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Não é permitido definir a própria role como admin' },
    });

    const result = await updateRole('hospede');

    expect(mockRpc).toHaveBeenCalledWith('set_own_role', { new_role: 'hospede' });
    expect(result.data).toBeNull();
    expect(result.error).toBe('Não é permitido definir a própria role como admin');
  });
});

describe('profileService.uploadAvatar', () => {
  beforeEach(() => {
    mockArrayBuffer.mockResolvedValue(new ArrayBuffer(8));
  });

  it('caminho feliz: sobe o ArrayBuffer (File.arrayBuffer()) pro bucket "avatars" e devolve a URL pública', async () => {
    const mockUpload = jest.fn().mockResolvedValue({ error: null });
    const mockGetPublicUrl = jest.fn().mockReturnValue({ data: { publicUrl: 'https://cdn/avatar.jpg' } });
    (supabase.storage.from as jest.Mock).mockReturnValue({ upload: mockUpload, getPublicUrl: mockGetPublicUrl });

    const result = await uploadAvatar('file:///foto.jpg', 'user-1');

    expect(supabase.storage.from).toHaveBeenCalledWith('avatars');
    expect(mockUpload).toHaveBeenCalledWith(
      expect.stringContaining('user-1/'),
      expect.any(ArrayBuffer),
      expect.objectContaining({ contentType: 'image/jpg' })
    );
    expect(result).toEqual({ data: 'https://cdn/avatar.jpg', error: null });
  });

  it('erro no upload não derruba a função - devolve { data: null, error }', async () => {
    (supabase.storage.from as jest.Mock).mockReturnValue({
      upload: jest.fn().mockResolvedValue({ error: { message: 'bucket cheio' } }),
      getPublicUrl: jest.fn(),
    });

    const result = await uploadAvatar('file:///foto.jpg', 'user-1');

    expect(result).toEqual({ data: null, error: 'bucket cheio' });
  });
});

// getProfilesByIds - usado por app/(tabs)/messages.tsx (branch feature/mensagens)
// pra buscar nome/avatar de vários anfitriões de uma vez (histórico de
// reservas do hóspede), mesmo padrão .in('id', ids) de adminService.getReportsWithContext.
describe('profileService.getProfilesByIds', () => {
  it('busca vários perfis de uma vez via .in("id", ids)', async () => {
    const mockIn = jest.fn().mockResolvedValue({
      data: [{ id: 'host-1', name: 'Carlos' }],
      error: null,
    });
    const builder = { select: jest.fn().mockReturnThis(), in: mockIn };
    (mockFrom as jest.Mock).mockReturnValueOnce(builder as any);

    const result = await getProfilesByIds(['host-1']);

    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(builder.select).toHaveBeenCalledWith('*');
    expect(mockIn).toHaveBeenCalledWith('id', ['host-1']);
    expect(result).toEqual({ data: [{ id: 'host-1', name: 'Carlos' }], error: null });
  });

  it('lista vazia não bate no banco', async () => {
    const result = await getProfilesByIds([]);

    expect(mockFrom).not.toHaveBeenCalled();
    expect(result).toEqual({ data: [], error: null });
  });
});
