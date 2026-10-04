import React from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.spyOn(Alert, 'alert').mockImplementation(() => {});

// BookingContext só depende de useAuth() (não importa supabase diretamente),
// então isolamos o teste mockando o hook em vez de subir um AuthProvider real.
const mockUser = { id: 'user-1', name: 'Hóspede Teste', email: 'h@t.com', role: 'hospede' as const, avatar: '' };
jest.mock('../AuthContext', () => ({
  useAuth: () => ({ user: mockUser }),
}));

import { BookingProvider, useBookings } from '../BookingContext';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <BookingProvider>{children}</BookingProvider>
);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('BookingContext', () => {
  it('cria uma reserva válida e ela aparece no início da lista', async () => {
    const { result } = renderHook(() => useBookings(), { wrapper });
    await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalled());

    act(() => {
      result.current.addBooking('property-1', {
        checkIn: new Date('2026-09-10'),
        checkOut: new Date('2026-09-12'),
        nights: 2,
        payMethod: 'card',
        total: 400,
      });
    });

    expect(result.current.bookings).toHaveLength(1);
    expect(result.current.bookings[0]).toMatchObject({
      propertyId: 'property-1',
      status: 'reservada',
      nights: 2,
      payMethod: 'card',
      total: 400,
    });
  });

  it('rejeita reserva com check_out <= check_in e não adiciona nada à lista', async () => {
    const { result } = renderHook(() => useBookings(), { wrapper });
    await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalled());

    const mesmoDia = new Date('2026-09-10');

    act(() => {
      result.current.addBooking('property-5', {
        checkIn: mesmoDia,
        checkOut: mesmoDia, // check_out == check_in - inválido (banco exige check_out > check_in)
        nights: 0,
        payMethod: 'card',
        total: 100,
      });
    });

    expect(result.current.bookings).toHaveLength(0);
    expect(Alert.alert).toHaveBeenCalledWith(
      'Datas inválidas',
      'A data de check-out precisa ser depois da data de check-in.'
    );

    act(() => {
      result.current.addBooking('property-5', {
        checkIn: new Date('2026-09-10'),
        checkOut: new Date('2026-09-05'), // check_out antes do check_in
        nights: -5,
        payMethod: 'card',
        total: 100,
      });
    });

    expect(result.current.bookings).toHaveLength(0);
  });

  it('persiste o total já com desconto Pix (o cálculo do desconto em si é feito por quem chama, em app/details.tsx)', async () => {
    const { result } = renderHook(() => useBookings(), { wrapper });
    await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalled());

    const precoBase = 200;
    const totalComDescontoPix = precoBase * 0.95; // mesma fórmula usada em app/details.tsx

    act(() => {
      result.current.addBooking('property-2', {
        nights: 1,
        payMethod: 'pix',
        total: totalComDescontoPix,
      });
    });

    expect(result.current.bookings[0].payMethod).toBe('pix');
    expect(result.current.bookings[0].total).toBe(190);
  });

  it('persiste as reservas no AsyncStorage com a chave por usuário', async () => {
    const { result } = renderHook(() => useBookings(), { wrapper });
    await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalled());

    act(() => {
      result.current.addBooking('property-3', { nights: 3, payMethod: 'card', total: 600 });
    });

    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        `@reservago:bookings:${mockUser.id}`,
        expect.stringContaining('property-3')
      )
    );
  });

  it('cancelBooking remove a reserva "reservada" mais recente daquela propriedade', async () => {
    const { result } = renderHook(() => useBookings(), { wrapper });
    await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalled());

    act(() => {
      result.current.addBooking('property-4', { nights: 1, payMethod: 'card', total: 100 });
    });
    expect(result.current.bookings).toHaveLength(1);

    act(() => {
      result.current.cancelBooking('property-4');
    });
    expect(result.current.bookings).toHaveLength(0);
  });
});
