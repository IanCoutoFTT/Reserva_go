jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: { onAuthStateChange: jest.fn(), signOut: jest.fn() },
    from: jest.fn(),
  })),
}));

import { supabase } from '../../lib/supabase';
import { createReview, getReviewCountByAuthor, getReviewsByProperty, hasReviewed } from '../reviewService';

function makeBuilder(result: { data: any; error: any }): any {
  const builder: any = {
    select: jest.fn(() => builder),
    insert: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    order: jest.fn(() => builder),
    single: jest.fn(() => Promise.resolve(result)),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

const mockFrom = supabase.from as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('reviewService.createReview', () => {
  it('insere em reviews com os campos certos', async () => {
    const builder = makeBuilder({ data: { id: 'r1', rating: 5 }, error: null });
    mockFrom.mockReturnValue(builder);

    const result = await createReview({
      property_id: 'p1',
      booking_id: 'b1',
      author_id: 'u1',
      rating: 5,
      comment: 'Ótimo!',
    });

    expect(mockFrom).toHaveBeenCalledWith('reviews');
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ property_id: 'p1', booking_id: 'b1', author_id: 'u1', rating: 5 })
    );
    expect(result.data).toEqual({ id: 'r1', rating: 5 });
  });

  it('propaga erro (ex.: violação do UNIQUE(booking_id, author_id))', async () => {
    mockFrom.mockReturnValue(
      makeBuilder({ data: null, error: { message: 'duplicate key value violates unique constraint' } })
    );

    const result = await createReview({ property_id: 'p1', booking_id: 'b1', author_id: 'u1', rating: 4, comment: '' });

    expect(result.error).toMatch(/unique constraint/);
  });
});

describe('reviewService.getReviewsByProperty', () => {
  it('embute profiles(name, avatar_url) do autor e filtra por property_id', async () => {
    const builder = makeBuilder({ data: [{ id: 'r1', profiles: { name: 'Ana' } }], error: null });
    mockFrom.mockReturnValue(builder);

    const result = await getReviewsByProperty('p1');

    expect(builder.select).toHaveBeenCalledWith('*, profiles(name, avatar_url)');
    expect(builder.eq).toHaveBeenCalledWith('property_id', 'p1');
    expect(result.data).toEqual([{ id: 'r1', profiles: { name: 'Ana' } }]);
  });
});

describe('reviewService.hasReviewed', () => {
  it('devolve true quando já existe uma review pra esse booking+autor', async () => {
    const builder = makeBuilder({ data: { id: 'r1' }, error: null });
    mockFrom.mockReturnValue(builder);

    const result = await hasReviewed('u1', 'b1');

    expect(builder.eq).toHaveBeenCalledWith('author_id', 'u1');
    expect(builder.eq).toHaveBeenCalledWith('booking_id', 'b1');
    expect(result).toEqual({ data: true, error: null });
  });

  it('devolve false quando não existe (mesma regra do UNIQUE(booking_id, author_id) - não reimplementa, só checa)', async () => {
    mockFrom.mockReturnValue(makeBuilder({ data: null, error: null }));

    const result = await hasReviewed('u1', 'b1');

    expect(result).toEqual({ data: false, error: null });
  });
});

describe('reviewService.getReviewCountByAuthor', () => {
  it('devolve a contagem (count exact/head) filtrada por author_id', async () => {
    mockFrom.mockReturnValue(makeBuilder({ data: null, error: null, count: 3 } as any));

    const result = await getReviewCountByAuthor('u1');

    expect(mockFrom).toHaveBeenCalledWith('reviews');
    expect(result).toEqual({ data: 3, error: null });
  });

  it('sem nenhuma review ainda, devolve 0 (não null)', async () => {
    mockFrom.mockReturnValue(makeBuilder({ data: null, error: null, count: 0 } as any));

    const result = await getReviewCountByAuthor('u1');

    expect(result).toEqual({ data: 0, error: null });
  });

  it('propaga erro do banco', async () => {
    mockFrom.mockReturnValue(makeBuilder({ data: null, error: { message: 'falha de conexão' }, count: null } as any));

    const result = await getReviewCountByAuthor('u1');

    expect(result).toEqual({ data: null, error: 'falha de conexão' });
  });
});
