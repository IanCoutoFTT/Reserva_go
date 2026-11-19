import {
  OTP_LENGTH,
  formatCountdown,
  isValidEmail,
  maskEmail,
  normalizeEmail,
  passwordIssues,
  sanitizeOtp,
  translateAuthError,
} from '../authValidation';

describe('authValidation', () => {
  it('normaliza e valida e-mail', () => {
    expect(normalizeEmail('  Joao@Email.COM ')).toBe('joao@email.com');
    expect(isValidEmail('joao@email.com')).toBe(true);
    expect(isValidEmail(' joao@email.com.br ')).toBe(true);
    expect(isValidEmail('joao@email')).toBe(false);
    expect(isValidEmail('joao email.com')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });

  it('mascara o e-mail mantendo a 1ª letra e o domínio', () => {
    expect(maskEmail('carlos@dominio.com.br')).toBe('c*****@dominio.com.br');
    expect(maskEmail('ab@x.com')).toBe('a***@x.com');
    expect(maskEmail('semarroba')).toBe('semarroba');
  });

  it('lista o que falta na senha', () => {
    expect(passwordIssues('abc')).toEqual(['Pelo menos 8 caracteres', 'Pelo menos um número']);
    expect(passwordIssues('12345678')).toEqual(['Pelo menos uma letra']);
    expect(passwordIssues('cabana2026')).toEqual([]);
  });

  it('limpa o código colado e corta no tamanho', () => {
    expect(OTP_LENGTH).toBe(6);
    expect(sanitizeOtp('123 456')).toBe('123456');
    expect(sanitizeOtp('12a34b5678')).toBe('123456');
    expect(sanitizeOtp('12-34', 6)).toBe('1234');
  });

  it('formata a contagem regressiva', () => {
    expect(formatCountdown(60)).toBe('01:00');
    expect(formatCountdown(75)).toBe('01:15');
    expect(formatCountdown(0)).toBe('00:00');
    expect(formatCountdown(-3)).toBe('00:00');
  });

  describe('translateAuthError', () => {
    it.each([
      [{ code: 'invalid_credentials', message: 'Invalid login credentials' }, 'E-mail ou senha incorretos.'],
      [{ message: 'Invalid login credentials' }, 'E-mail ou senha incorretos.'],
      [{ code: 'email_not_confirmed' }, 'Você ainda não confirmou seu e-mail. Enviamos um código para confirmar.'],
      [{ code: 'user_already_exists' }, 'Já existe uma conta com este e-mail. Entre ou recupere sua senha.'],
      [{ code: 'otp_expired', message: 'Token has expired or is invalid' }, 'Código inválido ou expirado. Confira os dígitos ou peça um novo código.'],
      [{ code: 'same_password' }, 'A nova senha precisa ser diferente da senha atual.'],
      [{ code: 'weak_password' }, 'Senha fraca. Use pelo menos 8 caracteres, com letras e números.'],
      [{ code: 'over_email_send_rate_limit' }, 'Muitas tentativas em pouco tempo. Aguarde um minuto e tente de novo.'],
      [{ message: 'For security purposes, you can only request this after 42 seconds.' }, 'Muitas tentativas em pouco tempo. Aguarde um minuto e tente de novo.'],
      [{ code: 'email_provider_disabled' }, 'O acesso por e-mail está desativado no momento. Use "Entrar com Google".'],
      [{ message: 'Network request failed' }, 'Sem conexão com o servidor. Verifique sua internet e tente de novo.'],
      ['qualquer coisa', 'Algo deu errado. Tente novamente.'],
      [null, 'Algo deu errado. Tente novamente.'],
    ])('%j -> mensagem em português', (input, expected) => {
      expect(translateAuthError(input as any)).toBe(expected);
    });
  });
});
