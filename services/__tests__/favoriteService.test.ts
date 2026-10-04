jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: { onAuthStateChange: jest.fn(), signOut: jest.fn() },
    from: jest.fn(),
  })),
}));

import { supabase } from '../../lib/supabase';
import { addFavorite, getFavorites, isFavorite, removeFavorite } from '../favoriteService';

function makeBuilder(result: { data: any; error: any }): any {
  const builder: any = {
    select: jest.fn(() => builder),
    insert: jest.fn(() => builder),
    delete: jest.fn(() => builder),
    eq: jest.fn(() => builder),
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

describe('favoriteService.getFavorites', () => {
  it('devolve só os property_id (formato que FavoritesContext já usa)', async () => {
    const builder = makeBuilder({
      data: [{ property_id: 'p1' }, { property_id: 'p2' }],
      error: null,
    });
    mockFrom.mockReturnValue(builder);

    const result = await getFavorites('user-1');

    expect(builder.select).toHaveBeenCalledWith('property_id');
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(result).toEqual({ data: ['p1', 'p2'], error: null });
  });

  it('propaga erro do banco', async () => {
    mockFrom.mockReturnValue(makeBuilder({ data: null, error: { message: 'timeout' } }));

    const result = await getFavorites('user-1');

    expect(result).toEqual({ data: null, error: 'timeout' });
  });
});

describe('favoriteService.addFavorite / removeFavorite', () => {
  it('addFavorite insere { user_id, property_id }', async () => {
    const builder = makeBuilder({ data: { id: 'f1' }, error: null });
    mockFrom.mockReturnValue(builder);

    await addFavorite('user-1', 'p1');

    expect(builder.insert).toHaveBeenCalledWith({ user_id: 'user-1', property_id: 'p1' });
  });

  it('removeFavorite filtra por user_id e property_id', async () => {
    const builder = makeBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);

    await removeFavorite('user-1', 'p1');

    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(builder.eq).toHaveBeenCalledWith('property_id', 'p1');
  });
});

describe('favoriteService.isFavorite', () => {
  it('true quando existe linha', async () => {
    mockFrom.mockReturnValue(makeBuilder({ data: { id: 'f1' }, error: null }));

    const result = await isFavorite('user-1', 'p1');

    expect(result).toEqual({ data: true, error: null });
  });

  it('false quando não existe', async () => {
    mockFrom.mockReturnValue(makeBuilder({ data: null, error: null }));

    const result = await isFavorite('user-1', 'p1');

    expect(result).toEqual({ data: false, error: null });
  });
});
