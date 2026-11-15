// Busca e filtros da Explorar. Funções puras, sem rede.
//  * A busca ignora acentos e maiúsculas ("Pirenopolis" acha "Pirenópolis") e aceita várias
//    palavras: todas precisam aparecer em algum campo ("chale pirenopolis" acha o chalé de lá).
//  * Cada campo pesa diferente (título e local valem mais que a descrição) e o resultado vem
//    do mais relevante para o menos, desempatando pela nota.

export interface Searchable {
  title?: string | null;
  location?: string | null;
  description?: string | null;
  category?: string | null;
  subCategory?: string | null;
  amenities?: string[] | null;
  rating?: number | null;
}

/** minúsculas, sem acento, espaços normalizados. */
export function normalizeText(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const WEIGHTS = { title: 5, location: 4, amenities: 2, category: 2, description: 1 } as const;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Pontuação da cabana para a busca; 0 = não combina (alguma palavra não apareceu em lugar nenhum). */
export function searchScore(item: Searchable, query: string): number {
  const terms = normalizeText(query).split(' ').filter(Boolean);
  if (terms.length === 0) return 0;

  const fields = {
    title: normalizeText(item.title),
    location: normalizeText(item.location),
    amenities: normalizeText((item.amenities ?? []).join(' ')),
    category: normalizeText(`${item.category ?? ''} ${item.subCategory ?? ''}`),
    description: normalizeText(item.description),
  };

  let total = 0;
  for (const term of terms) {
    let best = 0;
    for (const key of Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]) {
      const text = fields[key];
      if (!text.includes(term)) continue;
      // Palavra inteira vale um pouco mais que um pedaço de palavra.
      const whole = new RegExp(`(^|\\s)${escapeRegExp(term)}(\\s|$)`).test(text);
      best = Math.max(best, WEIGHTS[key] * (whole ? 1.5 : 1));
    }
    if (best === 0) return 0;
    total += best;
  }
  return total;
}

/** Cabanas que combinam com a busca, da mais relevante para a menos. Busca vazia devolve lista vazia. */
export function searchProperties<T extends Searchable>(items: T[], query: string): T[] {
  if (!normalizeText(query)) return [];
  return items
    .map((item) => ({ item, score: searchScore(item, query) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || (b.item.rating ?? 0) - (a.item.rating ?? 0))
    .map((x) => x.item);
}

/** Só as cabanas que têm TODAS as comodidades escolhidas (sem nenhuma escolhida, não filtra). */
export function filterByAmenities<T extends { amenities?: string[] | null }>(items: T[], selected: readonly string[]): T[] {
  if (selected.length === 0) return items;
  return items.filter((item) => {
    const has = new Set((item.amenities ?? []).map(normalizeText));
    return selected.every((a) => has.has(normalizeText(a)));
  });
}

/** Alterna uma comodidade na seleção, devolvendo uma lista nova. */
export function toggleAmenity(selected: readonly string[], amenity: string): string[] {
  return selected.includes(amenity) ? selected.filter((a) => a !== amenity) : [...selected, amenity];
}
