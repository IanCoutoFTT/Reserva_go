import { supabase } from '../lib/supabase';
import { Booking, BookingWithProperty, NewBooking, ServiceResult, toResult } from './types';

// Acesso à tabela `bookings` (supabase/schema.sql). O próprio banco garante
// check_out > check_in via CONSTRAINT valid_dates (schema.sql linha 159) -
// checkAvailability aqui cobre a regra de negócio adicional (não sobrepor
// reservas de outro hóspede no mesmo período), que é o que a função
// is_property_available() do banco resolve.

export async function checkAvailability(
  propertyId: string,
  checkIn: string,
  checkOut: string,
  excludeBookingId?: string
): Promise<ServiceResult<boolean>> {
  const { data, error } = await supabase.rpc('is_property_available', {
    p_property_id: propertyId,
    p_check_in: checkIn,
    p_check_out: checkOut,
    p_exclude_booking_id: excludeBookingId ?? null,
  });
  return toResult(data, error);
}

export async function createBooking(dados: NewBooking): Promise<ServiceResult<Booking>> {
  // status ('reservada'), nights (gerado) e timestamps ficam por conta do
  // banco (defaults/GENERATED ALWAYS em bookings, schema.sql linhas 139-156).
  const { data, error } = await supabase.from('bookings').insert(dados).select().single();
  return toResult(data, error);
}

export async function getBookingsByGuest(guestId: string): Promise<ServiceResult<BookingWithProperty[]>> {
  // owner_id no embed (branch feature/mensagens) - usado pra montar a lista
  // de "iniciar conversa com anfitrião" em app/(tabs)/messages.tsx a partir
  // do histórico real de reservas, sem query extra por reserva.
  const { data, error } = await supabase
    .from('bookings')
    .select('*, properties(title, location, images, owner_id)')
    .eq('guest_id', guestId)
    .order('check_in', { ascending: false });
  return toResult(data as unknown as BookingWithProperty[] | null, error);
}

export async function getBookingsByHost(hostId: string): Promise<ServiceResult<Booking[]>> {
  // bookings não tem host_id direto - vem de properties.owner_id. O "!inner"
  // faz o PostgREST tratar como inner join, permitindo filtrar a linha de
  // fora (bookings) pela coluna da tabela embutida (properties.owner_id).
  const { data, error } = await supabase
    .from('bookings')
    .select('*, properties!inner(owner_id)')
    .eq('properties.owner_id', hostId)
    .order('check_in', { ascending: false });
  return toResult(data as unknown as Booking[] | null, error);
}

export async function cancelBooking(id: string, reason?: string): Promise<ServiceResult<Booking>> {
  const { data, error } = await supabase
    .from('bookings')
    .update({ status: 'cancelada', cancelled_at: new Date().toISOString(), cancel_reason: reason ?? null })
    .eq('id', id)
    .select()
    .single();
  return toResult(data, error);
}
