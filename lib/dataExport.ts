// "Baixar meus dados" (LGPD, art. 18: acesso e portabilidade). Monta o arquivo a
// partir do que o próprio usuário consegue ler (as regras de acesso do banco já
// garantem que cada um só vê o que é seu). Função pura: sem rede, testável.

import { maskCpf, maskPixKey, type PixKeyType } from './payout';

type Row = Record<string, unknown>;

export interface RawUserData {
  profile?: Row | null;
  properties?: Row[];
  bookings?: Row[];
  payments?: Row[];
  reviews?: Row[];
  favorites?: Row[];
  notifications?: Row[];
  /** Só as mensagens que o próprio usuário enviou (as do outro lado são dados de outra pessoa). */
  messages?: Row[];
  reports?: Row[];
  payout?: { full_name?: string | null; document?: string | null; pix_key_type?: string | null; pix_key?: string | null } | null;
}

const PIX_TYPES = ['cpf', 'email', 'telefone', 'aleatoria'];

/** CPF e chave Pix saem mascarados: o arquivo pode ser compartilhado por engano. */
function maskPayout(p: NonNullable<RawUserData['payout']>): Row {
  const type = PIX_TYPES.includes(String(p.pix_key_type)) ? (p.pix_key_type as PixKeyType) : null;
  return {
    nome_completo: p.full_name ?? null,
    cpf: p.document ? maskCpf(p.document) : null,
    tipo_chave_pix: type,
    chave_pix: p.pix_key && type ? maskPixKey(type, p.pix_key) : null,
  };
}

export function buildDataExport(raw: RawUserData, now: Date = new Date()): Record<string, unknown> {
  const list = (v: Row[] | undefined): Row[] => (Array.isArray(v) ? v : []);
  const data = {
    perfil: raw.profile ?? null,
    cabanas_anunciadas: list(raw.properties),
    reservas: list(raw.bookings),
    pagamentos: list(raw.payments),
    avaliacoes_escritas: list(raw.reviews),
    favoritos: list(raw.favorites),
    notificacoes: list(raw.notifications),
    mensagens_enviadas: list(raw.messages),
    denuncias_feitas: list(raw.reports),
    dados_para_receber: raw.payout ? maskPayout(raw.payout) : null,
  };

  return {
    projeto: 'ReservaGO',
    gerado_em: now.toISOString(),
    aviso:
      'Cópia dos seus dados pessoais no ReservaGO (LGPD, art. 18). Inclui só o que é seu: mensagens de outras pessoas não entram. ' +
      'CPF e chave Pix aparecem mascarados por segurança. Não há dados de cartão: eles ficam só com a Stripe.',
    resumo: {
      cabanas_anunciadas: data.cabanas_anunciadas.length,
      reservas: data.reservas.length,
      pagamentos: data.pagamentos.length,
      avaliacoes_escritas: data.avaliacoes_escritas.length,
      favoritos: data.favoritos.length,
      notificacoes: data.notificacoes.length,
      mensagens_enviadas: data.mensagens_enviadas.length,
      denuncias_feitas: data.denuncias_feitas.length,
    },
    ...data,
  };
}

/** Nome sugerido para o arquivo/compartilhamento. */
export function dataExportTitle(now: Date = new Date()): string {
  return `reservago-meus-dados-${now.toISOString().slice(0, 10)}`;
}
