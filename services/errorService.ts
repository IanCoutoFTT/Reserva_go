import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { buildErrorReport, createReportGate, ErrorReport } from '../lib/errorReporter';
import { supabase } from '../lib/supabase';
import { ServiceResult } from './types';

// Monitoramento de erros próprio (migração 022). O envio NUNCA pode quebrar o app nem aparecer
// para o usuário: qualquer falha aqui é engolida.

const gate = createReportGate();

export interface StoredError extends ErrorReport {
  id: string;
  created_at: string;
  user_id: string | null;
}

/** Envia o erro ao Supabase, sem esperar nem avisar ninguém. Em desenvolvimento não envia. */
export function reportError(error: unknown, screen?: string | null): void {
  try {
    if (__DEV__) return;
    const report = buildErrorReport(error, {
      screen,
      appVersion: Constants.expoConfig?.version ?? null,
      platform: Platform.OS,
    });
    if (!gate.allow(report)) return;
    // sem .select(): quem envia não tem permissão de ler a tabela
    void Promise.resolve(supabase.from('app_errors').insert(report)).catch(() => {});
  } catch {
    /* nunca propaga */
  }
}

/** Últimos erros, para o admin. Quem não é admin recebe lista vazia (RLS). */
export async function getRecentErrors(limit = 100): Promise<ServiceResult<StoredError[]>> {
  const { data, error } = await supabase
    .from('app_errors')
    .select('id, created_at, user_id, message, stack, screen, app_version, platform')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return { data: null, error: error.code === '42P01' || error.code === 'PGRST205' ? 'O monitoramento ainda não está ativo no banco.' : 'Não foi possível carregar os erros agora.' };
  return { data: (data ?? []) as StoredError[], error: null };
}

export async function clearErrors(): Promise<ServiceResult<true>> {
  const { error } = await supabase.from('app_errors').delete().gte('created_at', '1970-01-01');
  if (error) return { data: null, error: 'Não foi possível limpar agora. Tente novamente.' };
  return { data: true, error: null };
}
