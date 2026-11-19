import { supabase } from '../lib/supabase';
import { normalizeEmail, translateAuthError } from '../lib/authValidation';
import { ServiceResult } from './types';

// Acesso por e-mail e senha (Supabase Auth). O login com Google continua em
// app/login.tsx (signInWithOAuth + PKCE), sem mudança.
//
// Nenhuma função aqui mexe em `profiles`: a trigger handle_new_user cria o
// perfil quando a conta nasce, e o AuthContext carrega o perfil quando o
// Supabase avisa SIGNED_IN / USER_UPDATED (onAuthStateChange).

/** Por que o código foi enviado - decide qual verificação usar. */
export type CodePurpose = 'recovery' | 'signup';

export async function signInWithPassword(email: string, password: string): Promise<ServiceResult<true> & { needsConfirmation?: boolean }> {
  const { error } = await supabase.auth.signInWithPassword({ email: normalizeEmail(email), password });
  if (error) {
    return { data: null, error: translateAuthError(error), needsConfirmation: error.code === 'email_not_confirmed' };
  }
  return { data: true, error: null };
}

/**
 * Cria a conta. `needsCode` = true quando o projeto exige confirmação de
 * e-mail (o padrão do Supabase): aí a pessoa recebe o código e confirma em
 * app/verify-code.tsx. Com confirmação desligada, a sessão já vem pronta.
 */
export async function signUpWithPassword(
  name: string,
  email: string,
  password: string
): Promise<ServiceResult<{ needsCode: boolean }>> {
  const { data, error } = await supabase.auth.signUp({
    email: normalizeEmail(email),
    password,
    // full_name é lido pela trigger handle_new_user para preencher profiles.name.
    options: { data: { full_name: name.trim() } },
  });
  if (error) return { data: null, error: translateAuthError(error) };

  // Para não revelar quais e-mails existem, o Supabase responde "sucesso" a um
  // cadastro repetido, mas com identities vazio e sem enviar e-mail.
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return { data: null, error: translateAuthError({ code: 'user_already_exists' }) };
  }
  return { data: { needsCode: !data.session }, error: null };
}

/**
 * Envia o código de recuperação. Responde sucesso mesmo se o e-mail não tiver
 * conta (comportamento do próprio Supabase) - a tela não confirma nem nega.
 */
export async function requestPasswordReset(email: string): Promise<ServiceResult<true>> {
  const { error } = await supabase.auth.resetPasswordForEmail(normalizeEmail(email));
  if (error) return { data: null, error: translateAuthError(error) };
  return { data: true, error: null };
}

/** Reenvia o código conforme o motivo (recuperação ou confirmação de cadastro). */
export async function resendCode(email: string, purpose: CodePurpose): Promise<ServiceResult<true>> {
  if (purpose === 'recovery') return requestPasswordReset(email);
  const { error } = await supabase.auth.resend({ type: 'signup', email: normalizeEmail(email) });
  if (error) return { data: null, error: translateAuthError(error) };
  return { data: true, error: null };
}

/**
 * Confere o código. Se estiver certo, o Supabase já abre a sessão:
 * - recovery: evento PASSWORD_RECOVERY (o AuthContext ainda não carrega o
 *   perfil - a pessoa precisa definir a nova senha antes);
 * - signup: evento SIGNED_IN (perfil carregado normalmente).
 */
export async function verifyCode(email: string, code: string, purpose: CodePurpose): Promise<ServiceResult<true>> {
  const { data, error } = await supabase.auth.verifyOtp({
    email: normalizeEmail(email),
    token: code,
    type: purpose === 'recovery' ? 'recovery' : 'email',
  });
  if (error) return { data: null, error: translateAuthError(error) };
  if (!data?.session) return { data: null, error: translateAuthError({ code: 'otp_expired' }) };
  return { data: true, error: null };
}

/** Grava a nova senha (precisa da sessão aberta por verifyCode('recovery')). */
export async function updatePassword(password: string): Promise<ServiceResult<true>> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { data: null, error: translateAuthError(error) };
  return { data: true, error: null };
}

/** Desiste da recuperação no meio: encerra a sessão temporária. */
export async function cancelRecovery(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch {
    // sair é local; rede ruim não pode prender a pessoa aqui
  }
}
