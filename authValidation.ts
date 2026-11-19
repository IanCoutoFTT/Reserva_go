// Regras puras das telas de acesso (sem React, sem Supabase) - testadas em
// lib/__tests__/authValidation.test.ts.

/**
 * Quantidade de dígitos do código enviado por e-mail. Precisa bater com
 * Authentication > Providers > Email > "Email OTP Length" no painel do Supabase.
 */
export const OTP_LENGTH = 6;

/** Segundos de espera entre reenvios (o Supabase recusa reenvio antes de ~60 s). */
export const RESEND_COOLDOWN_SECONDS = 60;

export const PASSWORD_MIN_LENGTH = 8;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizeEmail(email));
}

/** "carlos@dominio.com.br" -> "c*****@dominio.com.br" (para mostrar para onde o código foi). */
export function maskEmail(email: string): string {
  const clean = normalizeEmail(email);
  const at = clean.indexOf('@');
  if (at <= 0) return clean;
  const local = clean.slice(0, at);
  const domain = clean.slice(at);
  return `${local.slice(0, 1)}${'*'.repeat(Math.max(local.length - 1, 3))}${domain}`;
}

/** Lista o que falta para a senha ser aceita (vazia = senha ok). */
export function passwordIssues(password: string): string[] {
  const issues: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) issues.push(`Pelo menos ${PASSWORD_MIN_LENGTH} caracteres`);
  if (!/[A-Za-zÀ-ÿ]/.test(password)) issues.push('Pelo menos uma letra');
  if (!/\d/.test(password)) issues.push('Pelo menos um número');
  return issues;
}

/** Mantém só dígitos e corta no tamanho do código (aceita colar "123 456"). */
export function sanitizeOtp(value: string, length: number = OTP_LENGTH): string {
  return value.replace(/\D/g, '').slice(0, length);
}

/** 75 -> "01:15" */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

type AuthErrorLike = { code?: string | null; message?: string | null; status?: number | null } | string | null | undefined;

/**
 * Traduz os erros do Supabase Auth para mensagens em português que a pessoa
 * entende. Usa o `code` quando existe (SDK v2) e cai para o texto em inglês
 * em versões/erros que não trazem código.
 */
export function translateAuthError(error: AuthErrorLike): string {
  if (!error) return 'Algo deu errado. Tente novamente.';
  const code = typeof error === 'string' ? '' : error.code ?? '';
  const message = (typeof error === 'string' ? error : error.message ?? '').toLowerCase();

  if (code === 'invalid_credentials' || message.includes('invalid login credentials')) {
    return 'E-mail ou senha incorretos.';
  }
  if (code === 'email_not_confirmed' || message.includes('email not confirmed')) {
    return 'Você ainda não confirmou seu e-mail. Enviamos um código para confirmar.';
  }
  if (code === 'user_already_exists' || code === 'email_exists' || message.includes('already registered')) {
    return 'Já existe uma conta com este e-mail. Entre ou recupere sua senha.';
  }
  if (code === 'otp_expired' || message.includes('token has expired') || message.includes('invalid otp')) {
    return 'Código inválido ou expirado. Confira os dígitos ou peça um novo código.';
  }
  if (code === 'same_password' || message.includes('should be different')) {
    return 'A nova senha precisa ser diferente da senha atual.';
  }
  if (code === 'weak_password' || message.includes('password should be')) {
    return 'Senha fraca. Use pelo menos 8 caracteres, com letras e números.';
  }
  if (
    code === 'over_email_send_rate_limit' ||
    code === 'over_request_rate_limit' ||
    message.includes('rate limit') ||
    message.includes('for security purposes')
  ) {
    return 'Muitas tentativas em pouco tempo. Aguarde um minuto e tente de novo.';
  }
  if (code === 'email_provider_disabled' || code === 'signup_disabled' || message.includes('signups not allowed')) {
    return 'O acesso por e-mail está desativado no momento. Use "Entrar com Google".';
  }
  if (code === 'email_address_invalid' || (message.includes('email address') && message.includes('invalid'))) {
    return 'Este e-mail não é válido.';
  }
  if (code === 'email_address_not_authorized') {
    return 'Não foi possível enviar e-mail para este endereço. Fale com a equipe do ReservaGO.';
  }
  if (message.includes('network request failed') || message.includes('failed to fetch')) {
    return 'Sem conexão com o servidor. Verifique sua internet e tente de novo.';
  }
  return 'Algo deu errado. Tente novamente.';
}
