import { Listing } from '../../context/ListingContext';
import type { Property as DbProperty } from '../../services/types';

// Converte a linha do Supabase (snake_case) pro formato Listing que a tela
// já usa (camelCase) - assim os filtros/seções não mudam de lógica.
export function mapPropertyToListing(p: DbProperty): Listing {
  return {
    id: p.id,
    title: p.title,
    location: p.location,
    price: p.price,
    description: p.description,
    image: p.images?.[0] ?? null,
    isolationLevel: p.isolation_level,
    createdAt: p.created_at,
    bookingsCount: p.bookings_count,
    rating: p.rating,
    category: p.category,
    subCategory: p.sub_category ?? undefined,
    hostId: p.owner_id,
  };
}
