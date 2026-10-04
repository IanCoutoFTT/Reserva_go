import { supabase } from '../lib/supabase';
import { Property, Report, ReportStatus, ServiceResult, toResult } from './types';

// Estatísticas e moderação pro admin-dashboard.tsx. `AdminStats` não é uma
// tabela do schema - é um agregado montado a partir de properties/bookings/
// profiles/reports pra alimentar o painel.
export interface AdminStats {
  totalProperties: number;
  totalBookings: number;
  totalUsers: number;
  pendingProperties: number;
  pendingReports: number;
}

export async function getStats(): Promise<ServiceResult<AdminStats>> {
  const [properties, bookings, users, pendingProperties, pendingReports] = await Promise.all([
    supabase.from('properties').select('*', { count: 'exact', head: true }),
    supabase.from('bookings').select('*', { count: 'exact', head: true }),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).is('deleted_at', null),
    supabase.from('properties').select('*', { count: 'exact', head: true }).eq('status', 'pendente'),
    supabase.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'pendente'),
  ]);

  const firstError = [properties, bookings, users, pendingProperties, pendingReports].find((r) => r.error)?.error;
  if (firstError) return toResult<AdminStats>(null, firstError);

  return {
    data: {
      totalProperties: properties.count ?? 0,
      totalBookings: bookings.count ?? 0,
      totalUsers: users.count ?? 0,
      pendingProperties: pendingProperties.count ?? 0,
      pendingReports: pendingReports.count ?? 0,
    },
    error: null,
  };
}

export async function getPendingProperties(): Promise<ServiceResult<Property[]>> {
  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .eq('status', 'pendente')
    .order('created_at', { ascending: true });
  return toResult(data, error);
}

export async function getReports(status?: ReportStatus): Promise<ServiceResult<Report[]>> {
  let query = supabase.from('reports').select('*');
  if (status) query = query.eq('status', status);
  const { data, error } = await query.order('created_at', { ascending: false });
  return toResult(data, error);
}

/**
 * reports tem DUAS FKs pra profiles (reporter_id, reported_user_id) sem nome
 * de constraint confirmado no schema.sql - em vez de arriscar um embed
 * `!fkey` errado no PostgREST, busca os nomes/título separadamente com
 * `.in(...)` e junta no client. Uma chamada extra por tela, não por
 * denúncia, então não vira N+1 de verdade.
 */
export interface ReportWithContext extends Report {
  propertyTitle: string | null;
  reporterName: string | null;
  reportedUserName: string | null;
}

export async function getReportsWithContext(status?: ReportStatus): Promise<ServiceResult<ReportWithContext[]>> {
  const { data: reports, error } = await getReports(status);
  if (error) return toResult<ReportWithContext[]>(null, { message: error });
  if (!reports || reports.length === 0) return { data: [], error: null };

  const propertyIds = [...new Set(reports.map((r) => r.property_id).filter((id): id is string => !!id))];
  const userIds = [
    ...new Set([
      ...reports.map((r) => r.reporter_id),
      ...reports.map((r) => r.reported_user_id).filter((id): id is string => !!id),
    ]),
  ];

  const [propertiesRes, profilesRes] = await Promise.all([
    propertyIds.length
      ? supabase.from('properties').select('id, title').in('id', propertyIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[], error: null }),
    userIds.length
      ? supabase.from('profiles').select('id, name').in('id', userIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
  ]);

  const propertyTitleById = new Map((propertiesRes.data ?? []).map((p) => [p.id, p.title]));
  const nameById = new Map((profilesRes.data ?? []).map((p) => [p.id, p.name]));

  return {
    data: reports.map((r) => ({
      ...r,
      propertyTitle: r.property_id ? propertyTitleById.get(r.property_id) ?? null : null,
      reporterName: nameById.get(r.reporter_id) ?? null,
      reportedUserName: r.reported_user_id ? nameById.get(r.reported_user_id) ?? null : null,
    })),
    error: null,
  };
}

export async function resolveReport(
  id: string,
  resolvedBy?: string,
  resolution?: string
): Promise<ServiceResult<Report>> {
  const { data, error } = await supabase
    .from('reports')
    .update({
      status: 'resolvido',
      resolved_at: new Date().toISOString(),
      resolved_by: resolvedBy ?? null,
      resolution: resolution ?? null,
    })
    .eq('id', id)
    .select()
    .single();
  return toResult(data, error);
}

/** Mesma ideia de resolveReport, mas pra denúncia que o admin decide não seguir adiante (status 'arquivado', já existe no enum ReportStatus e não tinha nenhuma função gravando esse valor). */
export async function archiveReport(id: string, resolvedBy?: string): Promise<ServiceResult<Report>> {
  const { data, error } = await supabase
    .from('reports')
    .update({
      status: 'arquivado',
      resolved_at: new Date().toISOString(),
      resolved_by: resolvedBy ?? null,
    })
    .eq('id', id)
    .select()
    .single();
  return toResult(data, error);
}

/**
 * Ranking real pro admin-dashboard (antes era um array de 3 itens fixos com
 * aviso "dados ilustrativos"). Usa bookings_count/rating, que já existem e já
 * são mantidos sozinhos pelos triggers update_property_bookings_count e
 * update_property_rating (schema.sql) - não recalcula nada aqui.
 */
export async function getTopProperties(limit = 5): Promise<ServiceResult<Property[]>> {
  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .eq('status', 'ativo')
    .order('bookings_count', { ascending: false })
    .order('rating', { ascending: false })
    .limit(limit);
  return toResult(data, error);
}
