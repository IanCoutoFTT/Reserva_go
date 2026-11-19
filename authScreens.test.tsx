// Testes das telas de acesso "Refúgio" (login, criar conta, recuperar senha,
// código e nova senha). Ficam fora de app/ porque o expo-router trataria
// qualquer arquivo dentro de app/ como rota.
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
  canDismiss: jest.fn(() => true),
  dismissAll: jest.fn(),
};
let mockParams: Record<string, string> = {};
const mockBeforeRemove: { cb?: () => void } = {};
const mockNavigation = {
  addListener: jest.fn((event: string, cb: () => void) => {
    if (event === 'beforeRemove') mockBeforeRemove.cb = cb;
    return jest.fn();
  }),
};
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
  useNavigation: () => mockNavigation,
}));
let mockIsFocused = true;
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => mockIsFocused }));

const mockAuth: { user: any; session: any; login: jest.Mock } = { user: null, session: null, login: jest.fn() };
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => mockAuth,
  KEEP_SIGNED_IN_KEY: '@reservago:keepSignedIn',
}));

jest.mock('../../services/authService', () => ({
  signInWithPassword: jest.fn(),
  signUpWithPassword: jest.fn(),
  requestPasswordReset: jest.fn(),
  resendCode: jest.fn(),
  verifyCode: jest.fn(),
  updatePassword: jest.fn(),
  cancelRecovery: jest.fn(),
}));

// O cliente real do Supabase não sobe no Node; o login só usa o OAuth do Google.
jest.mock('../../lib/supabase', () => ({
  supabase: { auth: { signInWithOAuth: jest.fn(), exchangeCodeForSession: jest.fn() } },
}));
jest.mock('expo-linking', () => ({ createURL: jest.fn(() => 'reservago://oauth-callback') }));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
// Contagem de reenvio curta (1 s) para o teste não precisar de timers falsos.
jest.mock('../../lib/authValidation', () => ({
  ...jest.requireActual('../../lib/authValidation'),
  RESEND_COOLDOWN_SECONDS: 1,
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import ForgotPasswordScreen from '../../app/forgot-password';
import LoginScreen from '../../app/login';
import RegisterScreen from '../../app/register';
import ResetPasswordScreen from '../../app/reset-password';
import VerifyCodeScreen from '../../app/verify-code';
import * as authService from '../../services/authService';

const svc = authService as unknown as Record<string, jest.Mock>;

beforeEach(async () => {
  jest.clearAllMocks();
  mockParams = {};
  mockIsFocused = true;
  mockAuth.user = null;
  mockAuth.session = null;
  mockRouter.canGoBack.mockReturnValue(true);
  mockRouter.canDismiss.mockReturnValue(true);
  mockBeforeRemove.cb = undefined;
  await AsyncStorage.clear();
});

// ---------------------------------------------------------------- LOGIN
describe('LoginScreen', () => {
  it('mostra o layout novo com Google, criar conta e esqueci a senha', () => {
    render(<LoginScreen />);
    expect(screen.getByText('Bem-vindo de volta!')).toBeTruthy();
    expect(screen.getByText('Entrar com Google')).toBeTruthy();
    expect(screen.getByText('Criar uma conta')).toBeTruthy();
    expect(screen.getByText('Esqueceu sua senha?')).toBeTruthy();
  });

  it('não chama o login com e-mail inválido', async () => {
    render(<LoginScreen />);
    fireEvent.changeText(screen.getByTestId('login-email'), 'joao@');
    fireEvent.changeText(screen.getByTestId('login-password'), 'abc12345');
    fireEvent.press(screen.getByTestId('login-submit'));
    expect(await screen.findByText('Digite um e-mail válido.')).toBeTruthy();
    expect(mockAuth.login).not.toHaveBeenCalled();
  });

  it('chama login, grava "manter conectado" e mostra o erro traduzido', async () => {
    mockAuth.login.mockResolvedValue({ error: 'E-mail ou senha incorretos.' });
    render(<LoginScreen />);
    fireEvent.changeText(screen.getByTestId('login-email'), 'ana@email.com');
    fireEvent.changeText(screen.getByTestId('login-password'), 'errada123');
    fireEvent.press(screen.getByTestId('login-remember')); // desmarca
    fireEvent.press(screen.getByTestId('login-submit'));

    expect(await screen.findByText('E-mail ou senha incorretos.')).toBeTruthy();
    expect(mockAuth.login).toHaveBeenCalledWith('ana@email.com', 'errada123');
    expect(await AsyncStorage.getItem('@reservago:keepSignedIn')).toBe('false');
  });

  it('conta sem e-mail confirmado: reenvia o código e abre a verificação', async () => {
    mockAuth.login.mockResolvedValue({ error: 'x', needsConfirmation: true });
    svc.resendCode.mockResolvedValue({ data: true, error: null });
    render(<LoginScreen />);
    fireEvent.changeText(screen.getByTestId('login-email'), 'Ana@Email.com');
    fireEvent.changeText(screen.getByTestId('login-password'), 'cabana2026');
    fireEvent.press(screen.getByTestId('login-submit'));

    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/verify-code',
        params: { email: 'ana@email.com', purpose: 'signup' },
      })
    );
    expect(svc.resendCode).toHaveBeenCalledWith('Ana@Email.com', 'signup');
  });

  it('"Esqueceu sua senha?" leva o e-mail já digitado', () => {
    render(<LoginScreen />);
    fireEvent.changeText(screen.getByTestId('login-email'), 'Ana@Email.com ');
    fireEvent.press(screen.getByText('Esqueceu sua senha?'));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/forgot-password', params: { email: 'ana@email.com' } });
  });

  it('com usuário logado e tela em foco, volta para onde estava', () => {
    mockAuth.user = { id: '1' };
    render(<LoginScreen />);
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('com usuário logado mas tela fora de foco (fluxo de cadastro/recuperação), não navega', () => {
    mockAuth.user = { id: '1' };
    mockIsFocused = false;
    render(<LoginScreen />);
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------- RECUPERAR SENHA
describe('ForgotPasswordScreen', () => {
  it('valida o e-mail antes de enviar', async () => {
    render(<ForgotPasswordScreen />);
    fireEvent.press(screen.getByTestId('forgot-submit'));
    expect(await screen.findByText('Digite o e-mail da sua conta.')).toBeTruthy();
    expect(svc.requestPasswordReset).not.toHaveBeenCalled();
  });

  it('usa o e-mail vindo do login, envia o código e vai para o passo 2', async () => {
    mockParams = { email: 'ana@email.com' };
    svc.requestPasswordReset.mockResolvedValue({ data: true, error: null });
    render(<ForgotPasswordScreen />);
    expect(screen.getByText('Passo 1 de 3')).toBeTruthy();
    fireEvent.press(screen.getByTestId('forgot-submit'));
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/verify-code',
        params: { email: 'ana@email.com', purpose: 'recovery' },
      })
    );
    expect(svc.requestPasswordReset).toHaveBeenCalledWith('ana@email.com');
  });

  it('mostra o erro do envio', async () => {
    svc.requestPasswordReset.mockResolvedValue({ data: null, error: 'Muitas tentativas em pouco tempo.' });
    render(<ForgotPasswordScreen />);
    fireEvent.changeText(screen.getByTestId('forgot-email'), 'ana@email.com');
    fireEvent.press(screen.getByTestId('forgot-submit'));
    expect(await screen.findByText('Muitas tentativas em pouco tempo.')).toBeTruthy();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------- CÓDIGO
describe('VerifyCodeScreen', () => {
  it('mostra o e-mail mascarado e confere sozinho ao completar 6 dígitos (recuperação)', async () => {
    mockParams = { email: 'carlos@dominio.com.br', purpose: 'recovery' };
    svc.verifyCode.mockResolvedValue({ data: true, error: null });
    render(<VerifyCodeScreen />);
    expect(screen.getByTestId('verify-recipient').props.children).toBe('c*****@dominio.com.br');
    expect(screen.getByText('Passo 2 de 3')).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('otp-input'), '12 34 56');
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/reset-password'));
    expect(svc.verifyCode).toHaveBeenCalledTimes(1);
    expect(svc.verifyCode).toHaveBeenCalledWith('carlos@dominio.com.br', '123456', 'recovery');
  });

  it('no cadastro, fecha o fluxo e vai para a escolha de perfil', async () => {
    mockParams = { email: 'ana@email.com', purpose: 'signup' };
    svc.verifyCode.mockResolvedValue({ data: true, error: null });
    render(<VerifyCodeScreen />);
    fireEvent.changeText(screen.getByTestId('otp-input'), '654321');
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/select-role'));
    expect(mockRouter.dismissAll).toHaveBeenCalled();
    expect(svc.verifyCode).toHaveBeenCalledWith('ana@email.com', '654321', 'signup');
  });

  it('código errado: mostra o erro e limpa as caixas', async () => {
    mockParams = { email: 'ana@email.com', purpose: 'recovery' };
    svc.verifyCode.mockResolvedValue({ data: null, error: 'Código inválido ou expirado.' });
    render(<VerifyCodeScreen />);
    fireEvent.changeText(screen.getByTestId('otp-input'), '000000');
    expect(await screen.findByText('Código inválido ou expirado.')).toBeTruthy();
    expect(screen.getByTestId('otp-input').props.value).toBe('');
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('reenviar só aparece depois da contagem e reinicia a contagem', async () => {
    mockParams = { email: 'ana@email.com', purpose: 'recovery' };
    svc.resendCode.mockResolvedValue({ data: true, error: null });
    render(<VerifyCodeScreen />);
    expect(screen.getByTestId('verify-cooldown')).toBeTruthy();
    expect(screen.queryByTestId('verify-resend')).toBeNull();

    const resend = await screen.findByTestId('verify-resend', {}, { timeout: 3000 });
    fireEvent.press(resend);
    expect(await screen.findByTestId('verify-info')).toBeTruthy();
    expect(svc.resendCode).toHaveBeenCalledWith('ana@email.com', 'recovery');
    expect(screen.getByTestId('verify-cooldown')).toBeTruthy();
  });
});

// ---------------------------------------------------------------- NOVA SENHA
describe('ResetPasswordScreen', () => {
  it('sem sessão de recuperação, pede um novo código', () => {
    render(<ResetPasswordScreen />);
    expect(screen.getByTestId('reset-no-session')).toBeTruthy();
    fireEvent.press(screen.getByText('Pedir novo código'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/forgot-password');
  });

  it('recusa senha fraca e senhas diferentes', async () => {
    mockAuth.session = { access_token: 't' };
    render(<ResetPasswordScreen />);
    fireEvent.changeText(screen.getByTestId('reset-password'), 'abc');
    fireEvent.press(screen.getByTestId('reset-submit'));
    expect(await screen.findByTestId('reset-error')).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('reset-password'), 'cabana2026');
    fireEvent.changeText(screen.getByTestId('reset-confirm'), 'cabana2025');
    fireEvent.press(screen.getByTestId('reset-submit'));
    expect((await screen.findByTestId('reset-error'))).toBeTruthy();
    expect(svc.updatePassword).not.toHaveBeenCalled();
  });

  it('grava a senha e entra no app, sem encerrar a sessão ao sair da tela', async () => {
    mockAuth.session = { access_token: 't' };
    svc.updatePassword.mockResolvedValue({ data: true, error: null });
    render(<ResetPasswordScreen />);
    fireEvent.changeText(screen.getByTestId('reset-password'), 'cabana2026');
    fireEvent.changeText(screen.getByTestId('reset-confirm'), 'cabana2026');
    fireEvent.press(screen.getByTestId('reset-submit'));

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)'));
    expect(svc.updatePassword).toHaveBeenCalledWith('cabana2026');
    expect(mockRouter.dismissAll).toHaveBeenCalled();
    mockBeforeRemove.cb?.();
    expect(svc.cancelRecovery).not.toHaveBeenCalled();
  });

  it('saindo sem salvar, encerra a sessão temporária', () => {
    mockAuth.session = { access_token: 't' };
    render(<ResetPasswordScreen />);
    mockBeforeRemove.cb?.();
    expect(svc.cancelRecovery).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------- CRIAR CONTA
describe('RegisterScreen', () => {
  it('valida nome, e-mail e senha', async () => {
    render(<RegisterScreen />);
    fireEvent.press(screen.getByTestId('register-submit'));
    expect(await screen.findByText('Digite seu nome.')).toBeTruthy();
    expect(screen.getByText('Digite um e-mail válido.')).toBeTruthy();
    expect(svc.signUpWithPassword).not.toHaveBeenCalled();
  });

  it('cria a conta e vai para a confirmação por código', async () => {
    svc.signUpWithPassword.mockResolvedValue({ data: { needsCode: true }, error: null });
    render(<RegisterScreen />);
    fireEvent.changeText(screen.getByTestId('register-name'), 'Ana Souza');
    fireEvent.changeText(screen.getByTestId('register-email'), 'Ana@Email.com');
    fireEvent.changeText(screen.getByTestId('register-password'), 'cabana2026');
    fireEvent.press(screen.getByTestId('register-submit'));

    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/verify-code',
        params: { email: 'ana@email.com', purpose: 'signup' },
      })
    );
    expect(svc.signUpWithPassword).toHaveBeenCalledWith('Ana Souza', 'Ana@Email.com', 'cabana2026');
  });

  it('sem confirmação de e-mail no projeto, segue direto para a escolha de perfil', async () => {
    svc.signUpWithPassword.mockResolvedValue({ data: { needsCode: false }, error: null });
    render(<RegisterScreen />);
    fireEvent.changeText(screen.getByTestId('register-name'), 'Ana');
    fireEvent.changeText(screen.getByTestId('register-email'), 'ana@email.com');
    fireEvent.changeText(screen.getByTestId('register-password'), 'cabana2026');
    fireEvent.press(screen.getByTestId('register-submit'));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/select-role'));
  });

  it('mostra erro de e-mail já cadastrado', async () => {
    svc.signUpWithPassword.mockResolvedValue({ data: null, error: 'Já existe uma conta com este e-mail.' });
    render(<RegisterScreen />);
    fireEvent.changeText(screen.getByTestId('register-name'), 'Ana');
    fireEvent.changeText(screen.getByTestId('register-email'), 'ana@email.com');
    fireEvent.changeText(screen.getByTestId('register-password'), 'cabana2026');
    fireEvent.press(screen.getByTestId('register-submit'));
    expect(await screen.findByText('Já existe uma conta com este e-mail.')).toBeTruthy();
  });
});
