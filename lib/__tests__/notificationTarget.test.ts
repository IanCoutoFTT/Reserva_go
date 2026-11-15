import { notificationTarget } from '../notificationTarget';

const n = (over: Partial<Parameters<typeof notificationTarget>[0]> = {}) => ({ type: 'reserva', title: 'Reserva', propertyId: null, bookingId: null, ...over });

describe('notificationTarget', () => {
  it('mensagem abre a aba Mensagens, para qualquer papel', () => {
    for (const role of ['hospede', 'anfitriao', 'admin']) {
      expect(notificationTarget(n({ type: 'mensagem', bookingId: 'b1' }), role)).toEqual({ pathname: '/(tabs)/messages' });
    }
  });

  it('hóspede: notificação de reserva ou de pagamento abre Minhas Viagens', () => {
    expect(notificationTarget(n({ title: '⏳ Reserva aguardando pagamento', bookingId: 'b1', propertyId: 'p1' }), 'hospede')).toEqual({ pathname: '/(tabs)/bookings' });
  });

  it('anfitrião: reserva e pagamento recebido abrem o painel do anfitrião', () => {
    expect(notificationTarget(n({ title: '💰 Pagamento recebido', bookingId: 'b1' }), 'anfitriao')).toEqual({ pathname: '/my-cabins' });
  });

  it('anfitrião: anúncio aprovado ou reprovado abre o painel do anfitrião', () => {
    expect(notificationTarget(n({ type: 'aviso', title: 'Anúncio aprovado', propertyId: 'p1' }), 'anfitriao')).toEqual({ pathname: '/my-cabins' });
  });

  it('admin: novo anúncio e denúncias abrem o painel de controle', () => {
    expect(notificationTarget(n({ type: 'aviso', title: 'Novo anúncio', propertyId: 'p1' }), 'admin')).toEqual({ pathname: '/admin-dashboard' });
  });

  it('admin: pagamento de reserva cancelada abre o painel de controle (a devolver)', () => {
    expect(notificationTarget(n({ type: 'aviso', title: '⚠️ Pagamento de reserva cancelada', bookingId: 'b1', propertyId: 'p1' }), 'admin')).toEqual({ pathname: '/admin-dashboard' });
  });

  it('dados de recebimento abrem a tela Dados para receber', () => {
    expect(notificationTarget(n({ type: 'aviso', title: 'Dados de recebimento cadastrados' }), 'anfitriao')).toEqual({ pathname: '/payout-settings' });
  });

  it('hóspede com só a cabana: abre os detalhes dela', () => {
    expect(notificationTarget(n({ type: 'aviso', title: 'Nova avaliação', propertyId: 'p9' }), 'hospede')).toEqual({ pathname: '/details', params: { id: 'p9' } });
  });

  it('sem ids e sem tipo especial: não navega', () => {
    expect(notificationTarget(n({ type: 'promocao', title: 'Oferta' }), 'hospede')).toBeNull();
    expect(notificationTarget(n({ type: 'aviso', title: 'Lembrete de viagem' }), null)).toBeNull();
  });
});
