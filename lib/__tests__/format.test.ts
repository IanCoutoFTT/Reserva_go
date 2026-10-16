import { formatCurrency, parsePriceBR } from '../format';

describe('parsePriceBR', () => {
  it.each([
    ['450', 450],
    ['450,50', 450.5],
    ['1.200', 1200],
    ['1.200,50', 1200.5],
    ['R$ 1.200,50', 1200.5],
    ['450.5', 450.5],
    ['450.50', 450.5],
    ['1.234.567', 1234567],
    ['0', 0],
  ])('lê "%s" como %d', (input, expected) => {
    expect(parsePriceBR(input)).toBe(expected);
  });

  it.each([[''], ['abc'], ['   ']])('devolve null para "%s"', (input) => {
    expect(parsePriceBR(input)).toBeNull();
  });
});

describe('formatCurrency', () => {
  it('formata em reais', () => {
    expect(formatCurrency(1200.5).replace(/\s/g, ' ')).toBe('R$ 1.200,50');
  });
});
