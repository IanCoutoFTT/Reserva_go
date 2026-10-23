import React from 'react';
import { renderHook } from '@testing-library/react-native';

let mockUser: { id: string } | null = null;
jest.mock('../AuthContext', () => ({
  useAuth: () => ({ user: mockUser }),
}));

import { ListingProvider, useListings } from '../ListingContext';

const wrapper = ({ children }: { children: React.ReactNode }) => <ListingProvider>{children}</ListingProvider>;

describe('ListingContext - cabanas de exemplo só para o login estático', () => {
  it('login estático (teste visual) vê as cabanas de exemplo', () => {
    mockUser = { id: 'static-hospede-01' };
    const { result } = renderHook(() => useListings(), { wrapper });

    expect(result.current.listings.length).toBeGreaterThan(0);
  });

  it('usuário real não vê cabanas inventadas', () => {
    mockUser = { id: '8c1f0a5e-2b34-4c56-9d78-0123456789ab' };
    const { result } = renderHook(() => useListings(), { wrapper });

    expect(result.current.listings).toEqual([]);
  });

  it('visitante (sem login) não vê cabanas inventadas', () => {
    mockUser = null;
    const { result } = renderHook(() => useListings(), { wrapper });

    expect(result.current.allProperties).toEqual([]);
  });
});
