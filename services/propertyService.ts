import { File } from 'expo-file-system';
import { supabase } from '../lib/supabase';
import { NewProperty, Property, PropertyFilters, ServiceResult, toResult } from './types';

// Acesso à tabela `properties` (supabase/schema.sql). Nenhuma lógica de UI
// aqui - só monta a query e devolve { data, error }.

export async function getProperties(filtros?: PropertyFilters): Promise<ServiceResult<Property[]>> {
  let query = supabase.from('properties').select('*').eq('status', filtros?.status ?? 'ativo');

  if (filtros?.category) query = query.eq('category', filtros.category);
  if (filtros?.subCategory) query = query.eq('sub_category', filtros.subCategory);
  if (filtros?.isolationLevel) query = query.eq('isolation_level', filtros.isolationLevel);
  if (filtros?.maxPrice !== undefined) query = query.lte('price', filtros.maxPrice);
  if (filtros?.minPrice !== undefined) query = query.gte('price', filtros.minPrice);
  if (filtros?.search) {
    // idx_properties_search (gin/to_tsvector) cobre title+location; ilike
    // simples aqui pra não depender de sintaxe de full-text no client.
    query = query.or(`title.ilike.%${filtros.search}%,location.ilike.%${filtros.search}%`);
  }

  const { data, error } = await query.order('created_at', { ascending: false });
  return toResult(data, error);
}

export async function getPropertyById(id: string): Promise<ServiceResult<Property>> {
  const { data, error } = await supabase.from('properties').select('*').eq('id', id).single();
  return toResult(data, error);
}

export async function getPropertiesByHost(hostId: string): Promise<ServiceResult<Property[]>> {
  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .eq('owner_id', hostId)
    .order('created_at', { ascending: false });
  return toResult(data, error);
}

export async function createProperty(dados: NewProperty): Promise<ServiceResult<Property>> {
  // status default 'pendente' vem do banco se omitido (properties.status
  // NOT NULL DEFAULT 'pendente') - moderação entra em aprovada via approveProperty.
  const { data, error } = await supabase.from('properties').insert(dados).select().single();
  return toResult(data, error);
}

export type UpdatableProperty = Partial<
  Pick<
    Property,
    'title' | 'description' | 'location' | 'price' | 'isolation_level' | 'category' | 'sub_category' | 'images' | 'amenities'
  >
>;

/** Edição pelo próprio anfitrião - não deixa mexer em owner_id/status/rating/etc por aqui (fora do escopo de "editar meu anúncio"). */
export async function updateProperty(id: string, dados: UpdatableProperty): Promise<ServiceResult<Property>> {
  const { data, error } = await supabase.from('properties').update(dados).eq('id', id).select().single();
  return toResult(data, error);
}

/**
 * "Excluir" um anúncio é soft delete: grava status='inativo' em vez de
 * fazer um DELETE de verdade na linha. Motivo: bookings.property_id e
 * reviews.property_id têm ON DELETE CASCADE (supabase/schema.sql) - um
 * DELETE real apagaria pra sempre o histórico de reservas e avaliações de
 * hóspedes que já ficaram na cabana, mesmo sendo o próprio anfitrião quem
 * pediu a exclusão. 'inativo' já existe no enum cabin_status e tira a
 * cabana do explorar (properties_public_read só mostra status='ativo'),
 * sem destruir nada. Fica sobreposto com o "reprovado" de approveProperty
 * (mesmo valor 'inativo' pros dois casos) porque o enum não tem um estado
 * dedicado de "removido pelo dono" - registrado como limitação conhecida.
 */
export async function deleteProperty(id: string): Promise<ServiceResult<Property>> {
  const { data, error } = await supabase
    .from('properties')
    .update({ status: 'inativo' })
    .eq('id', id)
    .select()
    .single();
  return toResult(data, error);
}

/**
 * Envia a imagem (uri local do expo-image-picker) pro bucket "properties"
 * do Storage (schema.sql, público) e devolve a URL pública.
 *
 * Usa expo-file-system (File.arrayBuffer()) em vez de fetch(uri).blob() -
 * essa segunda forma foi testada ao vivo num Android real (branch
 * feature/perfil-admin, upload de foto de perfil - mesmo padrão daqui) e
 * falhou com "Network request failed" (o polyfill de Blob do fetch do React
 * Native não lida bem com upload binário pro Storage nesse OS). ArrayBuffer
 * não passa por esse polyfill e o supabase-js aceita ArrayBuffer direto no
 * upload.
 */
export async function uploadPropertyImage(uri: string, ownerId: string): Promise<ServiceResult<string>> {
  try {
    const fileExt = uri.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
    const path = `${ownerId}/${Date.now()}.${fileExt}`;
    const arrayBuffer = await new File(uri).arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from('properties')
      .upload(path, arrayBuffer, { contentType: `image/${fileExt}`, upsert: false });

    if (uploadError) return { data: null, error: uploadError.message };

    const { data: publicUrlData } = supabase.storage.from('properties').getPublicUrl(path);
    return { data: publicUrlData.publicUrl, error: null };
  } catch (err: any) {
    return { data: null, error: err?.message ?? 'Falha ao enviar imagem.' };
  }
}

/**
 * Marca/desmarca uma cabana como destaque (properties.featured, já existe no
 * schema - "destaque no admin", nunca tinha sido exposta por nenhum service).
 * Mesma RLS de approveProperty (properties_admin_update: só admin edita
 * cabana de outro dono).
 */
export async function setFeatured(id: string, featured: boolean): Promise<ServiceResult<Property>> {
  const { data, error } = await supabase
    .from('properties')
    .update({ featured })
    .eq('id', id)
    .select()
    .single();
  return toResult(data, error);
}

export async function approveProperty(id: string, aprovado: boolean): Promise<ServiceResult<Property>> {
  // cabin_status não tem um valor "rejeitado" dedicado - usamos 'ativo' pra
  // aprovar e 'inativo' pra reprovar (RLS properties_admin_update permite
  // update por role='admin'; ver schema.sql linha 567).
  const { data, error } = await supabase
    .from('properties')
    .update({ status: aprovado ? 'ativo' : 'inativo' })
    .eq('id', id)
    .select()
    .single();
  return toResult(data, error);
}
