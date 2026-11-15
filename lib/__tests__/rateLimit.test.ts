import { rateLimitMessage } from '../rateLimit';

describe('rateLimitMessage', () => {
  it('reconhece o erro do banco e devolve o motivo com a primeira letra maiúscula', () => {
    expect(rateLimitMessage('Limite de envio: você mandou mensagens demais em pouco tempo. Aguarde um minuto e tente de novo.')).toBe(
      'Você mandou mensagens demais em pouco tempo. Aguarde um minuto e tente de novo.'
    );
  });

  it('reconhece mesmo com texto antes (erro embrulhado)', () => {
    expect(rateLimitMessage('error: Limite de envio: você já fez essa denúncia nas últimas 24 horas.')).toBe('Você já fez essa denúncia nas últimas 24 horas.');
  });

  it('outros erros não são de limite', () => {
    expect(rateLimitMessage('new row violates row-level security policy')).toBeNull();
    expect(rateLimitMessage('Failed to fetch')).toBeNull();
  });

  it('vazio, nulo ou só o prefixo: null', () => {
    expect(rateLimitMessage(null)).toBeNull();
    expect(rateLimitMessage(undefined)).toBeNull();
    expect(rateLimitMessage('')).toBeNull();
    expect(rateLimitMessage('Limite de envio:')).toBeNull();
  });
});
