import React, { createContext, useState, useContext, useCallback, useEffect } from 'react';
import { useAuth } from './AuthContext';
import {
  getNotifications,
  getUnreadCount,
  markAllAsRead as markAllAsReadRemote,
  markAsRead as markAsReadRemote,
  subscribeToNotifications,
} from '../services/notificationService';
import type { AppNotification as DbNotification } from '../services/types';

type NotificationType = 'reserva' | 'mensagem' | 'promocao' | 'aviso';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  time: string;
  read: boolean;
}

interface NotificationContextData {
  notifications: AppNotification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  addNotification: (n: Omit<AppNotification, 'id' | 'read'>) => void;
  /** Reconsulta a contagem de não lidas no Supabase - usado por outras telas (ex.: messages.tsx) depois de mexer em algo que pode ter mudado o total. No-op pra usuário estático/desconectado. */
  refresh: () => void;
}

// Usado só como fallback local (usuário estático de dev, ou quando o
// Supabase falha) - pra tela de notificações nunca ficar em branco.
const INITIAL_NOTIFICATIONS: AppNotification[] = [
  {
    id: '1',
    type: 'reserva',
    title: 'Reserva confirmada! 🎉',
    body: 'Sua reserva no Refúgio das Pedras foi confirmada para 15–18 de Jun.',
    time: 'Agora',
    read: false,
  },
  {
    id: '2',
    type: 'mensagem',
    title: 'Carlos Mendes respondeu',
    body: 'Olá! O check-in pode ser feito a partir das 14h. Qualquer dúvida é só chamar.',
    time: '5 min atrás',
    read: false,
  },
  {
    id: '3',
    type: 'promocao',
    title: '🏷️ Oferta especial para você',
    body: 'Use o cupom RESERVAGO15 e ganhe 15% de desconto na sua próxima reserva.',
    time: '1 hora atrás',
    read: false,
  },
  {
    id: '4',
    type: 'aviso',
    title: 'Lembrete de viagem',
    body: 'Sua estadia na Cabana Suíça começa em 3 dias. Confira as diretrizes da hospedagem.',
    time: 'Ontem',
    read: true,
  },
  {
    id: '5',
    type: 'reserva',
    title: 'Reserva pendente',
    body: 'Sua solicitação para a Cabana do Rio está aguardando confirmação do anfitrião.',
    time: 'Ontem',
    read: true,
  },
  {
    id: '6',
    type: 'mensagem',
    title: 'Nova mensagem de Ana Lima',
    body: 'Tudo certo para a chegada de vocês! Deixei as instruções na porta.',
    time: '2 dias atrás',
    read: true,
  },
  {
    id: '7',
    type: 'promocao',
    title: '🌿 Novidade no ReservaGO',
    body: 'Agora você pode filtrar cabanas por nível de isolamento. Experimente!',
    time: '3 dias atrás',
    read: true,
  },
  {
    id: '8',
    type: 'reserva',
    title: 'Reserva cancelada',
    body: 'A reserva no Chalé das Montanhas foi cancelada. O reembolso será processado em até 5 dias úteis.',
    time: '1 semana atrás',
    read: true,
  },
];

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Agora';
  if (minutes < 60) return `${minutes} min atrás`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hora${hours > 1 ? 's' : ''} atrás`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Ontem';
  if (days < 7) return `${days} dias atrás`;
  const weeks = Math.floor(days / 7);
  return `${weeks} semana${weeks > 1 ? 's' : ''} atrás`;
}

function mapNotification(n: DbNotification): AppNotification {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    time: formatRelativeTime(n.created_at),
    read: n.read,
  };
}

const NotificationContext = createContext<NotificationContextData>({
  notifications: [],
  unreadCount: 0,
  markAsRead: () => {},
  markAllAsRead: () => {},
  addNotification: () => {},
  refresh: () => {},
});

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>(INITIAL_NOTIFICATIONS);
  const [remoteUnreadCount, setRemoteUnreadCount] = useState<number | null>(null);

  // Usuário estático (__DEV__) não existe em profiles/auth - fica só no
  // mock local, como sempre funcionou.
  const isStaticUser = !!user?.id && user.id.startsWith('static-');
  const isConnected = !!user?.id && !isStaticUser;

  const refreshUnreadCount = useCallback((userId: string) => {
    getUnreadCount(userId).then(({ data, error }) => {
      if (error) {
        console.log('[notifications] getUnreadCount falhou ->', error);
        return;
      }
      setRemoteUnreadCount(data ?? 0);
    });
  }, []);

  useEffect(() => {
    if (!isConnected || !user?.id) {
      setRemoteUnreadCount(null);
      return;
    }

    let cancelled = false;

    getNotifications(user.id).then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data) {
        console.log('[notifications] getNotifications falhou, mantendo mock local ->', error);
        return;
      }
      setNotifications(data.map(mapNotification));
    });

    refreshUnreadCount(user.id);

    // Realtime: nova notificação chega na hora, sem precisar recarregar a tela.
    const unsubscribe = subscribeToNotifications(user.id, (n) => {
      setNotifications((prev) => [mapNotification(n), ...prev]);
      refreshUnreadCount(user.id);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [isConnected, user?.id, refreshUnreadCount]);

  const unreadCount = isConnected && remoteUnreadCount !== null
    ? remoteUnreadCount
    : notifications.filter((n) => !n.read).length;

  const markAsRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));

    if (isConnected) {
      markAsReadRemote(id).then(({ error }) => {
        if (error) console.log('[notifications] markAsRead falhou ->', error);
        else if (user?.id) refreshUnreadCount(user.id);
      });
    }
  }, [isConnected, user?.id, refreshUnreadCount]);

  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));

    if (isConnected && user?.id) {
      markAllAsReadRemote(user.id).then(({ error }) => {
        if (error) console.log('[notifications] markAllAsRead falhou ->', error);
        else setRemoteUnreadCount(0);
      });
    }
  }, [isConnected, user?.id]);

  // Não conectado a nada real de propósito - notificações reais são criadas
  // por triggers do banco (notify_host_on_booking, notify_on_message,
  // notify_admins_on_report), nunca diretamente pelo client.
  const addNotification = useCallback((n: Omit<AppNotification, 'id' | 'read'>) => {
    const newN: AppNotification = {
      ...n,
      id: String(Date.now()),
      read: false,
    };
    setNotifications(prev => [newN, ...prev]);
  }, []);

  const refresh = useCallback(() => {
    if (isConnected && user?.id) refreshUnreadCount(user.id);
  }, [isConnected, user?.id, refreshUnreadCount]);

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markAsRead, markAllAsRead, addNotification, refresh }}>
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationContext);
