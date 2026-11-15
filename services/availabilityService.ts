import type { Range } from '../lib/dateRange';
import { toISO } from '../lib/dateRange';
import { supabase } from '../lib/supabase';
import { ServiceResult } from './types';

// Disponibilidade por data e calendário de bloqueio do anfitrião (migração 021).
// Tudo que decide fica no banco: o app só pergunta e mostra.

export interface PropertyBlock {
  id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
}

/** A função ainda não existe no banco (migração 021 não aplicada). */
export function isMissingFunction(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === 'PGRST202' || error.code === '42883' || /could not find the function|does not exist/i.test(error.message ?? '');
}

/** Ids das cabanas ativas livres (sem reserva e sem bloqueio) em [entrada, saída). */
export async function availablePropertyIds(checkIn: string, checkOut: string): Promise<ServiceResult<string[]>> {
  const { data, error } = await supabase.rpc('available_property_ids', { p_check_in: checkIn, p_check_out: checkOut });
  if (error) {
    if (isMissingFunction(error)) return { data: null, error: 'A busca por data ainda não está disponível.' };
    return { data: null, error: error.code === '23514' ? error.message : 'Não foi possível buscar por data agora. Tente novamente.' };
  }
  const rows = (data ?? []) as unknown[];
  const ids = rows.map((r) => (typeof r === 'string' ? r : String((r as Record<string, unknown>).available_property_ids ?? ''))).filter(Boolean);
  return { data: ids, error: null };
}

/** Períodos bloqueados pelo anfitrião (sem o motivo), para o calendário do hóspede. Falha vira lista vazia. */
export async function blockedRanges(propertyId: string): Promise<ServiceResult<Range[]>> {
  const { data, error } = await supabase.rpc('blocked_ranges', { p_property_id: propertyId });
  if (error) return { data: isMissingFunction(error) ? [] : null, error: isMissingFunction(error) ? null : error.message };
  const rows = (data ?? []) as { start_date: string; end_date: string }[];
  return { data: rows.map((r) => ({ start: r.start_date, end: r.end_date })), error: null };
}

/** Bloqueios futuros da cabana, para o dono gerenciar. */
export async function listBlocks(propertyId: string): Promise<ServiceResult<PropertyBlock[]>> {
  const { data, error } = await supabase
    .from('property_blocks')
    .select('id, start_date, end_date, reason')
    .eq('property_id', propertyId)
    .gte('end_date', toISO(new Date()))
    .order('start_date', { ascending: true });
  if (error) return { data: isMissingFunction(error) || error.code === '42P01' || error.code === 'PGRST205' ? [] : null, error: null };
  return { data: (data ?? []) as PropertyBlock[], error: null };
}

function blockError(error: { code?: string; message: string }): string {
  if (error.code === '23P01') return 'Já existe um bloqueio nesse período.';
  if (error.code === '23514') return error.message;
  if (/row-level security/i.test(error.message)) return 'Só o dono da cabana pode bloquear datas.';
  return 'Não foi possível salvar o bloqueio agora. Tente novamente.';
}

export async function addBlock(args: { propertyId: string; userId: string; start: string; end: string; reason?: string }): Promise<ServiceResult<PropertyBlock>> {
  const { data, error } = await supabase
    .from('property_blocks')
    .insert({
      property_id: args.propertyId,
      created_by: args.userId,
      start_date: args.start,
      end_date: args.end,
      reason: args.reason?.trim() ? args.reason.trim().slice(0, 200) : null,
    })
    .select('id, start_date, end_date, reason')
    .single();
  if (error) return { data: null, error: blockError(error) };
  return { data: data as PropertyBlock, error: null };
}

export async function removeBlock(id: string): Promise<ServiceResult<true>> {
  const { error } = await supabase.from('property_blocks').delete().eq('id', id);
  if (error) return { data: null, error: 'Não foi possível remover o bloqueio agora. Tente novamente.' };
  return { data: true, error: null };
}
