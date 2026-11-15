import { canReplyToReview, REPLY_MAX, validateReply } from '../reviews';

const NOW = new Date('2026-12-01T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000).toISOString();

describe('validateReply', () => {
  it('limpa os espaços das pontas', () => {
    expect(validateReply('  Obrigado!  ')).toEqual({ ok: true, value: 'Obrigado!' });
  });
  it('vazia ou só espaços: recusa', () => {
    expect(validateReply('')).toEqual({ ok: false, error: 'Escreva a resposta.' });
    expect(validateReply('   \n ')).toEqual({ ok: false, error: 'Escreva a resposta.' });
  });
  it('500 caracteres passa; 501 não', () => {
    expect(validateReply('x'.repeat(REPLY_MAX)).ok).toBe(true);
    const r = validateReply('x'.repeat(REPLY_MAX + 1));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/500/);
  });
});

describe('canReplyToReview', () => {
  it('quem não é dono da cabana nunca responde', () => {
    expect(canReplyToReview({ host_reply: null }, false, NOW)).toBe(false);
    expect(canReplyToReview({ host_reply: 'oi', host_replied_at: hoursAgo(1) }, false, NOW)).toBe(false);
  });
  it('o dono responde quando ainda não há resposta', () => {
    expect(canReplyToReview({}, true, NOW)).toBe(true);
    expect(canReplyToReview({ host_reply: null }, true, NOW)).toBe(true);
  });
  it('o dono corrige a própria resposta até 24h depois', () => {
    expect(canReplyToReview({ host_reply: 'oi', host_replied_at: hoursAgo(23) }, true, NOW)).toBe(true);
  });
  it('passadas 24h a resposta fica como está', () => {
    expect(canReplyToReview({ host_reply: 'oi', host_replied_at: hoursAgo(25) }, true, NOW)).toBe(false);
  });
  it('resposta sem data válida: não deixa mexer', () => {
    expect(canReplyToReview({ host_reply: 'oi', host_replied_at: null }, true, NOW)).toBe(false);
    expect(canReplyToReview({ host_reply: 'oi', host_replied_at: 'lixo' }, true, NOW)).toBe(false);
  });
});
