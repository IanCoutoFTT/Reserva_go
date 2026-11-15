// Liga as regras puras (handlers.ts e cardHandlers.ts) ao ambiente real das Edge
// Functions: banco do Supabase com a service_role e o provedor escolhido. Este
// arquivo usa Deno e imports "npm:", por isso fica FORA da checagem do TypeScript
// do app (tsconfig.json, "exclude") e não tem teste no Jest.

import { createClient } from 'npm:@supabase/supabase-js@2';
import QRCode from 'npm:qrcode@1.5.4';
import type { CardDeps } from './cardHandlers.ts';
import type { BookingRow, HandlerResult, PaymentRow, PixDeps } from './handlers.ts';
import { asaasProvider, mockProvider, type PixProvider } from './providers.ts';
import { stripeApi, type StripeApi } from './stripe.ts';

/**
 * O provedor simulado não manda imagem. Aqui desenhamos um QR de verdade com o
 * código simulado (que continua inválido como Pix), para a demonstração mostrar
 * um QR escaneável em vez do aviso de "indisponível".
 */
function mockWithQr(): PixProvider {
  const base = mockProvider();
  return {
    ...base,
    async createCharge(req) {
      const charge = await base.createCharge(req);
      try {
        const dataUrl: string = await QRCode.toDataURL(charge.copyPaste, { width: 440, margin: 2, errorCorrectionLevel: 'M' });
        return { ...charge, qrImageBase64: dataUrl.replace(/^data:image\/png;base64,/, '') };
      } catch (e) {
        console.error(`[pix] falha ao desenhar o QR: ${e instanceof Error ? e.message : e}`);
        return charge; // sem imagem: o app mostra só o copia e cola
      }
    },
  };
}

export function buildProvider(): PixProvider {
  const name = Deno.env.get('PIX_PROVIDER') ?? 'mock';
  if (name === 'mock') return mockWithQr();
  if (name === 'asaas') {
    const apiKey = Deno.env.get('ASAAS_API_KEY');
    if (!apiKey) throw new Error('ASAAS_API_KEY não configurada.');
    return asaasProvider({ apiKey, baseUrl: Deno.env.get('ASAAS_BASE_URL') ?? 'https://api-sandbox.asaas.com/v3' });
  }
  throw new Error(`PIX_PROVIDER inválido: ${name}`);
}

function makeDb() {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes.');
  // service_role: só vive aqui no servidor, nunca vai para o app.
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

type Db = ReturnType<typeof makeDb>;

/** Consultas que o Pix e o cartão usam do mesmo jeito. */
function sharedQueries(db: Db) {
  return {
    async getUserId(authHeader: string | null): Promise<string | null> {
      const token = authHeader?.replace(/^Bearer\s+/i, '');
      if (!token) return null;
      const { data, error } = await db.auth.getUser(token);
      return error || !data.user ? null : data.user.id;
    },

    async loadBooking(id: string): Promise<BookingRow | null> {
      const { data } = await db
        .from('bookings')
        .select('id, guest_id, status, pay_method, total, nights, price_per_night, properties(title, owner_id)')
        .eq('id', id)
        .maybeSingle();
      if (!data) return null;
      const prop = (Array.isArray(data.properties) ? data.properties[0] : data.properties) as { title: string; owner_id: string } | null;
      if (!prop) return null;
      return {
        id: data.id,
        guest_id: data.guest_id,
        status: data.status,
        pay_method: data.pay_method,
        total: Number(data.total),
        nights: Number(data.nights),
        price_per_night: Number(data.price_per_night),
        property_title: prop.title,
        owner_id: prop.owner_id,
      } satisfies BookingRow;
    },

    async loadPayment(bookingId: string): Promise<PaymentRow | null> {
      const { data } = await db.from('payments').select('*').eq('booking_id', bookingId).maybeSingle();
      return (data as PaymentRow | null) ?? null;
    },

    async loadPayoutAccount(userId: string): Promise<{ account_id: string | null; has_pix_key: boolean } | null> {
      const { data } = await db.from('payout_accounts').select('account_id, pix_key').eq('user_id', userId).maybeSingle();
      return data ? { account_id: data.account_id ?? null, has_pix_key: !!data.pix_key } : null;
    },

    async markPaid(chargeId: string): Promise<boolean> {
      const { data, error } = await db.rpc('mark_payment_paid', { p_charge_id: chargeId });
      if (error) throw new Error(error.message);
      return data === true;
    },
  };
}

export function buildDeps(): PixDeps {
  const db = makeDb();

  return {
    ...sharedQueries(db),
    provider: buildProvider(),
    now: () => new Date(),
    log: (message) => console.error(`[pix] ${message}`),

    async getUserProfile(userId) {
      const [{ data: profile }, { data: auth }] = await Promise.all([
        db.from('profiles').select('name').eq('id', userId).maybeSingle(),
        db.auth.admin.getUserById(userId),
      ]);
      return { name: profile?.name ?? 'Hóspede ReservaGO', email: auth?.user?.email ?? null };
    },

    async registerCharge(a) {
      const { data, error } = await db.rpc('register_pix_charge', {
        p_user_id: a.userId,
        p_booking_id: a.bookingId,
        p_provider: a.provider,
        p_charge_id: a.chargeId,
        p_copy_paste: a.copyPaste,
        p_qr_image: a.qrImage,
        p_expires_at: a.expiresAt.toISOString(),
      });
      if (error) throw new Error(error.message);
      return (Array.isArray(data) ? data[0] : data) as PaymentRow;
    },
  };
}

// ── Cartão (Stripe) ─────────────────────────────────────────
/** HMAC-SHA256 em hexadecimal, com a Web Crypto do Deno. */
async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

function buildStripe(): StripeApi | null {
  const secretKey = Deno.env.get('STRIPE_SECRET_KEY');
  return secretKey ? stripeApi({ secretKey }) : null;
}

export function buildCardDeps(): CardDeps {
  const db = makeDb();

  return {
    ...sharedQueries(db),
    stripe: buildStripe(),
    now: () => new Date(),
    log: (message) => console.error(`[cartao] ${message}`),
    hmacHex: hmacSha256Hex,

    async loadPaymentByCharge(chargeId) {
      const { data } = await db.from('payments').select('*').eq('provider_charge_id', chargeId).maybeSingle();
      return (data as PaymentRow | null) ?? null;
    },

    async registerCardCharge(a) {
      const { data, error } = await db.rpc('register_card_charge', {
        p_user_id: a.userId,
        p_booking_id: a.bookingId,
        p_provider: a.provider,
        p_charge_id: a.chargeId,
        p_expires_at: a.expiresAt.toISOString(),
      });
      if (error) throw new Error(error.message);
      return (Array.isArray(data) ? data[0] : data) as PaymentRow;
    },
  };
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export function respond(r: HandlerResult): Response {
  return new Response(JSON.stringify(r.body), {
    status: r.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
