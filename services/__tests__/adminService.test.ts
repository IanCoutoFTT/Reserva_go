// Mesmo padrão de services/__tests__/propertyService.test.ts: builder
// encadeável e "thenable" pra cobrir tanto `await query.eq(...)` quanto
// `await query.select().single()`.
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: { onAuthStateChange: jest.fn(), signOut: jest.fn() },
    from: jest.fn(),
  })),
}));

import { supabase } from '../../lib/supabase';
import {
  archiveReport,
  getPendingProperties,
  getReports,
  getReportsWithContext,
  getStats,
  getTopProperties,
  resolveReport,
} from '../adminService';

function makeBuilder(result: { data: any; error: any; count?: any }): any {
  const builder: any = {
    select: jest.fn(() => builder),
    update: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    in: jest.fn(() => builder),
    is: jest.fn(() => builder),
    order: jest.fn(() => builder),
    limit: jest.fn(() => builder),
    single: jest.fn(() => Promise.resolve(result)),
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

const mockFrom = supabase.from as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('adminService.getStats', () => {
  it('agrega as 5 contagens (properties/bookings/profiles/pending properties/pending reports)', async () => {
    mockFrom.mockReturnValue(makeBuilder({ data: null, error: null, count: 3 }));

    const result = await getStats();

    expect(result.data).toEqual({
      totalProperties: 3,
      totalBookings: 3,
      totalUsers: 3,
      pendingProperties: 3,
      pendingReports: 3,
    });
  });

  it('propaga o primeiro erro encontrado entre as 5 consultas', async () => {
    mockFrom.mockReturnValue(makeBuilder({ data: null, error: { message: 'falha de conexão' }, count: null }));

    const result = await getStats();

    expect(result).toEqual({ data: null, error: 'falha de conexão' });
  });
});

describe('adminService.getPendingProperties', () => {
  it('filtra status "pendente"', async () => {
    const builder = makeBuilder({ data: [{ id: 'p1' }], error: null });
    mockFrom.mockReturnValue(builder);

    await getPendingProperties();

    expect(mockFrom).toHaveBeenCalledWith('properties');
    expect(builder.eq).toHaveBeenCalledWith('status', 'pendente');
  });
});

describe('adminService.getReports', () => {
  it('sem status, não filtra por status', async () => {
    const builder = makeBuilder({ data: [], error: null });
    mockFrom.mockReturnValue(builder);

    await getReports();

    expect(builder.eq).not.toHaveBeenCalled();
  });

  it('com status, filtra por ele', async () => {
    const builder = makeBuilder({ data: [], error: null });
    mockFrom.mockReturnValue(builder);

    await getReports('resolvido');

    expect(builder.eq).toHaveBeenCalledWith('status', 'resolvido');
  });
});

describe('adminService.getReportsWithContext', () => {
  it('junta título da cabana e nomes de denunciante/denunciado via .in() (sem embed ambíguo de FK)', async () => {
    const reportsBuilder = makeBuilder({
      data: [
        {
          id: 'r1',
          reporter_id: 'u1',
          property_id: 'p1',
          reported_user_id: 'u2',
          reason: 'spam',
          details: null,
          status: 'pendente',
          resolved_by: null,
          resolved_at: null,
          resolution: null,
          created_at: '2024-01-01',
        },
      ],
      error: null,
    });
    const propertiesBuilder = makeBuilder({ data: [{ id: 'p1', title: 'Cabana X' }], error: null });
    const profilesBuilder = makeBuilder({
      data: [
        { id: 'u1', name: 'Ana' },
        { id: 'u2', name: 'Bruno' },
      ],
      error: null,
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'reports') return reportsBuilder;
      if (table === 'properties') return propertiesBuilder;
      if (table === 'profiles') return profilesBuilder;
      throw new Error(`tabela inesperada: ${table}`);
    });

    const result = await getReportsWithContext();

    expect(propertiesBuilder.in).toHaveBeenCalledWith('id', ['p1']);
    expect(profilesBuilder.in).toHaveBeenCalledWith('id', ['u1', 'u2']);
    expect(result.data).toEqual([
      expect.objectContaining({
        id: 'r1',
        propertyTitle: 'Cabana X',
        reporterName: 'Ana',
        reportedUserName: 'Bruno',
      }),
    ]);
  });

  it('sem denúncias, não consulta properties/profiles', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'reports') return makeBuilder({ data: [], error: null });
      throw new Error(`não deveria consultar "${table}" sem denúncias`);
    });

    const result = await getReportsWithContext();

    expect(result).toEqual({ data: [], error: null });
  });

  it('propaga erro de getReports sem tentar buscar o contexto', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'reports') return makeBuilder({ data: null, error: { message: 'falha' } });
      throw new Error(`não deveria consultar "${table}"`);
    });

    const result = await getReportsWithContext();

    expect(result).toEqual({ data: null, error: 'falha' });
  });
});

describe('adminService.resolveReport', () => {
  it('grava status "resolvido" com resolved_by/resolved_at', async () => {
    const builder = makeBuilder({ data: { id: 'r1', status: 'resolvido' }, error: null });
    mockFrom.mockReturnValue(builder);

    await resolveReport('r1', 'admin-1');

    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'resolvido', resolved_by: 'admin-1' })
    );
  });
});

describe('adminService.archiveReport', () => {
  it('grava status "arquivado" (não confundir com resolveReport)', async () => {
    const builder = makeBuilder({ data: { id: 'r1', status: 'arquivado' }, error: null });
    mockFrom.mockReturnValue(builder);

    await archiveReport('r1', 'admin-1');

    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'arquivado', resolved_by: 'admin-1' })
    );
  });
});

describe('adminService.getTopProperties', () => {
  it('filtra status "ativo", ordena por bookings_count/rating desc e aplica o limite', async () => {
    const builder = makeBuilder({ data: [{ id: 'p1' }], error: null });
    mockFrom.mockReturnValue(builder);

    await getTopProperties(5);

    expect(builder.eq).toHaveBeenCalledWith('status', 'ativo');
    expect(builder.order).toHaveBeenCalledWith('bookings_count', { ascending: false });
    expect(builder.order).toHaveBeenCalledWith('rating', { ascending: false });
    expect(builder.limit).toHaveBeenCalledWith(5);
  });

  it('default do limite é 5 quando não informado', async () => {
    const builder = makeBuilder({ data: [], error: null });
    mockFrom.mockReturnValue(builder);

    await getTopProperties();

    expect(builder.limit).toHaveBeenCalledWith(5);
  });
});
