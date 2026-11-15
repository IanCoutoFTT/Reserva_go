// POST /functions/v1/card-create-intent   { booking_id }
// Chamada pelo app (com o login do hóspede). Cria a cobrança de cartão da reserva na
// Stripe e devolve o client_secret que a tela de pagamento da Stripe (PaymentSheet) usa,
// ou reabre a que já está aberta. Regras em _shared/cardHandlers.ts.
import { createCardIntentHandler } from '../_shared/cardHandlers.ts';
import { buildCardDeps, readJson, respond } from '../_shared/runtime.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return respond({ status: 405, body: { error: 'method_not_allowed' } });
  try {
    return respond(await createCardIntentHandler(buildCardDeps(), req.headers.get('Authorization'), await readJson(req)));
  } catch (e) {
    console.error('[card-create-intent]', e instanceof Error ? e.message : e);
    return respond({ status: 500, body: { error: 'internal_error' } });
  }
});
