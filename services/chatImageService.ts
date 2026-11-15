import { File } from 'expo-file-system';
import { chatImagePath, photoCaption, validateChatImage } from '../lib/chatImage';
import { imageTypeFromUri } from '../lib/imageType';
import { supabase } from '../lib/supabase';
import { Message, ServiceResult } from './types';

// Fotos no chat (migração 023): o arquivo vai para o bucket PRIVADO "chat-images" (só os dois da
// conversa enviam e leem) e a mensagem guarda o caminho. A foto é mostrada por um link temporário.

const BUCKET = 'chat-images';
const SIGNED_URL_SECONDS = 3600;

/**
 * Envia a foto e cria a mensagem. Mesmo cuidado do avatar: o arquivo é lido com expo-file-system
 * (ArrayBuffer), porque fetch(uri).blob() falha no Android ("Network request failed").
 */
export async function sendImageMessage(args: {
  conversationId: string;
  senderId: string;
  uri: string;
  fileSize?: number | null;
  caption?: string;
}): Promise<ServiceResult<Message>> {
  const invalid = validateChatImage({ uri: args.uri, fileSize: args.fileSize });
  if (invalid) return { data: null, error: invalid };

  try {
    const path = chatImagePath(args.conversationId, args.uri);
    const { contentType } = imageTypeFromUri(args.uri);
    const buffer = await new File(args.uri).arrayBuffer();

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, buffer, { contentType, upsert: false });
    if (uploadError) return { data: null, error: 'Não foi possível enviar a foto agora. Tente novamente.' };

    const { data, error } = await supabase
      .from('messages')
      .insert({ conversation_id: args.conversationId, sender_id: args.senderId, content: photoCaption(args.caption), image_path: path })
      .select()
      .single();
    // O erro de limite de envio já vem em português ("Limite de envio: ..."); o app o reconhece.
    if (error) return { data: null, error: error.message };
    return { data: data as Message, error: null };
  } catch {
    return { data: null, error: 'Não foi possível enviar a foto agora. Tente novamente.' };
  }
}

const cache = new Map<string, { url: string; expiresAt: number }>();

/** Link temporário (1 hora) da foto; fica em memória por 50 minutos para não pedir de novo a cada rolagem. */
export async function getChatImageUrl(path: string, now: number = Date.now()): Promise<ServiceResult<string>> {
  const hit = cache.get(path);
  if (hit && hit.expiresAt > now) return { data: hit.url, error: null };

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) return { data: null, error: 'Não foi possível carregar a foto.' };
  cache.set(path, { url: data.signedUrl, expiresAt: now + (SIGNED_URL_SECONDS - 600) * 1000 });
  return { data: data.signedUrl, error: null };
}

/** Só para testes. */
export function clearChatImageCache(): void {
  cache.clear();
}
