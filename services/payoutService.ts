import type { PayoutValue, PixKeyType } from '../lib/payout';
import { supabase } from '../lib/supabase';
import { ServiceResult } from './types';

// Dados para recebimento (tabela payout_accounts, migração 014). Só o dono lê e
// grava (RLS) e só anfitrião/admin; o banco valida e normaliza tudo.

export interface PayoutDetails {
  full_name: string | null;
  document: string | null;
  pix_key_type: PixKeyType | null;
  pix_key: string | null;
}

const COLUMNS = 'full_name, document, pix_key_type, pix_key';

/**
 * A mensagem do gatilho do banco (check_violation 23514) já é em português e
 * própria para mostrar. Qualquer outro erro vira texto genérico, para não
 * despejar mensagem técnica do Postgres na tela.
 */
function friendlyError(error: { message: string; code?: string }): string {
  if (error.code === '23514' && !/violates|constraint/i.test(error.message)) return error.message;
  return 'Não foi possível salvar agora. Confira os dados e tente novamente.';
}

export async function getMyPayout(userId: string): Promise<ServiceResult<PayoutDetails | null>> {
  const { data, error } = await supabase.from('payout_accounts').select(COLUMNS).eq('user_id', userId).maybeSingle();
  if (error) return { data: null, error: 'Não foi possível carregar seus dados de recebimento.' };
  return { data: (data as PayoutDetails | null) ?? null, error: null };
}

export async function savePayout(userId: string, value: PayoutValue): Promise<ServiceResult<PayoutDetails>> {
  const { data, error } = await supabase
    .from('payout_accounts')
    .upsert({ user_id: userId, ...value }, { onConflict: 'user_id' })
    .select(COLUMNS)
    .single();
  if (error) return { data: null, error: friendlyError(error) };
  return { data: data as PayoutDetails, error: null };
}
