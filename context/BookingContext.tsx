import React, { createContext, useState, useContext, useEffect } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';

interface Booking {
  propertyId: string;
  date: string;
  status: 'reservada' | 'realizada';
  checkIn?: string;
  checkOut?: string;
  nights?: number;
  payMethod?: 'pix' | 'card';
  total?: number;
}

interface BookingContextData {
  bookings: Booking[];
  addBooking: (propertyId: string, options?: {
    checkIn?: Date | null;
    checkOut?: Date | null;
    nights?: number;
    payMethod?: 'pix' | 'card';
    total?: number;
  }) => void;
  cancelBooking: (propertyId: string) => void;
}

const BookingContext = createContext<BookingContextData>({
  bookings: [],
  addBooking: () => {},
  cancelBooking: () => {},
});

const STORAGE_KEY = '@reservago:bookings';

export function BookingProvider({ children }: { children: React.ReactNode }) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      loadBookings();
    } else {
      setBookings([]);
    }
  }, [user]);

  const loadBookings = async () => {
    try {
      const stored = await AsyncStorage.getItem(`${STORAGE_KEY}:${user?.id}`);
      if (stored) setBookings(JSON.parse(stored));
    } catch (e) {
      console.error('Erro ao carregar reservas:', e);
    }
  };

  const saveBookings = async (newBookings: Booking[]) => {
    try {
      await AsyncStorage.setItem(
        `${STORAGE_KEY}:${user?.id}`,
        JSON.stringify(newBookings)
      );
    } catch (e) {
      console.error('Erro ao salvar reservas:', e);
    }
  };

  const addBooking = (propertyId: string, options?: {
    checkIn?: Date | null;
    checkOut?: Date | null;
    nights?: number;
    payMethod?: 'pix' | 'card';
    total?: number;
  }) => {
    // Mesma regra do CONSTRAINT valid_dates (check_out > check_in) que já
    // existe no banco (supabase/schema.sql) - replicada aqui pro usuário
    // receber o aviso na hora, sem depender de um round-trip até o Supabase
    // (e sem quebrar o fluxo local/offline de usuários estáticos, que nem
    // chega a bater no banco).
    if (options?.checkIn && options?.checkOut && options.checkOut <= options.checkIn) {
      Alert.alert('Datas inválidas', 'A data de check-out precisa ser depois da data de check-in.');
      return;
    }

    const formatDateBR = (date: Date) =>
      `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;

    const newBooking: Booking = {
      propertyId,
      date: new Date().toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
      status: 'reservada',
      checkIn: options?.checkIn ? formatDateBR(options.checkIn) : undefined,
      checkOut: options?.checkOut ? formatDateBR(options.checkOut) : undefined,
      nights: options?.nights,
      payMethod: options?.payMethod,
      total: options?.total,
    };
    const updated = [newBooking, ...bookings];
    setBookings(updated);
    saveBookings(updated);
  };

  const cancelBooking = (propertyId: string) => {
    setBookings(prev => {
      const idx = prev.findIndex(
        b => b.propertyId === propertyId && b.status === 'reservada'
      );
      if (idx === -1) return prev;
      const updated = prev.filter((_, i) => i !== idx);
      saveBookings(updated);
      return updated;
    });
  };

  return (
    <BookingContext.Provider value={{ bookings, addBooking, cancelBooking }}>
      {children}
    </BookingContext.Provider>
  );
}

export const useBookings = () => useContext(BookingContext);
