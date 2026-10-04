jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: { onAuthStateChange: jest.fn(), signOut: jest.fn() },
    from: jest.fn(),
  })),
}));

import { supabase } from '../../lib/supabase';
import { createReport } from '../reportService';

function makeBuilder(result: { data: any; error: any }): any {
  const builder: any = {
    select: jest.fn(() => builder),
    insert: jest.fn(() => builder),
    single: jest.fn(() => Promise.resolve(result)),
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

const mockFrom = supabase.from as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('reportService.createReport', () => {
  it('insere a denúncia com os campos certos (denúncia de cabana, com reported_user_id do dono)', async () => {
    const builder = makeBuilder({ data: { id: 'r1', reason: 'Anúncio enganoso' }, error: null });
    mockFrom.mockReturnValue(builder);

    const result = await createReport({
      reporter_id: 'user-1',
      property_id: 'prop-1',
      reported_user_id: 'owner-1',
      reason: 'Anúncio enganoso',
      details: 'A cabana não tem piscina como anunciado.',
    });

    expect(mockFrom).toHaveBeenCalledWith('reports');
    expect(builder.insert).toHaveBeenCalledWith({
      reporter_id: 'user-1',
      property_id: 'prop-1',
      reported_user_id: 'owner-1',
      reason: 'Anúncio enganoso',
      details: 'A cabana não tem piscina como anunciado.',
    });
    expect(result).toEqual({ data: { id: 'r1', reason: 'Anúncio enganoso' }, error: null });
  });

  it('aceita details null (campo opcional)', async () => {
    const builder = makeBuilder({ data: { id: 'r2' }, error: null });
    mockFrom.mockReturnValue(builder);

    await createReport({
      reporter_id: 'user-1',
      property_id: 'prop-1',
      reported_user_id: 'owner-1',
      reason: 'Outro motivo',
      details: null,
    });

    expect(builder.insert).toHaveBeenCalledWith(expect.objectContaining({ details: null }));
  });

  it('propaga erro do banco (ex.: RLS reports_insert exige reporter_id = auth.uid())', async () => {
    mockFrom.mockReturnValue(
      makeBuilder({ data: null, error: { message: 'new row violates row-level security policy' } })
    );

    const result = await createReport({
      reporter_id: 'user-1',
      property_id: 'prop-1',
      reported_user_id: 'owner-1',
      reason: 'Outro motivo',
      details: null,
    });

    expect(result).toEqual({ data: null, error: 'new row violates row-level security policy' });
  });
});
