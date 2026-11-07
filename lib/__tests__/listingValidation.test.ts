import { LISTING_LIMITS, validateListing } from '../listingValidation';

const valido = { title: 'Refúgio das Araucárias', location: 'Pirenópolis, GO', price: '450,50', description: '' };

describe('validateListing', () => {
  it('aceita um anúncio normal e devolve o preço já convertido', () => {
    expect(validateListing(valido)).toEqual({ ok: true, price: 450.5 });
  });

  it('aceita preço no formato brasileiro com milhar', () => {
    expect(validateListing({ ...valido, price: '1.200' })).toEqual({ ok: true, price: 1200 });
  });

  it('título vazio ou só com espaços é "obrigatório"', () => {
    expect(validateListing({ ...valido, title: '   ' })).toMatchObject({ ok: false, title: 'Campo obrigatório' });
  });

  it('recusa o título "A" (curto demais)', () => {
    expect(validateListing({ ...valido, title: 'A' })).toMatchObject({ ok: false, title: 'Título muito curto' });
    expect(validateListing({ ...valido, title: ' ab ' })).toMatchObject({ ok: false, title: 'Título muito curto' });
  });

  it('recusa título maior que o limite do banco (120)', () => {
    const longo = 'a'.repeat(LISTING_LIMITS.titleMax + 1);
    expect(validateListing({ ...valido, title: longo })).toMatchObject({ ok: false, title: 'Título muito longo' });
    expect(validateListing({ ...valido, title: 'a'.repeat(LISTING_LIMITS.titleMax) }).ok).toBe(true);
  });

  it('localização vazia, curta ou longa demais', () => {
    expect(validateListing({ ...valido, location: '' })).toMatchObject({ ok: false, title: 'Campo obrigatório' });
    expect(validateListing({ ...valido, location: 'A' })).toMatchObject({ ok: false, title: 'Localização muito curta' });
    expect(validateListing({ ...valido, location: 'x'.repeat(201) })).toMatchObject({ ok: false, title: 'Localização muito longa' });
  });

  it('recusa preço vazio, ilegível ou zero', () => {
    expect(validateListing({ ...valido, price: '' })).toMatchObject({ ok: false, title: 'Valor inválido' });
    expect(validateListing({ ...valido, price: 'abc' })).toMatchObject({ ok: false, title: 'Valor inválido' });
    expect(validateListing({ ...valido, price: '0' })).toMatchObject({ ok: false, title: 'Valor inválido' });
  });

  it('recusa R$ 1,00 por noite (abaixo do mínimo) mas aceita o mínimo', () => {
    expect(validateListing({ ...valido, price: '1' })).toMatchObject({ ok: false, title: 'Valor muito baixo' });
    expect(validateListing({ ...valido, price: '9,99' })).toMatchObject({ ok: false, title: 'Valor muito baixo' });
    expect(validateListing({ ...valido, price: '10' })).toEqual({ ok: true, price: 10 });
  });

  it('recusa preço acima do teto do banco (R$ 100.000)', () => {
    expect(validateListing({ ...valido, price: '100.001' })).toMatchObject({ ok: false, title: 'Valor muito alto' });
    expect(validateListing({ ...valido, price: '100.000' })).toEqual({ ok: true, price: 100000 });
  });

  it('descrição é opcional, mas tem limite de 5000 caracteres', () => {
    expect(validateListing({ ...valido, description: '' }).ok).toBe(true);
    expect(validateListing({ ...valido, description: 'd'.repeat(5000) }).ok).toBe(true);
    expect(validateListing({ ...valido, description: 'd'.repeat(5001) })).toMatchObject({ ok: false, title: 'Descrição muito longa' });
  });
});
