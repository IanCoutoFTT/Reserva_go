// Fluxos das Edge Functions de Pix, sem nada específico do Deno: tudo o que toca
// o mundo de fora (banco, provedor, relógio) chega por `deps`. Os index.ts de
// cada função só montam essas dependências e chamam daqui.

// Os imports levam ".ts" porque o Deno (Edge Functions) exige a extensão.
import { computeSplit, isUuid, isValidCpf, onlyDigits, pixExpiry, timingSafeEqual } from './pix.ts';
import type { PixProvider } from './providers.ts';

export interface BookingRow {
  id: string;
  guest_id: string;
  status: string;
  pay_method: string;
  total: number;
  nights: number;
  price_per_night: number;
  property_title: string;
  owner_id: string;
}

export interface PaymentRow {
  id: string;
  booking_id: string;
  provider: string;
  provider_charge_id: string;
  status: 'aguardando' | 'pago' | 'expirado' | 'falhou';
  amount: number;
  host_amount: number;
  platform_fee: number;
  pix_copy_paste: string | null;
  pix_qr_image: string | null;
  expires_at: string;
}

export interface PixDeps {
  provider: PixProvider;
  now(): Date;
  /** Id do usuário dono do token (JWT) ou null se o token não vale. */
  getUserId(authHeader: string | null): Promise<string | null>;
  getUserProfile(userId: string): Promise<{ name: string; email: string | null }>;
  loadBooking(id: string): Promise<BookingRow | null>;
  loadPayment(bookingId: string): Promise<PaymentRow | null>;
  /** Dados de recebimento do anfitrião (payout_accounts). null = ainda não cadastrou nada. */
  loadPayoutAccount(userId: string): Promise<{ account_id: string | null; has_pix_key: boolean } | null>;
  /** register_pix_charge (migração 013): o banco recalcula a divisão e valida a reserva. */
  registerCharge(args: {
    userId: string;
    bookingId: string;
    provider: string;
    chargeId: string;
    copyPaste: string;
    qrImage: string | null;
    expiresAt: Date;
  }): Promise<PaymentRow>;
  /** mark_payment_paid (migração 013): true só na primeira confirmação. */
  markPaid(chargeId: string): Promise<boolean>;
  log(message: string): void;
}

export interface HandlerResult {
  status: number;
  body: Record<string, unknown>;
}

const res = (status: number, body: Record<string, unknown>): HandlerResult => ({ status, body });

/** O que o app recebe: só o necessário para pagar. Sem a divisão do valor, sem ids do provedor. */
function publicPayment(p: PaymentRow): Record<string, unknown> {
  return {
    id: p.id,
    booking_id: p.booking_id,
    status: p.status,
    amount: p.amount,
    pix_copy_paste: p.pix_copy_paste,
    pix_qr_image: p.pix_qr_image,
    expires_at: p.expires_at,
  };
}

function asBody(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

// ── Criar (ou reabrir) a cobrança Pix de uma reserva ────────
export async function createChargeHandler(deps: PixDeps, authHeader: string | null, rawBody: unknown): Promise<HandlerResult> {
  const userId = await deps.getUserId(authHeader);
  if (!userId) return res(401, { error: 'unauthorized' });

  const body = asBody(rawBody);
  if (!isUuid(body.booking_id)) return res(400, { error: 'invalid_booking_id' });

  const booking = await deps.loadBooking(body.booking_id);
  // 404 também para reserva de outra pessoa: não revela que ela existe.
  if (!booking || booking.guest_id !== userId) return res(404, { error: 'booking_not_found' });
  if (booking.status !== 'reservada') return res(409, { error: 'booking_not_active' });
  if (booking.pay_method !== 'pix') return res(409, { error: 'booking_not_pix' });

  const existing = await deps.loadPayment(booking.id);
  if (existing?.status === 'pago') return res(409, { error: 'already_paid' });
  if (existing?.status === 'aguardando' && new Date(existing.expires_at).getTime() > deps.now().getTime()) {
    return res(200, { payment: publicPayment(existing) }); // reabrir a tela: mesma cobrança
  }

  const { provider } = deps;

  let cpf: string | null = null;
  if (provider.requiresCpf) {
    const raw = asBody(rawBody).cpf;
    if (!isValidCpf(raw)) return res(422, { error: 'cpf_required' });
    cpf = onlyDigits(raw as string);
  }

  // Sem dados de recebimento não há como repassar: nem se cobra (o banco também exige, migração 014).
  const payout = await deps.loadPayoutAccount(booking.owner_id);
  if (!payout || (!payout.account_id && !payout.has_pix_key)) {
    return res(422, { error: 'host_without_payout_account' });
  }

  // Provedor com repasse automático (split) precisa da conta do anfitrião no provedor.
  let hostAccountId: string | null = null;
  if (provider.requiresHostAccount) {
    hostAccountId = payout.account_id;
    if (!hostAccountId) return res(422, { error: 'host_without_payout_account' });
  }

  const split = computeSplit(booking.nights, booking.price_per_night, booking.total);
  const profile = await deps.getUserProfile(userId);
  const expiresAt = pixExpiry(deps.now());

  let charge;
  try {
    charge = await provider.createCharge({
      bookingId: booking.id,
      amount: booking.total,
      hostAmount: split.hostAmount,
      platformFee: split.platformFee,
      description: `ReservaGO: ${booking.property_title}`,
      expiresAt,
      hostAccountId,
      payer: { name: profile.name, email: profile.email, cpf },
    });
  } catch (e) {
    deps.log(`provedor falhou ao criar cobrança: ${e instanceof Error ? e.message : 'erro desconhecido'}`);
    return res(502, { error: 'provider_error' });
  }

  try {
    const payment = await deps.registerCharge({
      userId,
      bookingId: booking.id,
      provider: provider.name,
      chargeId: charge.chargeId,
      copyPaste: charge.copyPaste,
      qrImage: charge.qrImageBase64,
      expiresAt,
    });
    return res(200, { payment: publicPayment(payment) });
  } catch (e) {
    deps.log(`banco recusou registrar a cobrança: ${e instanceof Error ? e.message : 'erro desconhecido'}`);
    return res(409, { error: 'charge_not_registered' });
  }
}

// ── Webhook do provedor: "o Pix foi pago" ───────────────────
export async function webhookHandler(
  deps: PixDeps,
  tokenHeaderValue: string | null,
  webhookSecret: string | null,
  rawBody: unknown
): Promise<HandlerResult> {
  // Sem segredo configurado, ninguém é aceito (nunca "aberto por esquecimento").
  if (!webhookSecret || !timingSafeEqual(tokenHeaderValue, webhookSecret)) {
    return res(401, { error: 'unauthorized' });
  }

  const event = deps.provider.parseWebhook(rawBody);
  if (!event) return res(200, { ignored: true }); // evento que não nos interessa: 200 para não gerar reenvio

  try {
    const changed = await deps.markPaid(event.chargeId);
    return res(200, { ok: true, changed });
  } catch (e) {
    deps.log(`falha ao confirmar pagamento: ${e instanceof Error ? e.message : 'erro desconhecido'}`);
    return res(500, { error: 'could_not_mark_paid' }); // o provedor tenta de novo
  }
}

// ── Só no modo simulado: o hóspede "paga" a própria reserva ──
export async function simulatePaymentHandler(deps: PixDeps, authHeader: string | null, rawBody: unknown): Promise<HandlerResult> {
  // Em produção (provedor real) esta rota não existe.
  if (deps.provider.name !== 'mock') return res(404, { error: 'not_found' });

  const userId = await deps.getUserId(authHeader);
  if (!userId) return res(401, { error: 'unauthorized' });

  const body = asBody(rawBody);
  if (!isUuid(body.booking_id)) return res(400, { error: 'invalid_booking_id' });

  const booking = await deps.loadBooking(body.booking_id);
  if (!booking || booking.guest_id !== userId) return res(404, { error: 'booking_not_found' });

  const payment = await deps.loadPayment(booking.id);
  if (!payment) return res(404, { error: 'payment_not_found' });
  if (payment.status !== 'aguardando') return res(409, { error: 'payment_not_pending' });

  try {
    const changed = await deps.markPaid(payment.provider_charge_id);
    return res(200, { ok: true, changed });
  } catch (e) {
    deps.log(`falha ao simular pagamento: ${e instanceof Error ? e.message : 'erro desconhecido'}`);
    return res(500, { error: 'could_not_mark_paid' });
  }
}
