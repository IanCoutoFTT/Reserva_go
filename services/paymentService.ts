import { supabase } from '../lib/supabase';
import { ServiceResult, toResult } from './types';

// Pagamento por Pix (migração 013 + Edge Functions em supabase/functions).
// O app NUNCA grava em `payments` nem decide valores: pede a cobrança à função
// pix-create-charge e só lê o resultado (RLS: hóspede, anfitrião e admin leem).

export type PaymentStatus = 'aguardando' | 'pago' | 'expirado' | 'falhou';

export interface Payment {
  id: string;
  booking_id: string;
  status: PaymentStatus;
  amount: number;
  pix_copy_paste: string | null;
  /** PNG em base64, sem o prefixo "data:". */
  pix_qr_image: string | null;
  expires_at: string;
  paid_at?: string | null;
}

/** Código que a Edge Function devolve em { error } quando recusa o pedido. */
export type PixErrorCode =
  | 'cpf_required'
  | 'already_paid'
  | 'host_without_payout_account'
  | 'booking_not_found'
  | 'booking_not_active'
  | 'booking_not_pix'
  | 'provider_error'
  | 'charge_not_registered'
  | 'unauthorized'
  | 'unknown';

export interface PixResult<T> extends ServiceResult<T> {
  code: PixErrorCode | null;
}

const MESSAGES: Record<PixErrorCode, string> = {
  cpf_required: 'Informe um CPF válido para gerar o Pix.',
  already_paid: 'Essa reserva já foi paga.',
  host_without_payout_account: 'O anfitrião ainda não configurou o recebimento. Fale com ele ou escolha outra forma de pagamento.',
  booking_not_found: 'Reserva não encontrada.',
  booking_not_active: 'Essa reserva não está mais ativa.',
  booking_not_pix: 'Essa reserva não é para pagar com Pix.',
  provider_error: 'O serviço de pagamento está indisponível agora. Tente de novo em instantes.',
  charge_not_registered: 'Não foi possível registrar a cobrança. Tente novamente.',
  unauthorized: 'Entre na sua conta para pagar.',
  unknown: 'Não foi possível concluir agora. Tente novamente.',
};

const KNOWN = new Set(Object.keys(MESSAGES));

/** A função responde 4xx/5xx com { error: "codigo" } no corpo; o supabase-js entrega isso em error.context. */
async function readCode(error: unknown): Promise<PixErrorCode> {
  const ctx = (error as { context?: { json?: () => Promise<unknown> } } | null)?.context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = (await ctx.json()) as { error?: unknown } | null;
      if (typeof body?.error === 'string' && KNOWN.has(body.error)) return body.error as PixErrorCode;
    } catch {
      /* corpo ilegível: cai no genérico */
    }
  }
  return 'unknown';
}

async function invoke(name: string, body: Record<string, unknown>): Promise<{ data: unknown; code: PixErrorCode | null }> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) return { data: null, code: await readCode(error) };
  return { data, code: null };
}

/** Cria a cobrança Pix da reserva, ou devolve a que já está aberta. `cpf` só é pedido por alguns provedores. */
export async function createPixCharge(bookingId: string, cpf?: string): Promise<PixResult<Payment>> {
  const { data, code } = await invoke('pix-create-charge', { booking_id: bookingId, ...(cpf ? { cpf } : {}) });
  if (code) return { data: null, error: MESSAGES[code], code };
  const payment = (data as { payment?: Payment } | null)?.payment;
  if (!payment) return { data: null, error: MESSAGES.unknown, code: 'unknown' };
  return { data: payment, error: null, code: null };
}

/** Só no modo simulado (teste): o hóspede "paga" a própria cobrança. */
export async function simulatePixPayment(bookingId: string): Promise<PixResult<true>> {
  const { code } = await invoke('pix-simulate-payment', { booking_id: bookingId });
  if (code) return { data: null, error: MESSAGES[code], code };
  return { data: true, error: null, code: null };
}

export async function getPaymentByBooking(bookingId: string): Promise<ServiceResult<Payment | null>> {
  const { data, error } = await supabase
    .from('payments')
    .select('id, booking_id, status, amount, pix_copy_paste, pix_qr_image, expires_at, paid_at')
    .eq('booking_id', bookingId)
    .maybeSingle();
  return toResult(data as Payment | null, error);
}
