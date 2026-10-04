import { supabase } from '../lib/supabase';
import { NewReport, Report, ServiceResult, toResult } from './types';

// Acesso de ESCRITA à tabela `reports` (supabase/schema.sql). A leitura e a
// moderação (getReports/getReportsWithContext/resolveReport/archiveReport)
// já moram em services/adminService.ts - são ações do admin. Criar uma
// denúncia não é ação de admin (qualquer usuário logado pode denunciar um
// anúncio), por isso mora num arquivo separado, mesmo padrão de
// reviewService.ts (createReview fica junto das leituras porque lá não tem
// essa mistura de dono).
//
// Antes desta função, não existia NENHUM jeito de criar uma denúncia no app
// inteiro - o botão "🚩 Denunciar este anúncio" em app/details.tsx não tinha
// nem onPress.

/** policy reports_insert (schema.sql) já exige reporter_id = auth.uid() - o service só repassa o que a tela montar. */
export async function createReport(dados: NewReport): Promise<ServiceResult<Report>> {
  const { data, error } = await supabase.from('reports').insert(dados).select().single();
  return toResult(data, error);
}
