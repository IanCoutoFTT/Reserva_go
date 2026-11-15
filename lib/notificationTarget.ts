// Para onde ir ao tocar numa notificação. Função pura: recebe o que a notificação
// sabe (tipo, título, ids) e o papel de quem está logado, e devolve a rota (ou
// null quando não há para onde levar, e a notificação só é marcada como lida).

export type NotificationTargetInput = {
  type: string;
  title: string;
  propertyId?: string | null;
  bookingId?: string | null;
};

export type NotificationTarget =
  | { pathname: '/(tabs)/messages' }
  | { pathname: '/(tabs)/bookings' }
  | { pathname: '/my-cabins' }
  | { pathname: '/admin-dashboard' }
  | { pathname: '/payout-settings' }
  | { pathname: '/details'; params: { id: string } };

type Role = 'hospede' | 'anfitriao' | 'admin' | string | null | undefined;

export function notificationTarget(n: NotificationTargetInput, role: Role): NotificationTarget | null {
  if (n.type === 'mensagem') return { pathname: '/(tabs)/messages' };

  const title = n.title.toLowerCase();
  if (title.includes('dados de recebimento')) return { pathname: '/payout-settings' };
  // Pagamento que chegou depois de a reserva ser cancelada: é o admin quem precisa devolver o valor.
  if (role === 'admin' && title.includes('pagamento de reserva cancelada')) return { pathname: '/admin-dashboard' };

  if (n.bookingId) {
    return role === 'anfitriao' || role === 'admin' ? { pathname: '/my-cabins' } : { pathname: '/(tabs)/bookings' };
  }

  if (n.propertyId) {
    if (role === 'admin') return { pathname: '/admin-dashboard' }; // novo anúncio para aprovar, denúncias
    if (role === 'anfitriao') return { pathname: '/my-cabins' }; // anúncio aprovado ou reprovado
    return { pathname: '/details', params: { id: n.propertyId } };
  }

  return null;
}
