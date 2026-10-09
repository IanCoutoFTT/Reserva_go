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

/**
 * Lê um preço digitado no formato brasileiro ("450", "450,50", "1.200",
 * "1.200,50", "R$ 1.200,50") e devolve o número, ou null se não der pra ler.
 *
 * Antes isso era `parseFloat(price) || 0`, que lê "450,50" como 450 e "1.200"
 * como 1,2 - o anfitrião digitava R$ 1.200 e a cabana era publicada a R$ 1,20.
 * Regra: se tem vírgula, ela é o separador decimal e os pontos são milhar; se
 * só tem pontos, "1.200" (3 dígitos depois do ponto) é milhar, e "450.5" ou
 * "450.50" é decimal.
 */
export function parsePriceBR(input: string): number | null {
  const cleaned = input.replace(/[^\d.,]/g, '');
  if (!cleaned) return null;

  let normalized: string;
  if (cleaned.includes(',')) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    normalized = cleaned.replace(/\./g, '');
  } else {
    normalized = cleaned;
  }

  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}
