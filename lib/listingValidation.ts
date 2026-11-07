import { parsePriceBR } from './format';

// Limites do anúncio. Os máximos espelham o que o banco já recusa (migração 008,
// constraint properties_campos_validos): o app avisa antes, em vez de o usuário
// receber um erro genérico do servidor. Os mínimos existem só para evitar
// anúncios sem sentido (título "A", diária de R$ 1,00).
export const LISTING_LIMITS = {
  titleMin: 3,
  titleMax: 120,
  locationMin: 3,
  locationMax: 200,
  descriptionMax: 5000,
  priceMin: 10,
  priceMax: 100000,
} as const;

export type ListingValidation = { ok: true; price: number } | { ok: false; title: string; message: string };

export function validateListing(fields: {
  title: string;
  location: string;
  price: string;
  description: string;
}): ListingValidation {
  const title = fields.title.trim();
  const location = fields.location.trim();
  const description = fields.description.trim();

  if (!title) return { ok: false, title: 'Campo obrigatório', message: 'Informe o título do anúncio.' };
  if (title.length < LISTING_LIMITS.titleMin) {
    return { ok: false, title: 'Título muito curto', message: `Use pelo menos ${LISTING_LIMITS.titleMin} letras no título.` };
  }
  if (title.length > LISTING_LIMITS.titleMax) {
    return { ok: false, title: 'Título muito longo', message: `O título pode ter no máximo ${LISTING_LIMITS.titleMax} caracteres.` };
  }

  if (!location) return { ok: false, title: 'Campo obrigatório', message: 'Informe a localização (cidade e estado).' };
  if (location.length < LISTING_LIMITS.locationMin) {
    return { ok: false, title: 'Localização muito curta', message: 'Informe a cidade e o estado, por exemplo "Pirenópolis, GO".' };
  }
  if (location.length > LISTING_LIMITS.locationMax) {
    return { ok: false, title: 'Localização muito longa', message: `A localização pode ter no máximo ${LISTING_LIMITS.locationMax} caracteres.` };
  }

  // "1.200", "450,50" e "R$ 1.200,50" são lidos do jeito brasileiro (parseFloat
  // lia "1.200" como 1,2 e "450,50" como 450 - e valor vazio virava R$ 0).
  const price = parsePriceBR(fields.price);
  if (price === null || price <= 0) {
    return { ok: false, title: 'Valor inválido', message: 'Informe o valor por noite, por exemplo 450 ou 450,50.' };
  }
  if (price < LISTING_LIMITS.priceMin) {
    return { ok: false, title: 'Valor muito baixo', message: 'O valor por noite precisa ser de pelo menos R$ 10,00.' };
  }
  if (price > LISTING_LIMITS.priceMax) {
    return { ok: false, title: 'Valor muito alto', message: 'O valor por noite pode ser de no máximo R$ 100.000,00.' };
  }

  if (description.length > LISTING_LIMITS.descriptionMax) {
    return { ok: false, title: 'Descrição muito longa', message: `A descrição pode ter no máximo ${LISTING_LIMITS.descriptionMax} caracteres.` };
  }

  return { ok: true, price };
}
