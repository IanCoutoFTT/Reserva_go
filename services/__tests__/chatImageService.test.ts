const mockUpload = jest.fn();
const mockSigned = jest.fn();
const mockInsert = jest.fn();
const mockFrom = jest.fn();
const mockStorageFrom = jest.fn();
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: { onAuthStateChange: jest.fn(), signOut: jest.fn() },
    from: (...a: unknown[]) => mockFrom(...a),
    storage: { from: (...a: unknown[]) => mockStorageFrom(...a) },
    rpc: jest.fn(),
  })),
}));
const mockArrayBuffer = jest.fn();
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({ arrayBuffer: (...a: unknown[]) => mockArrayBuffer(...a) })),
}));

import { clearChatImageCache, getChatImageUrl, sendImageMessage } from '../chatImageService';

const args = { conversationId: 'conv-1', senderId: 'u1', uri: 'file:///tmp/foto.jpg' };

beforeEach(() => {
  jest.clearAllMocks();
  clearChatImageCache();
  mockArrayBuffer.mockResolvedValue(new ArrayBuffer(8));
  mockUpload.mockResolvedValue({ error: null });
  mockSigned.mockResolvedValue({ data: { signedUrl: 'https://x/assinada' }, error: null });
  mockStorageFrom.mockReturnValue({ upload: mockUpload, createSignedUrl: mockSigned });
  const builder: any = { insert: mockInsert, select: jest.fn(() => builder), single: jest.fn(() => Promise.resolve({ data: { id: 'm1', image_path: 'p' }, error: null })) };
  mockInsert.mockReturnValue(builder);
  mockFrom.mockReturnValue(builder);
});

describe('sendImageMessage', () => {
  it('envia o arquivo para o bucket privado, na pasta da conversa, e cria a mensagem com o caminho', async () => {
    const r = await sendImageMessage({ ...args, caption: '  Olha a vista!  ' });
    expect(r.error).toBeNull();
    expect(mockStorageFrom).toHaveBeenCalledWith('chat-images');
    const [path, , opts] = mockUpload.mock.calls[0];
    expect(path).toMatch(/^conv-1\/\d+-[a-z0-9]+\.jpg$/);
    expect(opts).toEqual({ contentType: 'image/jpeg', upsert: false });
    expect(mockFrom).toHaveBeenCalledWith('messages');
    expect(mockInsert).toHaveBeenCalledWith({ conversation_id: 'conv-1', sender_id: 'u1', content: 'Olha a vista!', image_path: path });
  });

  it('sem legenda, o texto da mensagem é "📷 Foto"', async () => {
    await sendImageMessage(args);
    expect(mockInsert.mock.calls[0][0].content).toBe('📷 Foto');
  });

  it('foto grande demais é recusada ANTES de enviar qualquer coisa', async () => {
    const r = await sendImageMessage({ ...args, fileSize: 5 * 1024 * 1024 });
    expect(r.data).toBeNull();
    expect(r.error).toMatch(/3 MB/);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('falha no upload: mensagem clara, e a mensagem NÃO é criada', async () => {
    mockUpload.mockResolvedValue({ error: { message: 'detalhe tecnico' } });
    const r = await sendImageMessage(args);
    expect(r.error).toBe('Não foi possível enviar a foto agora. Tente novamente.');
    expect(r.error).not.toContain('tecnico');
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('erro do banco ao criar a mensagem chega à tela (limite de envio em português)', async () => {
    const builder: any = { select: jest.fn(() => builder), single: jest.fn(() => Promise.resolve({ data: null, error: { message: 'Limite de envio: você mandou mensagens demais em pouco tempo.' } })) };
    mockInsert.mockReturnValue(builder);
    const r = await sendImageMessage(args);
    expect(r.error).toMatch(/^Limite de envio:/);
  });

  it('falha ao ler o arquivo local: erro genérico, sem quebrar', async () => {
    mockArrayBuffer.mockRejectedValue(new Error('arquivo sumiu'));
    const r = await sendImageMessage(args);
    expect(r.data).toBeNull();
    expect(r.error).toMatch(/Não foi possível enviar a foto/);
  });
});

describe('getChatImageUrl', () => {
  it('pede o link temporário de 1 hora e devolve', async () => {
    expect(await getChatImageUrl('conv-1/a.jpg')).toEqual({ data: 'https://x/assinada', error: null });
    expect(mockSigned).toHaveBeenCalledWith('conv-1/a.jpg', 3600);
  });
  it('a segunda chamada usa a memória, sem pedir de novo', async () => {
    await getChatImageUrl('conv-1/a.jpg', 1_000);
    await getChatImageUrl('conv-1/a.jpg', 2_000);
    expect(mockSigned).toHaveBeenCalledTimes(1);
  });
  it('depois de 50 minutos o link é pedido de novo', async () => {
    await getChatImageUrl('conv-1/a.jpg', 0);
    await getChatImageUrl('conv-1/a.jpg', 51 * 60 * 1000);
    expect(mockSigned).toHaveBeenCalledTimes(2);
  });
  it('sem permissão ou arquivo inexistente: aviso, sem expor o erro técnico', async () => {
    mockSigned.mockResolvedValue({ data: null, error: { message: 'Object not found' } });
    const r = await getChatImageUrl('conv-9/x.jpg');
    expect(r).toEqual({ data: null, error: 'Não foi possível carregar a foto.' });
  });
});
