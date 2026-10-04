import { supabase } from '../lib/supabase';
import { NewReview, Review, ReviewWithAuthor, ServiceResult, toResult } from './types';

// Acesso à tabela `reviews` (supabase/schema.sql). O trigger
// reviews_rating_trigger (linha 243) recalcula properties.rating/reviews_count
// sozinho a cada INSERT/UPDATE/DELETE - não precisa duplicar essa conta aqui.

export async function createReview(dados: NewReview): Promise<ServiceResult<Review>> {
  const { data, error } = await supabase.from('reviews').insert(dados).select().single();
  return toResult(data, error);
}

/** Embute profiles(name, avatar_url) via a FK reviews.author_id -> profiles.id (única FK entre as duas, sem ambiguidade pro PostgREST). */
export async function getReviewsByProperty(propertyId: string): Promise<ServiceResult<ReviewWithAuthor[]>> {
  const { data, error } = await supabase
    .from('reviews')
    .select('*, profiles(name, avatar_url)')
    .eq('property_id', propertyId)
    .order('created_at', { ascending: false });
  return toResult(data as unknown as ReviewWithAuthor[] | null, error);
}

/** Quantas avaliações esse usuário já ESCREVEU (não confundir com a nota das cabanas dele) - usado no card de estatísticas do perfil do hóspede. */
export async function getReviewCountByAuthor(authorId: string): Promise<ServiceResult<number>> {
  const { count, error } = await supabase
    .from('reviews')
    .select('id', { count: 'exact', head: true })
    .eq('author_id', authorId);

  if (error) return toResult<number>(null, error);
  return { data: count ?? 0, error: null };
}

/** UNIQUE(booking_id, author_id) em reviews (schema.sql linha 221) é a mesma regra checada aqui. */
export async function hasReviewed(guestId: string, bookingId: string): Promise<ServiceResult<boolean>> {
  const { data, error } = await supabase
    .from('reviews')
    .select('id')
    .eq('author_id', guestId)
    .eq('booking_id', bookingId)
    .maybeSingle();

  if (error) return toResult<boolean>(null, error);
  return { data: data !== null, error: null };
}
