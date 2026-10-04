import { supabase } from '../lib/supabase';
import { Favorite, ServiceResult, toResult } from './types';

// Acesso à tabela `favorites` (supabase/schema.sql). context/FavoritesContext.tsx
// usa isso como fonte de verdade quando online, com AsyncStorage como cache
// offline - ver comentários lá.

/** Devolve só os property_id (é o formato que FavoritesContext já usa). */
export async function getFavorites(userId: string): Promise<ServiceResult<string[]>> {
  const { data, error } = await supabase
    .from('favorites')
    .select('property_id')
    .eq('user_id', userId);

  if (error) return toResult<string[]>(null, error);
  return { data: (data ?? []).map((row) => row.property_id), error: null };
}

export async function addFavorite(userId: string, propertyId: string): Promise<ServiceResult<Favorite>> {
  const { data, error } = await supabase
    .from('favorites')
    .insert({ user_id: userId, property_id: propertyId })
    .select()
    .single();
  return toResult(data, error);
}

export async function removeFavorite(userId: string, propertyId: string): Promise<ServiceResult<null>> {
  const { error } = await supabase
    .from('favorites')
    .delete()
    .eq('user_id', userId)
    .eq('property_id', propertyId);
  return toResult<null>(null, error);
}

export async function isFavorite(userId: string, propertyId: string): Promise<ServiceResult<boolean>> {
  const { data, error } = await supabase
    .from('favorites')
    .select('id')
    .eq('user_id', userId)
    .eq('property_id', propertyId)
    .maybeSingle();

  if (error) return toResult<boolean>(null, error);
  return { data: data !== null, error: null };
}
