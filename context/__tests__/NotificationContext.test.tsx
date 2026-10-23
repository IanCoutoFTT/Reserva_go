import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';

let mockUser: { id: string } | null = null;
jest.mock('../AuthContext', () => ({
  useAuth: () => ({ user: mockUser }),
}));

const mockGetNotifications = jest.fn();
const mockGetUnreadCount = jest.fn();
jest.mock('../../services/notificationService', () => ({
  getNotifications: (...args: unknown[]) => mockGetNotifications(...args),
  getUnreadCount: (...args: unknown[]) => mockGetUnreadCount(...args),
  markAllAsRead: jest.fn(),
  markAsRead: jest.fn(),
  subscribeToNotifications: jest.fn(() => () => {}),
}));

import { NotificationProvider, useNotifications } from '../NotificationContext';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <NotificationProvider>{children}</NotificationProvider>
);

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUnreadCount.mockResolvedValue({ data: 0, error: null });
});

describe('NotificationContext - sem notificações inventadas para usuário real', () => {
  it('login estático (teste visual) vê as notificações de exemplo', () => {
    mockUser = { id: 'static-admin-01' };
    const { result } = renderHook(() => useNotifications(), { wrapper });

    expect(result.current.notifications.length).toBeGreaterThan(0);
  });

  it('usuário real começa com a lista vazia enquanto carrega (sem mock)', () => {
    mockUser = { id: 'real-user-uuid' };
    mockGetNotifications.mockReturnValue(new Promise(() => {})); // nunca resolve
    const { result } = renderHook(() => useNotifications(), { wrapper });

    expect(result.current.notifications).toEqual([]);
  });

  it('se a busca falha, continua vazio e sinaliza o erro (não cai no mock)', async () => {
    mockUser = { id: 'real-user-uuid' };
    mockGetNotifications.mockResolvedValue({ data: null, error: 'sem conexão' });
    const { result } = renderHook(() => useNotifications(), { wrapper });

    await waitFor(() => expect(result.current.loadError).toBe(true));
    expect(result.current.notifications).toEqual([]);
  });

  it('busca com sucesso mostra só o que veio do banco', async () => {
    mockUser = { id: 'real-user-uuid' };
    mockGetNotifications.mockResolvedValue({
      data: [{ id: 'n1', user_id: 'real-user-uuid', type: 'aviso', title: 'Oi', body: 'Corpo', read: false, created_at: new Date().toISOString() }],
      error: null,
    });
    const { result } = renderHook(() => useNotifications(), { wrapper });

    await waitFor(() => expect(result.current.notifications).toHaveLength(1));
    expect(result.current.notifications[0].title).toBe('Oi');
    expect(result.current.loadError).toBe(false);
  });
});
