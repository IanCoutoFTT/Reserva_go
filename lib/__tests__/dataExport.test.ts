import { buildDataExport, dataExportTitle } from '../dataExport';

const NOW = new Date('2026-12-01T12:00:00Z');

describe('buildDataExport', () => {
  it('sem nada: arquivo válido, com listas vazias e o resumo zerado', () => {
    const out = buildDataExport({}, NOW) as Record<string, any>;
    expect(out.projeto).toBe('ReservaGO');
    expect(out.gerado_em).toBe('2026-12-01T12:00:00.000Z');
    expect(out.perfil).toBeNull();
    expect(out.dados_para_receber).toBeNull();
    expect(out.reservas).toEqual([]);
    expect(Object.values(out.resumo).every((n) => n === 0)).toBe(true);
  });

  it('traz tudo o que é do usuário e conta cada grupo no resumo', () => {
    const out = buildDataExport(
      {
        profile: { id: 'u1', name: 'Maria', email: 'm@x.com' },
        properties: [{ id: 'p1' }],
        bookings: [{ id: 'b1' }, { id: 'b2' }],
        payments: [{ id: 'pay1' }],
        reviews: [{ id: 'r1' }],
        favorites: [{ id: 'f1' }, { id: 'f2' }, { id: 'f3' }],
        notifications: [{ id: 'n1' }],
        messages: [{ id: 'm1' }],
        reports: [{ id: 'rep1' }],
      },
      NOW
    ) as Record<string, any>;
    expect(out.perfil).toEqual({ id: 'u1', name: 'Maria', email: 'm@x.com' });
    expect(out.resumo).toEqual({
      cabanas_anunciadas: 1, reservas: 2, pagamentos: 1, avaliacoes_escritas: 1,
      favoritos: 3, notificacoes: 1, mensagens_enviadas: 1, denuncias_feitas: 1,
    });
  });

  it('CPF e chave Pix saem mascarados, nunca completos', () => {
    const out = buildDataExport(
      { payout: { full_name: 'Maria da Silva', document: '52998224725', pix_key_type: 'cpf', pix_key: '52998224725' } },
      NOW
    ) as Record<string, any>;
    const text = JSON.stringify(out);
    expect(out.dados_para_receber.nome_completo).toBe('Maria da Silva');
    expect(text).not.toContain('52998224725');
    expect(out.dados_para_receber.cpf).toMatch(/•/);
    expect(out.dados_para_receber.chave_pix).toMatch(/•/);
  });

  it('chave Pix de e-mail também é mascarada', () => {
    const out = buildDataExport({ payout: { full_name: 'Maria', document: '52998224725', pix_key_type: 'email', pix_key: 'maria.silva@email.com' } }, NOW) as Record<string, any>;
    expect(JSON.stringify(out)).not.toContain('maria.silva@email.com');
  });

  it('tipo de chave desconhecido não quebra e não vaza a chave', () => {
    const out = buildDataExport({ payout: { full_name: 'Maria', document: null, pix_key_type: 'boleto', pix_key: 'segredo123' } }, NOW) as Record<string, any>;
    expect(out.dados_para_receber.chave_pix).toBeNull();
    expect(JSON.stringify(out)).not.toContain('segredo123');
  });

  it('o aviso diz que não há dados de cartão nem mensagens de outras pessoas', () => {
    const out = buildDataExport({}, NOW) as Record<string, any>;
    expect(out.aviso).toMatch(/cartão/);
    expect(out.aviso).toMatch(/mensagens de outras pessoas/);
  });

  it('resultado é JSON serializável', () => {
    expect(() => JSON.stringify(buildDataExport({ bookings: [{ id: 'b1', total: 660 }] }, NOW))).not.toThrow();
  });
});

describe('dataExportTitle', () => {
  it('usa a data do dia', () => {
    expect(dataExportTitle(NOW)).toBe('reservago-meus-dados-2026-12-01');
  });
});
