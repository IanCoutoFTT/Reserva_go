jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: { onAuthStateChange: jest.fn(), signOut: jest.fn() },
    from: jest.fn(),
    rpc: jest.fn(),
  })),
}));

import { supabase } from '../../lib/supabase';
import { cancelBooking, checkAvailability, createBooking, getBookingsByGuest, getBookingsByHost } from '../bookingService';

function makeBuilder(result: { data: any; error: any }): any {
  const builder: any = {
    select: jest.fn(() => builder),
    insert: jest.fn(() => builder),
    update: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    order: jest.fn(() => builder),
    single: jest.fn(() => Promise.resolve(result)),
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

const mockFrom = supabase.from as jest.Mock;
const mockRpc = supabase.rpc as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('bookingService.checkAvailability', () => {
  it('chama o RPC is_property_available com os parâmetros certos - não reimplementa a lógica de sobreposição no client', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });

    const result = await checkAvailability('prop-1', '2026-09-10', '2026-09-12', 'booking-x');

    expect(mockRpc).toHaveBeenCalledWith('is_property_available', {
      p_property_id: 'prop-1',
      p_check_in: '2026-09-10',
      p_check_out: '2026-09-12',
      p_exclude_booking_id: 'booking-x',
    });
    expect(mockFrom).not.toHaveBeenCalled(); // não faz nenhuma query direta em `bookings` pra checar overlap
    expect(result).toEqual({ data: true, error: null });
  });

  it('p_exclude_booking_id vira null quando omitido', async () => {
    mockRpc.mockResolvedValue({ data: false, error: null });

    await checkAvailability('prop-1', '2026-09-10', '2026-09-12');

    expect(mockRpc).toHaveBeenCalledWith(
      'is_property_available',
      expect.objectContaining({ p_exclude_booking_id: null })
    );
  });

  it('propaga erro do RPC', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'function não existe' } });

    const result = await checkAvailability('prop-1', '2026-09-10', '2026-09-12');

    expect(result).toEqual({ data: null, error: 'function não existe' });
  });
});

describe('bookingService.createBooking', () => {
  it('insere em bookings e devolve a linha criada', async () => {
    const builder = makeBuilder({ data: { id: 'b1', status: 'reservada' }, error: null });
    mockFrom.mockReturnValue(builder);

    const result = await createBooking({
      property_id: 'prop-1',
      guest_id: 'guest-1',
      check_in: '2026-09-10',
      check_out: '2026-09-12',
      pay_method: 'pix',
      price_per_night: 200,
      total: 380,
      pix_discount: true,
    });

    expect(mockFrom).toHaveBeenCalledWith('bookings');
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ property_id: 'prop-1', pay_method: 'pix' })
    );
    expect(result.data).toEqual({ id: 'b1', status: 'reservada' });
  });
});

describe('bookingService.getBookingsByGuest', () => {
  it('filtra por guest_id', async () => {
    const builder = makeBuilder({ data: [], error: null });
    mockFrom.mockReturnValue(builder);

    await getBookingsByGuest('guest-1');

    expect(builder.eq).toHaveBeenCalledWith('guest_id', 'guest-1');
  });

  it('embute owner_id junto com title/location/images (precisa saber o anfitrião pra "nova conversa")', async () => {
    const builder = makeBuilder({ data: [], error: null });
    mockFrom.mockReturnValue(builder);

    await getBookingsByGuest('guest-1');

    expect(builder.select).toHaveBeenCalledWith('*, properties(title, location, images, owner_id)');
  });
});

describe('bookingService.getBookingsByHost', () => {
  it('usa properties!inner e filtra por properties.owner_id (bookings não tem host_id direto)', async () => {
    const builder = makeBuilder({ data: [], error: null });
    mockFrom.mockReturnValue(builder);

    await getBookingsByHost('host-1');

    expect(builder.select).toHaveBeenCalledWith('*, properties!inner(owner_id)');
    expect(builder.eq).toHaveBeenCalledWith('properties.owner_id', 'host-1');
  });
});

describe('bookingService.cancelBooking', () => {
  it('grava status "cancelada" e cancelled_at', async () => {
    const builder = makeBuilder({ data: { id: 'b1', status: 'cancelada' }, error: null });
    mockFrom.mockReturnValue(builder);

    await cancelBooking('b1', 'Mudança de planos');

    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'cancelada', cancel_reason: 'Mudança de planos' })
    );
  });
});
