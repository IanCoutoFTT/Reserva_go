import { groupErrors, ErrorRow } from '../errorSummary';

const NOW = new Date('2026-12-02T12:00:00Z');
const row = (over: Partial<ErrorRow>): ErrorRow => ({
  id: Math.random().toString(36),
  created_at: '2026-12-02T10:00:00Z',
  message: 'erro A',
  screen: 'details',
  app_version: '1.0.0',
  platform: 'android',
  user_id: null,
  ...over,
});

describe('groupErrors', () => {
  it('agrupa pela mensagem e conta', () => {
    const g = groupErrors([row({}), row({}), row({ message: 'erro B' })], NOW);
    expect(g.map((x) => [x.message, x.count])).toEqual([
      ['erro A', 2],
      ['erro B', 1],
    ]);
  });

  it('junta telas e versões sem repetir, e acha a última ocorrência', () => {
    const g = groupErrors(
      [
        row({ created_at: '2026-12-01T08:00:00Z', screen: 'details', app_version: '1.0.0' }),
        row({ created_at: '2026-12-02T09:00:00Z', screen: 'messages', app_version: '1.0.1' }),
        row({ created_at: '2026-12-01T09:00:00Z', screen: 'details', app_version: '1.0.0' }),
      ],
      NOW
    )[0];
    expect(g.screens).toEqual(['details', 'messages']);
    expect(g.versions).toEqual(['1.0.0', '1.0.1']);
    expect(g.last).toBe('2026-12-02T09:00:00Z');
  });

  it('conta as últimas 24 horas e as pessoas diferentes', () => {
    const g = groupErrors(
      [
        row({ created_at: '2026-12-02T11:00:00Z', user_id: 'u1' }),
        row({ created_at: '2026-12-02T11:30:00Z', user_id: 'u1' }),
        row({ created_at: '2026-11-30T11:00:00Z', user_id: 'u2' }),
        row({ created_at: '2026-12-02T08:00:00Z', user_id: null }),
      ],
      NOW
    )[0];
    expect(g.count).toBe(4);
    expect(g.last24h).toBe(3);
    expect(g.users).toBe(2);
  });

  it('o que está acontecendo agora vem primeiro', () => {
    const g = groupErrors(
      [
        row({ message: 'antigo', created_at: '2026-11-01T00:00:00Z' }),
        row({ message: 'antigo', created_at: '2026-11-02T00:00:00Z' }),
        row({ message: 'recente', created_at: '2026-12-02T11:00:00Z' }),
      ],
      NOW
    );
    expect(g[0].message).toBe('recente');
  });

  it('sem erros: lista vazia', () => {
    expect(groupErrors([], NOW)).toEqual([]);
  });
});
