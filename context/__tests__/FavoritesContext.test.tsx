import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// FavoritesContext agora chama services/favoriteService, que passa por
// lib/supabase.ts -> @supabase/supabase-js. Mockado aqui sempre devolvendo
// favoritos vazios do "banco", pra não bater em rede de verdade nos testes
// e pra não conflitar com os toggles otimistas que os testes fazem (o
// estado local/AsyncStorage é o que os testes abaixo verificam).
jest.mock('@supabase/supabase-js', () => {
  const makeBuilder = (): any => {
    const builder: any = {
      select: jest.fn(() => builder),
      insert: jest.fn(() => builder),
      delete: jest.fn(() => builder),
      eq: jest.fn(() => builder),
      maybeSingle: jest.fn(() => Promise.resolve({ data: null, error: null })),
      single: jest.fn(() => Promise.resolve({ data: null, error: null })),
      then: (resolve: any, reject: any) => Promise.resolve({ data: [], error: null }).then(resolve, reject),
    };
    return builder;
  };
  return {
    createClient: jest.fn(() => ({
      auth: { onAuthStateChange: jest.fn(), signOut: jest.fn() },
      from: jest.fn(() => makeBuilder()),
    })),
  };
});

const mockUser = { id: 'user-1', name: 'Hóspede Teste', email: 'h@t.com', role: 'hospede' as const, avatar: '' };
jest.mock('../AuthContext', () => ({
  useAuth: () => ({ user: mockUser }),
}));

import { FavoritesProvider, useFavorites } from '../FavoritesContext';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <FavoritesProvider>{children}</FavoritesProvider>
);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('FavoritesContext', () => {
  it('adiciona um id aos favoritos', async () => {
    const { result } = renderHook(() => useFavorites(), { wrapper });
    // Espera o load completo (cache local + sincronização com o "banco"
    // mockado) terminar antes de togglear, senão a resposta do getFavorites
    // pode chegar depois e sobrescrever o toggle otimista do teste.
    await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalled());
    jest.clearAllMocks();

    act(() => {
      result.current.toggleFavorite('property-1');
    });

    expect(result.current.favorites).toEqual(['property-1']);
  });

  it('remove um id que já estava nos favoritos (toggle de novo)', async () => {
    const { result } = renderHook(() => useFavorites(), { wrapper });
    // Espera o load completo (cache local + sincronização com o "banco"
    // mockado) terminar antes de togglear, senão a resposta do getFavorites
    // pode chegar depois e sobrescrever o toggle otimista do teste.
    await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalled());
    jest.clearAllMocks();

    act(() => {
      result.current.toggleFavorite('property-1');
    });
    expect(result.current.favorites).toEqual(['property-1']);

    act(() => {
      result.current.toggleFavorite('property-1');
    });
    expect(result.current.favorites).toEqual([]);
  });

  it('persiste os favoritos no AsyncStorage com a chave por usuário', async () => {
    const { result } = renderHook(() => useFavorites(), { wrapper });
    // Espera o load completo (cache local + sincronização com o "banco"
    // mockado) terminar antes de togglear, senão a resposta do getFavorites
    // pode chegar depois e sobrescrever o toggle otimista do teste.
    await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalled());
    jest.clearAllMocks();

    act(() => {
      result.current.toggleFavorite('property-9');
    });

    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        `@reservago:favorites:${mockUser.id}`,
        JSON.stringify(['property-9'])
      )
    );
  });
});
