jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: { onAuthStateChange: jest.fn(), signOut: jest.fn() },
    from: jest.fn(),
    rpc: jest.fn(),
    channel: jest.fn(),
    removeChannel: jest.fn(),
  })),
}));

import { supabase } from '../../lib/supabase';
import {
  getNotifications,
  getUnreadCount,
  markAllAsRead,
  markAsRead,
  markMessageNotificationsAsRead,
  subscribeToNotifications,
} from '../notificationService';

function makeBuilder(result: { data: any; error: any }): any {
  const builder: any = {
    select: jest.fn(() => builder),
    update: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    in: jest.fn(() => builder),
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

describe('notificationService.getNotifications', () => {
  it('filtra por user_id, mais recentes primeiro', async () => {
    const builder = makeBuilder({ data: [{ id: 'n1' }], error: null });
    mockFrom.mockReturnValue(builder);

    await getNotifications('user-1');

    expect(mockFrom).toHaveBeenCalledWith('notifications');
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: false });
  });
});

describe('notificationService.getUnreadCount', () => {
  it('usa o RPC get_unread_notifications_count - não conta local', async () => {
    mockRpc.mockResolvedValue({ data: 3, error: null });

    const result = await getUnreadCount('user-1');

    expect(mockRpc).toHaveBeenCalledWith('get_unread_notifications_count', { p_user_id: 'user-1' });
    expect(mockFrom).not.toHaveBeenCalled();
    expect(result).toEqual({ data: 3, error: null });
  });
});

describe('notificationService.markAllAsRead', () => {
  it('usa o RPC mark_all_notifications_read - não faz update em massa direto', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    await markAllAsRead('user-1');

    expect(mockRpc).toHaveBeenCalledWith('mark_all_notifications_read', { p_user_id: 'user-1' });
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('notificationService.markAsRead (uma notificação)', () => {
  it('faz update direto (não há function no banco pra isso)', async () => {
    const builder = makeBuilder({ data: { id: 'n1', read: true }, error: null });
    mockFrom.mockReturnValue(builder);

    await markAsRead('n1');

    expect(builder.update).toHaveBeenCalledWith({ read: true });
    expect(builder.eq).toHaveBeenCalledWith('id', 'n1');
  });
});

describe('notificationService.markMessageNotificationsAsRead', () => {
  it('filtra por message_id IN (...) - não mexe em notificações de outros tipos', async () => {
    const builder = makeBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);

    await markMessageNotificationsAsRead(['m1', 'm2']);

    expect(builder.update).toHaveBeenCalledWith({ read: true });
    expect(builder.in).toHaveBeenCalledWith('message_id', ['m1', 'm2']);
  });

  it('lista vazia não bate no banco', async () => {
    await markMessageNotificationsAsRead([]);

    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('notificationService.subscribeToNotifications', () => {
  it('assina com filtro server-side user_id=eq.<userId> e devolve unsubscribe', () => {
    const mockOn = jest.fn().mockReturnThis();
    const mockSubscribe = jest.fn().mockReturnThis();
    const fakeChannel: any = { on: mockOn, subscribe: mockSubscribe };
    fakeChannel.on.mockReturnValue(fakeChannel);
    fakeChannel.subscribe.mockReturnValue(fakeChannel);
    (supabase.channel as jest.Mock).mockReturnValue(fakeChannel);

    const callback = jest.fn();
    const unsubscribe = subscribeToNotifications('user-1', callback);

    expect(supabase.channel).toHaveBeenCalledWith('notifications:user-1');
    expect(mockOn).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({ event: 'INSERT', table: 'notifications', filter: 'user_id=eq.user-1' }),
      expect.any(Function)
    );

    unsubscribe();
    expect(supabase.removeChannel).toHaveBeenCalledWith(fakeChannel);
  });
});
