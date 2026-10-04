/**
 * Formata um valor numérico como moeda brasileira ("R$ 1.234,56").
 *
 * Antes desta função, preço aparecia cru em vários lugares (`R$ {priceNum}`,
 * `R$ {valor.toFixed(2)}`) - sem separador de milhar, e às vezes sem nem as
 * 2 casas decimais (ex.: "R$ 850.5" em vez de "R$ 850,50"). `my-cabins.tsx`
 * (fora do escopo desta branch) já usava `.toLocaleString('pt-BR')` sozinho -
 * aqui uso a variante com `style: 'currency'`, que já devolve o "R$" junto,
 * então não precisa mais escrever `R$ ` na mão em cada tela.
 */
export function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
