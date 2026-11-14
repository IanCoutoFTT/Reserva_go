// POST /functions/v1/pix-webhook
// Chamada pelo PROVEDOR quando um Pix é pago (não pelo app). Publicar com
// --no-verify-jwt, porque o provedor não tem login do Supabase; a proteção é o
// token secreto PIX_WEBHOOK_SECRET no cabeçalho. Regras em _shared/handlers.ts.
import { webhookHandler } from '../_shared/handlers.ts';
import { buildDeps, readJson, respond } from '../_shared/runtime.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return respond({ status: 405, body: { error: 'method_not_allowed' } });
  try {
    const deps = buildDeps();
    return respond(
      await webhookHandler(
        deps,
        req.headers.get(deps.provider.webhookTokenHeader),
        Deno.env.get('PIX_WEBHOOK_SECRET') ?? null,
        await readJson(req)
      )
    );
  } catch (e) {
    console.error('[pix-webhook]', e instanceof Error ? e.message : e);
    return respond({ status: 500, body: { error: 'internal_error' } });
  }
});
