import { createHmac } from 'crypto';
import { CARD_EXPIRATION_MINUTES, intentIdempotencyKey, parseStripeSignature, toCents, verifyStripeSignature } from '../card.ts';

const SECRET = 'whsec_teste_123';
const hmac = async (key: string, msg: string) => createHmac('sha256', key).update(msg).digest('hex');
const sign = (body: string, t: number, secret = SECRET) => createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');

describe('toCents', () => {
  it('converte reais em centavos sem erro de ponto flutuante', () => {
    expect(toCents(660)).toBe(66000);
    expect(toCents(627.4)).toBe(62740);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(1.005)).toBe(101);
    expect(toCents(10)).toBe(1000);
  });
});

describe('intentIdempotencyKey', () => {
  const id = '11111111-2222-4333-8444-555555555555';
  it('é a mesma dentro da janela de 30 min e muda depois dela', () => {
    expect(CARD_EXPIRATION_MINUTES).toBe(30);
    const a = new Date('2026-12-01T12:00:00Z');
    const b = new Date('2026-12-01T12:20:00Z');
    const c = new Date('2026-12-01T12:31:00Z');
    expect(intentIdempotencyKey(id, a)).toBe(intentIdempotencyKey(id, b));
    expect(intentIdempotencyKey(id, a)).not.toBe(intentIdempotencyKey(id, c));
  });
  it('muda de uma reserva para outra', () => {
    const now = new Date('2026-12-01T12:00:00Z');
    expect(intentIdempotencyKey(id, now)).not.toBe(intentIdempotencyKey('99999999-2222-4333-8444-555555555555', now));
  });
});

describe('parseStripeSignature', () => {
  const v1 = 'a'.repeat(64);
  it('lê o tempo e todas as assinaturas v1', () => {
    expect(parseStripeSignature(`t=1700000000,v1=${v1},v1=${'b'.repeat(64)},v0=lixo`)).toEqual({
      timestamp: 1700000000,
      signatures: [v1, 'b'.repeat(64)],
    });
  });
  it('recusa cabeçalho ausente, sem tempo, sem v1 ou com assinatura malformada', () => {
    expect(parseStripeSignature(null)).toBeNull();
    expect(parseStripeSignature('')).toBeNull();
    expect(parseStripeSignature(`v1=${v1}`)).toBeNull();
    expect(parseStripeSignature('t=1700000000')).toBeNull();
    expect(parseStripeSignature('t=1700000000,v1=curto')).toBeNull();
    expect(parseStripeSignature(`t=abc,v1=${v1}`)).toBeNull();
    expect(parseStripeSignature('x'.repeat(1001))).toBeNull();
  });
});

describe('verifyStripeSignature', () => {
  const body = '{"type":"payment_intent.succeeded"}';
  const now = 1_800_000_000;

  it('aceita a assinatura certa', async () => {
    const header = `t=${now},v1=${sign(body, now)}`;
    expect(await verifyStripeSignature(body, header, SECRET, now, hmac)).toBe(true);
  });
  it('aceita se UMA das assinaturas v1 for a certa (troca de segredo)', async () => {
    const header = `t=${now},v1=${'0'.repeat(64)},v1=${sign(body, now)}`;
    expect(await verifyStripeSignature(body, header, SECRET, now, hmac)).toBe(true);
  });
  it('recusa corpo alterado', async () => {
    const header = `t=${now},v1=${sign(body, now)}`;
    expect(await verifyStripeSignature(body.replace('succeeded', 'created'), header, SECRET, now, hmac)).toBe(false);
  });
  it('recusa segredo errado ou vazio', async () => {
    const header = `t=${now},v1=${sign(body, now, 'whsec_outro')}`;
    expect(await verifyStripeSignature(body, header, SECRET, now, hmac)).toBe(false);
    expect(await verifyStripeSignature(body, `t=${now},v1=${sign(body, now)}`, '', now, hmac)).toBe(false);
  });
  it('recusa mensagem antiga demais (repetição) e do futuro, mas aceita dentro de 5 min', async () => {
    const header = `t=${now},v1=${sign(body, now)}`;
    expect(await verifyStripeSignature(body, header, SECRET, now + 301, hmac)).toBe(false);
    expect(await verifyStripeSignature(body, header, SECRET, now - 301, hmac)).toBe(false);
    expect(await verifyStripeSignature(body, header, SECRET, now + 299, hmac)).toBe(true);
  });
  it('recusa cabeçalho ausente ou inválido', async () => {
    expect(await verifyStripeSignature(body, null, SECRET, now, hmac)).toBe(false);
    expect(await verifyStripeSignature(body, 'lixo', SECRET, now, hmac)).toBe(false);
  });
});
