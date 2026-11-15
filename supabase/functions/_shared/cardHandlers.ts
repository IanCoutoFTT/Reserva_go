// Fluxos das Edge Functions do cartão (Stripe), no mesmo desenho de handlers.ts (Pix):
// nada específico do Deno aqui, tudo o que toca o mundo de fora chega por `deps`.
//
//   card-create-intent  -> createCardIntentHandler  (o app pede para pagar a reserva)
//   stripe-webhook      -> stripeWebhookHandler     (a Stripe avisa que o cartão foi cobrado)
//
// O número do cartão NUNCA passa por aqui: o app o entrega direto à Stripe (PaymentSheet).
// Esta função só cria a cobrança e, depois, recebe a confirmação assinada.

import { intentIdempotencyKey, toCents, verifyStripeSignature } from './card.ts';
import type { BookingRow, HandlerResult, PaymentRow } from './handlers.ts';
import { isUuid, pixExpiry } from './pix.ts';
import type { StripeApi } from './stripe.ts';

export interface CardDeps {
  now(): Date;
  log(message: string): void;
  /** Id do usuário dono do token (JWT) ou null se o token não vale. */
  getUserId(authHeader: string | null): Promise<string | null>;
  loadBooking(id: string): Promise<BookingRow | null>;
  loadPayment(bookingId: string): Promise<PaymentRow | null>;
  loadPaymentByCharge(chargeId: string): Promise<PaymentRow | null>;
  /** Dados de recebimento do anfitrião (payout_accounts). null = ainda não cadastrou nada. */
  loadPayoutAccount(userId: string): Promise<{ account_id: string | null; has_pix_key: boolean } | null>;
  /** null = chave da Stripe não configurada no servidor. */
  stripe: StripeApi | null;
  /** register_card_charge (migração 015): o banco recalcula a divisão e valida a reserva. */
  registerCardCharge(args: { userId: string; bookingId: string; provider: string; chargeId: string; expiresAt: Date }): Promise<PaymentRow>;
  /** mark_payment_paid (migrações 013/015): true só na primeira confirmação. */
  markPaid(chargeId: string): Promise<boolean>;
  /** HMAC-SHA256 em hexadecimal (Web Crypto no servidor). */
  hmacHex(key: string, message: string): Promise<string>;
}

const res = (status: number, body: Record<string, unknown>): HandlerResult => ({ status, body });

/** O que o app recebe: só o necessário. Sem a divisão do valor, sem o id do provedor. */
function publicCardPayment(p: PaymentRow): Record<string, unknown> {
  return { id: p.id, booking_id: p.booking_id, status: p.status, amount: p.amount, expires_at: p.expires_at };
}

function asBody(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

// ── Criar (ou reabrir) a cobrança de cartão de uma reserva ──
export async function createCardIntentHandler(deps: CardDeps, authHeader: string | null, rawBody: unknown): Promise<HandlerResult> {
  const userId = await deps.getUserId(authHeader);
  if (!userId) return res(401, { error: 'unauthorized' });

  // Servidor sem chave da Stripe: o cartão não funciona, e o app mostra um aviso claro.
  if (!deps.stripe) return res(503, { error: 'card_not_configured' });
  const stripe = deps.stripe;

  const body = asBody(rawBody);
  if (!isUuid(body.booking_id)) return res(400, { error: 'invalid_booking_id' });

  const booking = await deps.loadBooking(body.booking_id);
  // 404 também para reserva de outra pessoa: não revela que ela existe.
  if (!booking || booking.guest_id !== userId) return res(404, { error: 'booking_not_found' });
  if (booking.status !== 'reservada') return res(409, { error: 'booking_not_active' });
  if (booking.pay_method !== 'card') return res(409, { error: 'booking_not_card' });

  const existing = await deps.loadPayment(booking.id);
  if (existing?.status === 'pago') return res(409, { error: 'already_paid' });

  // Reabrir a tela: mesma cobrança, mesmo PaymentIntent (o clientSecret é pedido de novo à Stripe).
  if (existing?.status === 'aguardando' && new Date(existing.expires_at).getTime() > deps.now().getTime()) {
    try {
      const clientSecret = await stripe.getClientSecret(existing.provider_charge_id);
      if (!clientSecret) return res(409, { error: 'payment_not_payable' });
      return res(200, { payment: publicCardPayment(existing), client_secret: clientSecret });
    } catch (e) {
      deps.log(`Stripe falhou ao reabrir cobrança: ${e instanceof Error ? e.message : 'erro desconhecido'}`);
      return res(502, { error: 'provider_error' });
    }
  }

  // Sem dados de recebimento não há como repassar: nem se cobra (o banco também exige, migração 015).
  const payout = await deps.loadPayoutAccount(booking.owner_id);
  if (!payout || (!payout.account_id && !payout.has_pix_key)) {
    return res(422, { error: 'host_without_payout_account' });
  }

  const now = deps.now();
  const expiresAt = pixExpiry(now);

  let intent: { id: string; clientSecret: string };
  try {
    intent = await stripe.createPaymentIntent({
      // O valor vem da RESERVA no banco, nunca do app.
      amountCents: toCents(booking.total),
      bookingId: booking.id,
      description: `ReservaGO: ${booking.property_title}`,
      idempotencyKey: intentIdempotencyKey(booking.id, now),
    });
  } catch (e) {
    deps.log(`Stripe falhou ao criar cobrança: ${e instanceof Error ? e.message : 'erro desconhecido'}`);
    return res(502, { error: 'provider_error' });
  }

  try {
    const payment = await deps.registerCardCharge({ userId, bookingId: booking.id, provider: 'stripe', chargeId: intent.id, expiresAt });
    return res(200, { payment: publicCardPayment(payment), client_secret: intent.clientSecret });
  } catch (e) {
    deps.log(`banco recusou registrar a cobrança: ${e instanceof Error ? e.message : 'erro desconhecido'}`);
    return res(409, { error: 'charge_not_registered' });
  }
}

// ── Webhook da Stripe: "o cartão foi cobrado" ───────────────
export async function stripeWebhookHandler(
  deps: CardDeps,
  signatureHeader: string | null,
  webhookSecret: string | null,
  rawBody: string
): Promise<HandlerResult> {
  // Sem segredo configurado, ninguém é aceito (nunca "aberto por esquecimento").
  if (!webhookSecret) return res(401, { error: 'unauthorized' });

  const nowSeconds = Math.floor(deps.now().getTime() / 1000);
  const valid = await verifyStripeSignature(rawBody, signatureHeader, webhookSecret, nowSeconds, deps.hmacHex);
  if (!valid) return res(400, { error: 'invalid_signature' });

  let event: Record<string, unknown>;
  try {
    event = asBody(JSON.parse(rawBody));
  } catch {
    return res(400, { error: 'invalid_body' });
  }

  // Só nos interessa o pagamento concluído. Os demais eventos: 200 para a Stripe não reenviar.
  if (event.type !== 'payment_intent.succeeded') return res(200, { ignored: true });

  const intent = asBody(asBody(event.data).object);
  if (typeof intent.id !== 'string') return res(200, { ignored: true });

  const payment = await deps.loadPaymentByCharge(intent.id);
  if (!payment) return res(200, { ignored: true, reason: 'unknown_charge' });

  // Confere o que a Stripe cobrou com o que o banco espera. Diferença = não confirma, e fica no log.
  if (intent.currency !== 'brl' || intent.amount_received !== toCents(payment.amount)) {
    deps.log(`valor divergente na cobrança ${payment.id}: esperado ${toCents(payment.amount)} brl, veio ${String(intent.amount_received)} ${String(intent.currency)}`);
    return res(200, { ignored: true, reason: 'amount_mismatch' });
  }

  try {
    const changed = await deps.markPaid(intent.id);
    return res(200, { ok: true, changed });
  } catch (e) {
    deps.log(`falha ao confirmar pagamento: ${e instanceof Error ? e.message : 'erro desconhecido'}`);
    return res(500, { error: 'could_not_mark_paid' }); // a Stripe tenta de novo
  }
}
