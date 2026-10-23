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
import { getMyProfile, getProfile, getProfilesByIds, updateProfile, updateRole, uploadAvatar } from '../profileService';

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
    expect(builder.select).toHaveBeenCalledWith(
      'id, name, avatar_url, role, bio, interests, created_at, updated_at, deleted_at'
    );
    expect(mockIn).toHaveBeenCalledWith('id', ['host-1']);
    expect(result).toEqual({ data: [{ id: 'host-1', name: 'Carlos' }], error: null });
  });

  it('lista vazia não bate no banco', async () => {
    const result = await getProfilesByIds([]);

    expect(mockFrom).not.toHaveBeenCalled();
    expect(result).toEqual({ data: [], error: null });
  });
});

// Migração 007: email/phone saíram do SELECT público. Estes testes travam o
// contrato novo no código (nenhum select('*'), perfil próprio via RPC).
const PUBLIC_COLUMNS = 'id, name, avatar_url, role, bio, interests, created_at, updated_at, deleted_at';

describe('profileService.getMyProfile', () => {
  it('lê o perfil completo do próprio usuário pela função get_my_profile', async () => {
    const mockSingle = jest.fn().mockResolvedValue({
      data: { id: 'u1', email: 'a@b.com', phone: '62999990000' },
      error: null,
    });
    mockRpc.mockReturnValueOnce({ single: mockSingle });

    const result = await getMyProfile();

    expect(mockRpc).toHaveBeenCalledWith('get_my_profile');
    expect(mockFrom).not.toHaveBeenCalled();
    expect(result).toEqual({ data: { id: 'u1', email: 'a@b.com', phone: '62999990000' }, error: null });
  });

  it('devolve o erro quando a conta não tem perfil visível (PGRST116 / conta excluída)', async () => {
    mockRpc.mockReturnValueOnce({
      single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'no rows' } }),
    });

    const result = await getMyProfile();

    expect(result).toEqual({ data: null, error: 'no rows' });
  });
});

describe('profileService.getProfile', () => {
  it('lê só as colunas públicas (nunca select("*"))', async () => {
    const builder = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: 'host-1', name: 'Carlos' }, error: null }),
    };
    mockFrom.mockReturnValueOnce(builder);

    const result = await getProfile('host-1');

    expect(builder.select).toHaveBeenCalledWith(PUBLIC_COLUMNS);
    expect(builder.eq).toHaveBeenCalledWith('id', 'host-1');
    expect(result.data).toEqual({ id: 'host-1', name: 'Carlos' });
  });
});

describe('profileService.updateProfile', () => {
  it('grava e confirma só o id (UPDATE ... RETURNING * não pode mais ler email/phone)', async () => {
    const builder = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: 'u1' }, error: null }),
    };
    mockFrom.mockReturnValueOnce(builder);

    const result = await updateProfile('u1', { phone: '62988887777' });

    expect(builder.update).toHaveBeenCalledWith({ phone: '62988887777' });
    expect(builder.select).toHaveBeenCalledWith('id');
    expect(result).toEqual({ data: { id: 'u1' }, error: null });
  });

  it('se o UPDATE falhar, devolve o erro', async () => {
    const builder = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: { message: 'sem permissão' } }),
    };
    mockFrom.mockReturnValueOnce(builder);

    const result = await updateProfile('u1', { bio: 'x' });

    expect(result).toEqual({ data: null, error: 'sem permissão' });
  });
});
