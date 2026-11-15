import { hostPaymentLabel, isAwaitingPayment } from '../booking';

describe('isAwaitingPayment', () => {
  const active = { active: true };

  it('cobrança aberta: aguardando', () => {
    expect(isAwaitingPayment({ ...active, paymentStatus: 'aguardando' })).toBe(true);
  });
  it('exige pagamento mas a cobrança nunca nasceu: aguardando (o botão Pagar agora cria a cobrança)', () => {
    expect(isAwaitingPayment({ ...active, paymentRequired: true, paymentStatus: null })).toBe(true);
    expect(isAwaitingPayment({ ...active, paymentRequired: true })).toBe(true);
  });
  it('reserva antiga, que não exige pagamento e não tem cobrança: continua Confirmada', () => {
    expect(isAwaitingPayment({ ...active, paymentRequired: false, paymentStatus: null })).toBe(false);
    expect(isAwaitingPayment(active)).toBe(false);
  });
  it('paga: nunca aguarda', () => {
    expect(isAwaitingPayment({ ...active, paymentRequired: true, paymentStatus: 'pago' })).toBe(false);
  });
  it('reserva inativa (cancelada ou já encerrada) ou com não comparecimento: não aguarda', () => {
    expect(isAwaitingPayment({ active: false, paymentRequired: true })).toBe(false);
    expect(isAwaitingPayment({ ...active, paymentRequired: true, noShow: true })).toBe(false);
  });
  it('cobrança vencida ou recusada: não aguarda (a reserva é cancelada pelo servidor)', () => {
    expect(isAwaitingPayment({ ...active, paymentRequired: true, paymentStatus: 'expirado' })).toBe(false);
  });
});

describe('hostPaymentLabel', () => {
  it('Pago', () => expect(hostPaymentLabel({ status: 'reservada', paymentStatus: 'pago' })).toBe('Pago'));
  it('Aguardando pagamento, com cobrança aberta ou sem cobrança que exige pagamento', () => {
    expect(hostPaymentLabel({ status: 'reservada', paymentStatus: 'aguardando' })).toBe('Aguardando pagamento');
    expect(hostPaymentLabel({ status: 'reservada', paymentRequired: true })).toBe('Aguardando pagamento');
  });
  it('reserva cancelada não aguarda pagamento', () => {
    expect(hostPaymentLabel({ status: 'cancelada', paymentRequired: true })).toBe('');
    expect(hostPaymentLabel({ status: 'cancelada', paymentStatus: 'aguardando' })).toBe('');
  });
  it('paga e depois cancelada ainda mostra "Pago" (o dinheiro entrou)', () => {
    expect(hostPaymentLabel({ status: 'cancelada', paymentStatus: 'pago' })).toBe('Pago');
  });
  it('sem nada: vazio', () => expect(hostPaymentLabel({ status: 'reservada' })).toBe(''));
});
