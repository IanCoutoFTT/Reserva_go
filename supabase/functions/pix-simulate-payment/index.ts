// POST /functions/v1/pix-simulate-payment   { booking_id }
// SÓ NO MODO SIMULADO (PIX_PROVIDER=mock): o hóspede "paga" a própria reserva
// para demonstrar o ciclo sem dinheiro. Com provedor real devolve 404.
// Regras em _shared/handlers.ts.
import { simulatePaymentHandler } from '../_shared/handlers.ts';
import { buildDeps, readJson, respond } from '../_shared/runtime.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return respond({ status: 405, body: { error: 'method_not_allowed' } });
  try {
    return respond(await simulatePaymentHandler(buildDeps(), req.headers.get('Authorization'), await readJson(req)));
  } catch (e) {
    console.error('[pix-simulate-payment]', e instanceof Error ? e.message : e);
    return respond({ status: 500, body: { error: 'internal_error' } });
  }
});
