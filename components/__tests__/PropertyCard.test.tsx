import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockToggleFavorite = jest.fn();
jest.mock('../../context/FavoritesContext', () => ({
  useFavorites: () => ({ favorites: [], toggleFavorite: mockToggleFavorite }),
}));

import { PropertyCard } from '../PropertyCard';

const baseProps = {
  id: 'property-1',
  title: 'Cabana da Serra',
  location: 'Alto Paraíso, GO',
  price: 350,
  rating: 4.8,
  description: 'Cabana isolada com vista pra cachoeira.',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('PropertyCard', () => {
  it('renderiza título, localização e preço', () => {
    render(<PropertyCard {...baseProps} />);

    expect(screen.getByText('Cabana da Serra')).toBeTruthy();
    expect(screen.getByText(/Alto Paraíso, GO/)).toBeTruthy();
    expect(screen.getByText(/350/)).toBeTruthy();
  });

  it('toca no coração chama toggleFavorite com o id da cabana, sem navegar', () => {
    render(<PropertyCard {...baseProps} />);

    fireEvent.press(screen.getByTestId('favorite-button'));

    expect(mockToggleFavorite).toHaveBeenCalledWith('property-1');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('tocar no card (fora do coração) navega para /details com os parâmetros da cabana', () => {
    render(<PropertyCard {...baseProps} />);

    fireEvent.press(screen.getByText('Cabana da Serra'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/details',
      params: expect.objectContaining({ id: 'property-1', title: 'Cabana da Serra' }),
    });
  });
});
