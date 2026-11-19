jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      onAuthStateChange: jest.fn(),
      signOut: jest.fn(),
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      resetPasswordForEmail: jest.fn(),
      resend: jest.fn(),
      verifyOtp: jest.fn(),
      updateUser: jest.fn(),
    },
  })),
}));

import { supabase } from '../../lib/supabase';
import {
  cancelRecovery,
  requestPasswordReset,
  resendCode,
  signInWithPassword,
  signUpWithPassword,
  updatePassword,
  verifyCode,
} from '../authService';

const auth = supabase.auth as unknown as Record<string, jest.Mock>;

beforeEach(() => jest.clearAllMocks());

describe('authService', () => {
  describe('signInWithPassword', () => {
    it('normaliza o e-mail e devolve sucesso', async () => {
      auth.signInWithPassword.mockResolvedValue({ data: { session: {} }, error: null });
      const r = await signInWithPassword('  Ana@Email.com ', 'segredo1');
      expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'ana@email.com', password: 'segredo1' });
      expect(r).toEqual({ data: true, error: null });
    });

    it('traduz credenciais inválidas', async () => {
      auth.signInWithPassword.mockResolvedValue({ data: {}, error: { code: 'invalid_credentials', message: 'Invalid login credentials' } });
      const r = await signInWithPassword('ana@email.com', 'x');
      expect(r.error).toBe('E-mail ou senha incorretos.');
      expect(r.needsConfirmation).toBe(false);
    });

    it('sinaliza e-mail não confirmado', async () => {
      auth.signInWithPassword.mockResolvedValue({ data: {}, error: { code: 'email_not_confirmed', message: 'Email not confirmed' } });
      const r = await signInWithPassword('ana@email.com', 'x');
      expect(r.needsConfirmation).toBe(true);
    });
  });

  describe('signUpWithPassword', () => {
    it('manda full_name para a trigger handle_new_user e pede código quando não há sessão', async () => {
      auth.signUp.mockResolvedValue({ data: { user: { identities: [{ id: '1' }] }, session: null }, error: null });
      const r = await signUpWithPassword(' Ana Souza ', 'Ana@Email.com', 'cabana2026');
      expect(auth.signUp).toHaveBeenCalledWith({
        email: 'ana@email.com',
        password: 'cabana2026',
        options: { data: { full_name: 'Ana Souza' } },
      });
      expect(r).toEqual({ data: { needsCode: true }, error: null });
    });

    it('não pede código quando o projeto não exige confirmação (sessão já vem)', async () => {
      auth.signUp.mockResolvedValue({ data: { user: { identities: [{ id: '1' }] }, session: { access_token: 't' } }, error: null });
      const r = await signUpWithPassword('Ana', 'ana@email.com', 'cabana2026');
      expect(r.data).toEqual({ needsCode: false });
    });

    it('detecta e-mail já cadastrado (identities vazio)', async () => {
      auth.signUp.mockResolvedValue({ data: { user: { identities: [] }, session: null }, error: null });
      const r = await signUpWithPassword('Ana', 'ana@email.com', 'cabana2026');
      expect(r.data).toBeNull();
      expect(r.error).toMatch(/Já existe uma conta/);
    });
  });

  it('requestPasswordReset envia o e-mail normalizado', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    const r = await requestPasswordReset(' Ana@Email.com');
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('ana@email.com');
    expect(r.error).toBeNull();
  });

  it('requestPasswordReset traduz limite de envio', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: { code: 'over_email_send_rate_limit', message: 'rate limit' } });
    const r = await requestPasswordReset('ana@email.com');
    expect(r.error).toMatch(/Aguarde um minuto/);
  });

  it('resendCode usa resetPasswordForEmail na recuperação e resend(signup) no cadastro', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    auth.resend.mockResolvedValue({ data: {}, error: null });
    await resendCode('ana@email.com', 'recovery');
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('ana@email.com');
    await resendCode('ana@email.com', 'signup');
    expect(auth.resend).toHaveBeenCalledWith({ type: 'signup', email: 'ana@email.com' });
  });

  describe('verifyCode', () => {
    it('usa type "recovery" na recuperação', async () => {
      auth.verifyOtp.mockResolvedValue({ data: { session: { access_token: 't' } }, error: null });
      const r = await verifyCode('Ana@email.com', '123456', 'recovery');
      expect(auth.verifyOtp).toHaveBeenCalledWith({ email: 'ana@email.com', token: '123456', type: 'recovery' });
      expect(r.data).toBe(true);
    });

    it('usa type "email" na confirmação de cadastro', async () => {
      auth.verifyOtp.mockResolvedValue({ data: { session: { access_token: 't' } }, error: null });
      await verifyCode('ana@email.com', '123456', 'signup');
      expect(auth.verifyOtp).toHaveBeenCalledWith({ email: 'ana@email.com', token: '123456', type: 'email' });
    });

    it('código errado/expirado vira mensagem amigável', async () => {
      auth.verifyOtp.mockResolvedValue({ data: {}, error: { code: 'otp_expired', message: 'Token has expired or is invalid' } });
      const r = await verifyCode('ana@email.com', '000000', 'recovery');
      expect(r.error).toMatch(/Código inválido ou expirado/);
    });

    it('sem sessão na resposta conta como falha', async () => {
      auth.verifyOtp.mockResolvedValue({ data: { session: null }, error: null });
      const r = await verifyCode('ana@email.com', '123456', 'recovery');
      expect(r.data).toBeNull();
      expect(r.error).toMatch(/Código inválido/);
    });
  });

  it('updatePassword grava a senha e traduz senha repetida', async () => {
    auth.updateUser.mockResolvedValueOnce({ data: {}, error: null });
    expect((await updatePassword('nova2026')).data).toBe(true);
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'nova2026' });

    auth.updateUser.mockResolvedValueOnce({ data: {}, error: { code: 'same_password', message: 'New password should be different' } });
    expect((await updatePassword('nova2026')).error).toMatch(/diferente da senha atual/);
  });

  it('cancelRecovery encerra a sessão e não lança se a rede falhar', async () => {
    auth.signOut.mockRejectedValueOnce(new Error('offline'));
    await expect(cancelRecovery()).resolves.toBeUndefined();
    expect(auth.signOut).toHaveBeenCalled();
  });
});
