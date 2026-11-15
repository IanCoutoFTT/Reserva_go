// Cliente mínimo da API da Stripe, só com o que o ReservaGO usa: criar e consultar um
// PaymentIntent. Usa fetch puro (sem SDK), então roda no Deno e nos testes do Jest.
//
// MODO DE TESTE: com uma chave sk_test_... nenhum dinheiro real é cobrado e só valem os
// cartões de teste da Stripe (ex.: 4242 4242 4242 4242). Veja docs/pagamento-cartao.md.

export interface CreateIntentArgs {
  amountCents: number;
  bookingId: string;
  description: string;
  idempotencyKey: string;
}

export interface StripeApi {
  /** Cria o PaymentIntent. O clientSecret vai só para o app do hóspede, nunca é guardado. */
  createPaymentIntent(args: CreateIntentArgs): Promise<{ id: string; clientSecret: string }>;
  /** clientSecret de uma cobrança já aberta; null se ela não aceita mais pagamento (paga, cancelada, em análise). */
  getClientSecret(intentId: string): Promise<string | null>;
}

export interface StripeConfig {
  secretKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

const PAYABLE = new Set(['requires_payment_method', 'requires_confirmation', 'requires_action']);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function stripeApi(cfg: StripeConfig): StripeApi {
  const doFetch = cfg.fetchImpl ?? fetch;
  const base = (cfg.baseUrl ?? 'https://api.stripe.com').replace(/\/+$/, '');

  async function call(method: 'GET' | 'POST', path: string, form?: URLSearchParams, extra: Record<string, string> = {}): Promise<Record<string, unknown>> {
    const res = await doFetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${cfg.secretKey}`,
        ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        ...extra,
      },
      body: form ? form.toString() : undefined,
    });
    const body = asRecord(await res.json().catch(() => null));
    if (!res.ok) {
      // Só o tipo e a mensagem da Stripe; nunca a chave nem o corpo inteiro.
      const err = asRecord(body?.error);
      const reason = typeof err?.message === 'string' ? err.message : 'sem detalhe';
      throw new Error(`Stripe respondeu ${res.status}: ${reason}`);
    }
    if (!body) throw new Error('Stripe respondeu algo ilegível.');
    return body;
  }

  return {
    async createPaymentIntent(a) {
      const form = new URLSearchParams();
      form.set('amount', String(a.amountCents));
      form.set('currency', 'brl');
      // Sem payment_method_types: na API atual da Stripe esse parâmetro não é mais aceito (erro 400).
      // Os meios de pagamento vêm das configurações do painel da Stripe (deixe só "Cartões" ligado).
      form.set('description', a.description.slice(0, 500));
      form.set('metadata[booking_id]', a.bookingId);
      form.set('metadata[app]', 'reservago');
      const body = await call('POST', '/v1/payment_intents', form, { 'Idempotency-Key': a.idempotencyKey });
      if (typeof body.id !== 'string' || typeof body.client_secret !== 'string') {
        throw new Error('Stripe não devolveu o PaymentIntent.');
      }
      return { id: body.id, clientSecret: body.client_secret };
    },

    async getClientSecret(intentId) {
      const body = await call('GET', `/v1/payment_intents/${encodeURIComponent(intentId)}`);
      if (typeof body.status !== 'string' || !PAYABLE.has(body.status)) return null;
      return typeof body.client_secret === 'string' ? body.client_secret : null;
    },
  };
}
