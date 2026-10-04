import { supabase } from '../lib/supabase';
import { getOrCreateConversation } from './messageService';
import { ServiceResult } from './types';

// Suporte "real" (branch feature/mensagens, 07/09/2026): em vez de um bot ou
// de IA (decisão do time: deixar pra depois, envolve custo), a conversa de
// suporte é uma `conversations` normal como qualquer outra - só que o
// "anfitrião" é uma conta com profiles.role = 'admin'. Reaproveita
// integralmente conversations/messages/RLS/Realtime já existentes: nenhuma
// tabela nova, nenhuma policy nova, zero custo de API externa. Um admin de
// verdade responde pelo próprio app, como qualquer anfitrião responderia um
// hóspede.

// Cache em memória - a lista de admins não muda a cada mensagem, não faz
// sentido consultar de novo a cada load. Reseta sozinho a cada cold start
// do app (variável de módulo).
let cachedAdminId: string | null | undefined;

/**
 * Devolve o id do admin que recebe as conversas de suporte (o mais antigo,
 * se houver mais de um - critério simples e estável, não há tela ainda pra
 * escolher "o admin responsável"). `null` quando não existe nenhum admin
 * cadastrado (profiles.role = 'admin') - não é erro, é um estado válido do
 * projeto (ex.: antes de promover a primeira conta admin).
 */
export async function getSupportAdminId(): Promise<ServiceResult<string | null>> {
  if (cachedAdminId !== undefined) return { data: cachedAdminId, error: null };

  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  const adminId: string | null = data?.id ?? null;
  cachedAdminId = adminId;
  return { data: adminId, error: null };
}

/** Só para os testes - o cache de módulo não deve vazar de um teste pro outro. */
export function __resetSupportAdminCache() {
  cachedAdminId = undefined;
}

/**
 * Acha (ou cria, no primeiro contato) a conversa do hóspede com o suporte.
 * Reaproveita getOrCreateConversation (mesma function usada pelo botão
 * "Contato" em details.tsx e pela "Nova conversa" da aba Mensagens) - o
 * suporte não é um fluxo separado, é só mais uma conversa com property_id
 * nulo (não é sobre uma cabana específica).
 */
export async function getOrCreateSupportConversation(guestId: string): Promise<ServiceResult<string>> {
  const { data: adminId, error } = await getSupportAdminId();
  if (error) return { data: null, error };
  if (!adminId) {
    return { data: null, error: 'Nenhuma conta admin configurada para receber mensagens de suporte ainda.' };
  }
  return getOrCreateConversation(guestId, adminId, null);
}
