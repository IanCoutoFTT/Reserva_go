// POST /functions/v1/stripe-webhook
// Chamada pela Stripe (não pelo app), por isso publicada com --no-verify-jwt. Quem garante
// que a chamada é da Stripe é a ASSINATURA do corpo (cabeçalho Stripe-Signature + segredo
// STRIPE_WEBHOOK_SECRET). O corpo precisa ser lido CRU, sem JSON.parse antes de conferir.
// Regras em _shared/cardHandlers.ts.
import { stripeWebhookHandler } from '../_shared/cardHandlers.ts';
import { buildCardDeps, respond } from '../_shared/runtime.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return respond({ status: 405, body: { error: 'method_not_allowed' } });
  try {
    const rawBody = await req.text();
    return respond(
      await stripeWebhookHandler(buildCardDeps(), req.headers.get('Stripe-Signature'), Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? null, rawBody)
    );
  } catch (e) {
    console.error('[stripe-webhook]', e instanceof Error ? e.message : e);
    return respond({ status: 500, body: { error: 'internal_error' } });
  }
});
