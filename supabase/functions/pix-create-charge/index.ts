// POST /functions/v1/pix-create-charge   { booking_id, cpf? }
// Chamada pelo app (com o login do hóspede). Cria a cobrança Pix da reserva, ou
// devolve a que já está aberta. Regras em _shared/handlers.ts.
import { createChargeHandler } from '../_shared/handlers.ts';
import { buildDeps, readJson, respond } from '../_shared/runtime.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return respond({ status: 405, body: { error: 'method_not_allowed' } });
  try {
    return respond(await createChargeHandler(buildDeps(), req.headers.get('Authorization'), await readJson(req)));
  } catch (e) {
    console.error('[pix-create-charge]', e instanceof Error ? e.message : e);
    return respond({ status: 500, body: { error: 'internal_error' } });
  }
});
