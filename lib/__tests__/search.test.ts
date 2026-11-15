import { filterByAmenities, normalizeText, searchProperties, searchScore, toggleAmenity } from '../search';

const chale = { title: 'Chalé Pé na Areia', location: 'Pirenópolis, GO', description: 'Vista linda e silêncio', category: 'Campo', amenities: ['Wi-Fi', 'Lareira'], rating: 4.5 };
const cabana = { title: 'Cabana do Lago', location: 'Goiânia, GO', description: 'Perto de Pirenópolis? Não.', category: 'Cachoeira', amenities: ['Piscina'], rating: 4.9 };
const praia = { title: 'Bangalô da Praia', location: 'Trancoso, BA', description: 'Chalé de frente para o mar', category: 'Praia Privativa', amenities: ['Aceita pets', 'Piscina'], rating: 4.2 };

describe('normalizeText', () => {
  it('tira acento, caixa e espaço sobrando', () => {
    expect(normalizeText('  Pirenópolis,   GO ')).toBe('pirenopolis, go');
    expect(normalizeText(null)).toBe('');
  });
});

describe('searchProperties', () => {
  it('ignora acentos e maiúsculas', () => {
    expect(searchProperties([chale, cabana], 'PIRENOPOLIS')).toHaveLength(2);
  });
  it('várias palavras: todas precisam aparecer', () => {
    expect(searchProperties([chale, cabana, praia], 'chale pirenopolis')).toEqual([chale]);
    expect(searchProperties([chale, cabana, praia], 'chale tubarao')).toEqual([]);
  });
  it('título e local pesam mais que a descrição', () => {
    // "pirenopolis" está no local do chalé e só na descrição da cabana
    expect(searchProperties([cabana, chale], 'pirenopolis')[0]).toBe(chale);
  });
  it('acha também por comodidade e por categoria', () => {
    expect(searchProperties([chale, cabana, praia], 'lareira')).toEqual([chale]);
    expect(searchProperties([chale, cabana, praia], 'praia privativa')).toEqual([praia]);
  });
  it('desempata pela nota', () => {
    const a = { title: 'Chalé A', rating: 3 };
    const b = { title: 'Chalé B', rating: 5 };
    expect(searchProperties([a, b], 'chale')).toEqual([b, a]);
  });
  it('busca vazia ou só espaços: lista vazia', () => {
    expect(searchProperties([chale], '')).toEqual([]);
    expect(searchProperties([chale], '   ')).toEqual([]);
  });
  it('não quebra com texto que parece expressão regular', () => {
    expect(() => searchProperties([chale], 'a.*(b')).not.toThrow();
    expect(searchProperties([chale], '[chale')).toEqual([]);
  });
  it('palavra inteira vale mais que pedaço de palavra', () => {
    expect(searchScore({ title: 'Casa do lago' }, 'lago')).toBeGreaterThan(searchScore({ title: 'Casa do lagoinha' }, 'lago'));
  });
});

describe('filterByAmenities', () => {
  it('sem seleção não filtra', () => {
    expect(filterByAmenities([chale, cabana], [])).toEqual([chale, cabana]);
  });
  it('exige TODAS as comodidades escolhidas', () => {
    expect(filterByAmenities([chale, cabana, praia], ['Piscina'])).toEqual([cabana, praia]);
    expect(filterByAmenities([chale, cabana, praia], ['Piscina', 'Aceita pets'])).toEqual([praia]);
    expect(filterByAmenities([chale, cabana, praia], ['Piscina', 'Lareira'])).toEqual([]);
  });
  it('cabana sem comodidades cadastradas não passa quando há filtro', () => {
    expect(filterByAmenities([{ amenities: null }, { amenities: undefined }, {}], ['Wi-Fi'])).toEqual([]);
  });
  it('ignora acento e caixa na comparação', () => {
    expect(filterByAmenities([{ amenities: ['Vista panorâmica'] }], ['vista panoramica'])).toHaveLength(1);
  });
});

describe('toggleAmenity', () => {
  it('liga e desliga, sem mudar a lista original', () => {
    const original = ['Wi-Fi'];
    expect(toggleAmenity(original, 'Piscina')).toEqual(['Wi-Fi', 'Piscina']);
    expect(toggleAmenity(original, 'Wi-Fi')).toEqual([]);
    expect(original).toEqual(['Wi-Fi']);
  });
});
