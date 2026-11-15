// Fotos no chat (migração 023). Regras puras: o banco e o storage repetem os limites.
import { imageTypeFromUri } from './imageType';

export const CHAT_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
/** Texto da mensagem quando a pessoa manda só a foto, sem legenda. */
export const PHOTO_CAPTION = '📷 Foto';

/** O texto gravado na mensagem: a legenda, ou "📷 Foto" quando não há. */
export function photoCaption(text: string | null | undefined): string {
  const t = (text ?? '').trim();
  return t || PHOTO_CAPTION;
}

/** A mensagem é só a foto (sem legenda): a tela não repete o texto padrão embaixo da imagem. */
export function isDefaultCaption(text: string): boolean {
  return text === PHOTO_CAPTION;
}

/** Motivo para recusar a foto antes de enviar, ou null se está tudo certo. */
export function validateChatImage(img: { uri: string; fileSize?: number | null }): string | null {
  if (!img.uri) return 'Não foi possível ler a foto escolhida.';
  if (typeof img.fileSize === 'number' && img.fileSize > CHAT_IMAGE_MAX_BYTES) {
    return 'A foto é grande demais. Escolha uma de até 3 MB.';
  }
  return null;
}

/** Caminho dentro do bucket: "<conversa>/<hora>-<sufixo>.<extensão>" (a política confere a pasta). */
export function chatImagePath(conversationId: string, uri: string, now: number = Date.now(), suffix: string = Math.random().toString(36).slice(2, 8)): string {
  const { ext } = imageTypeFromUri(uri);
  return `${conversationId}/${now}-${suffix}.${ext}`;
}
