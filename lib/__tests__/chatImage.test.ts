import { CHAT_IMAGE_MAX_BYTES, chatImagePath, isDefaultCaption, photoCaption, PHOTO_CAPTION, validateChatImage } from '../chatImage';

describe('photoCaption', () => {
  it('usa a legenda digitada, sem espaços nas pontas', () => {
    expect(photoCaption('  Olha a vista!  ')).toBe('Olha a vista!');
  });
  it('sem legenda vira "📷 Foto"', () => {
    expect(photoCaption('')).toBe(PHOTO_CAPTION);
    expect(photoCaption('   ')).toBe(PHOTO_CAPTION);
    expect(photoCaption(null)).toBe(PHOTO_CAPTION);
    expect(photoCaption(undefined)).toBe(PHOTO_CAPTION);
  });
  it('isDefaultCaption só reconhece o texto padrão', () => {
    expect(isDefaultCaption(PHOTO_CAPTION)).toBe(true);
    expect(isDefaultCaption('Olha a vista!')).toBe(false);
  });
});

describe('validateChatImage', () => {
  it('aceita foto de até 3 MB e foto sem tamanho informado', () => {
    expect(validateChatImage({ uri: 'file:///a.jpg', fileSize: CHAT_IMAGE_MAX_BYTES })).toBeNull();
    expect(validateChatImage({ uri: 'file:///a.jpg' })).toBeNull();
    expect(validateChatImage({ uri: 'file:///a.jpg', fileSize: null })).toBeNull();
  });
  it('recusa acima de 3 MB, com o motivo', () => {
    expect(validateChatImage({ uri: 'file:///a.jpg', fileSize: CHAT_IMAGE_MAX_BYTES + 1 })).toMatch(/até 3 MB/);
  });
  it('recusa quando não há arquivo', () => {
    expect(validateChatImage({ uri: '' })).toMatch(/ler a foto/);
  });
});

describe('chatImagePath', () => {
  it('fica na pasta da conversa, com a extensão certa', () => {
    expect(chatImagePath('conv-1', 'file:///x/foto.PNG', 1700000000000, 'abc123')).toBe('conv-1/1700000000000-abc123.png');
    expect(chatImagePath('conv-1', 'file:///x/foto.jpeg', 1, 'z')).toBe('conv-1/1-z.jpg');
  });
  it('extensão desconhecida vira jpg (o bucket só aceita imagem)', () => {
    expect(chatImagePath('c', 'file:///x/arquivo.exe', 1, 'z')).toBe('c/1-z.jpg');
  });
  it('caminhos de envios diferentes não colidem', () => {
    const a = chatImagePath('c', 'file:///a.jpg', 1);
    const b = chatImagePath('c', 'file:///a.jpg', 1);
    expect(a).not.toBe(b);
  });
});
