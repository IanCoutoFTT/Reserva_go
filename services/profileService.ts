import { File } from 'expo-file-system';
import { supabase } from '../lib/supabase';
import { Profile, ServiceResult, UserRole, toResult } from './types';

// Acesso à tabela `profiles` (supabase/schema.sql). updateRole() aqui é o
// que falta pra context/AuthContext.tsx parar de trocar a role só em
// memória (ver Tarefa 6).

export async function getProfile(id: string): Promise<ServiceResult<Profile>> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', id).single();
  return toResult(data, error);
}

/**
 * Busca vários perfis de uma vez por id (mesmo padrão de getReportsWithContext
 * em adminService.ts - `.in('id', ids)` + join no client, em vez de N queries
 * separadas). Usado pra montar a lista de "nova conversa" em
 * app/(tabs)/messages.tsx (nome/avatar de cada anfitrião distinto no
 * histórico de reservas do hóspede).
 */
export async function getProfilesByIds(ids: string[]): Promise<ServiceResult<Profile[]>> {
  if (ids.length === 0) return { data: [], error: null };
  const { data, error } = await supabase.from('profiles').select('*').in('id', ids);
  return toResult(data, error);
}

export async function updateProfile(
  id: string,
  dados: Partial<Pick<Profile, 'name' | 'avatar_url' | 'phone' | 'bio' | 'interests'>>
): Promise<ServiceResult<Profile>> {
  const { data, error } = await supabase.from('profiles').update(dados).eq('id', id).select().single();
  return toResult(data, error);
}

/**
 * Única forma sancionada de um usuário trocar a PRÓPRIA role. Chama a
 * function set_own_role() (supabase/schema.sql / migração 001), que é
 * SECURITY DEFINER e só afeta a linha de auth.uid() - por isso não recebe
 * mais um `id`: não é possível (nem faz sentido) trocar a role de outra
 * pessoa por aqui. UPDATE direto na coluna role NÃO funciona mais - a
 * policy profiles_self_update passou a ter um WITH CHECK que bloqueia
 * qualquer mudança de role feita fora desta function.
 */
export async function updateRole(role: UserRole): Promise<ServiceResult<Profile>> {
  if (role === 'admin') {
    // set_own_role também recusa isso (RAISE EXCEPTION lá dentro) - checamos
    // aqui antes pra falhar rápido, sem round-trip, com mensagem previsível.
    return { data: null, error: 'Não é permitido definir a própria role como admin.' };
  }

  const { data, error } = await supabase.rpc('set_own_role', { new_role: role });
  return toResult(data as Profile | null, error);
}

/**
 * Envia a foto (uri local do expo-image-picker) pro bucket "avatars" do
 * Storage (schema.sql, público) e devolve a URL pública. Caminho
 * `${userId}/timestamp.ext` pra bater com a policy de storage esperada
 * (dono só grava dentro da própria pasta - ver
 * supabase/migrations/003_avatars_storage_policies.sql).
 *
 * Usa expo-file-system (File.arrayBuffer()) em vez de fetch(uri).blob() -
 * essa segunda forma foi testada ao vivo num Android real e falhou com
 * "Network request failed" (o polyfill de Blob do fetch do React Native não
 * lida bem com upload binário pro Storage nesse OS). ArrayBuffer não passa
 * por esse polyfill e o supabase-js aceita ArrayBuffer direto no upload.
 */
export async function uploadAvatar(uri: string, userId: string): Promise<ServiceResult<string>> {
  try {
    const fileExt = uri.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
    const path = `${userId}/${Date.now()}.${fileExt}`;
    const arrayBuffer = await new File(uri).arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, arrayBuffer, { contentType: `image/${fileExt}`, upsert: false });

    if (uploadError) return { data: null, error: uploadError.message };

    const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(path);
    return { data: publicUrlData.publicUrl, error: null };
  } catch (err: any) {
    return { data: null, error: err?.message ?? 'Falha ao enviar imagem.' };
  }
}

/** Soft delete - grava profiles.deleted_at, não remove a linha nem o usuário do auth.users. */
export async function deleteAccount(id: string): Promise<ServiceResult<Profile>> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  return toResult(data, error);
}
