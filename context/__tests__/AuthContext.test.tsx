import React from 'react';
import { Alert } from 'react-native';
import { act, renderHook, waitFor } from '@testing-library/react-native';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// AuthContext importa `supabase` de lib/supabase.ts, que chama createClient()
// de @supabase/supabase-js no carregamento do módulo. A fábrica do mock não
// referencia nenhuma variável externa (só coisas "mock*" seriam permitidas
// pelo babel-plugin-jest-hoist, e mesmo assim a ordem de execução entre
// hoisting de import e de const é frágil) — em vez disso, pegamos as
// referências dos jest.fn() DEPOIS, lendo de volta `supabase.auth.*`.
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      onAuthStateChange: jest.fn(),
      signOut: jest.fn(),
    },
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    })),
  })),
}));

// deleteAccount (AuthContext) delega o soft delete pra profileService - aqui
// testamos só se o Context chama (ou não chama, pro usuário estático) essa
// função corretamente, não a query em si (isso já é coberto em
// services/__tests__/profileService.test.ts).
jest.mock('../../services/profileService', () => ({
  updateRole: jest.fn(),
  deleteAccount: jest.fn(),
}));

jest.spyOn(Alert, 'alert').mockImplementation(() => {});

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';
import { deleteAccount as mockDeleteAccountService } from '../../services/profileService';
import { AuthProvider, KEEP_SIGNED_IN_KEY, useAuth } from '../AuthContext';

const mockOnAuthStateChange = supabase.auth.onAuthStateChange as jest.Mock;
const mockSignOut = supabase.auth.signOut as jest.Mock;
const mockDeleteAccount = mockDeleteAccountService as jest.Mock;

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  // Simula o comportamento real do Supabase: a primeira coisa que o listener
  // recebe é o estado atual da sessão - aqui, nenhuma sessão ativa.
  mockOnAuthStateChange.mockImplementation((callback: (event: string, session: any) => void) => {
    callback('INITIAL_SESSION', null);
    return { data: { subscription: { unsubscribe: jest.fn() } } };
  });
  mockSignOut.mockResolvedValue({ error: null });
  mockDeleteAccount.mockResolvedValue({ data: {}, error: null });
});

// Simula o usuário tocando no botão "Excluir" do Alert.alert de confirmação
// (o app não chama isso sozinho - é o próprio Alert nativo do SO).
function confirmDeleteAccountAlert() {
  (Alert.alert as jest.Mock).mockImplementationOnce((_title, _message, buttons) => {
    buttons?.find((b: { text?: string }) => b.text === 'Excluir')?.onPress?.();
  });
}

describe('AuthContext', () => {
  it('estado inicial: sem sessão do Supabase, user e session começam null e loading termina false', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.user).toBeNull();
    expect(result.current.session).toBeNull();
    expect(mockOnAuthStateChange).toHaveBeenCalledTimes(1);
  });

  it('login com credenciais estáticas válidas identifica a role correta do usuário', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.login('hospede@reservago.com', '1234');
    });

    expect(result.current.user).not.toBeNull();
    expect(result.current.user?.role).toBe('hospede');
    expect(result.current.user?.email).toBe('hospede@reservago.com');
  });

  it('login com credenciais inválidas não autentica e mostra alerta', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.login('hospede@reservago.com', 'senha-errada');
    });

    expect(result.current.user).toBeNull();
    expect(Alert.alert).toHaveBeenCalled();
  });

  it('logout chama supabase.auth.signOut() e limpa o user do estado', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.login('anfitriao@reservago.com', '1234');
    });
    expect(result.current.user).not.toBeNull();

    await act(async () => {
      await result.current.logout();
    });

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(result.current.user).toBeNull();
  });

  it('logout limpa o user mesmo se supabase.auth.signOut() falhar (não pode travar o usuário logado)', async () => {
    mockSignOut.mockRejectedValueOnce(new Error('rede indisponível'));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.login('anfitriao@reservago.com', '1234');
    });
    expect(result.current.user).not.toBeNull();

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.user).toBeNull();
  });

  it('deleteAccount pede confirmação e, pra usuário estático de dev, só desconecta local (sem chamar profileService)', async () => {
    confirmDeleteAccountAlert();
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.login('anfitriao@reservago.com', '1234');
    });

    await act(async () => {
      await result.current.deleteAccount();
    });

    expect(Alert.alert).toHaveBeenCalled();
    expect(mockDeleteAccount).not.toHaveBeenCalled();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(result.current.user).toBeNull();
  });

  it('deleteAccount, pra usuário real (sessão do Supabase), chama profileService.deleteAccount com o id certo e limpa o estado', async () => {
    confirmDeleteAccountAlert();
    mockOnAuthStateChange.mockImplementation((callback: (event: string, session: any) => void) => {
      callback('SIGNED_IN', {
        user: { id: 'real-user-uuid', email: 'junior@gmail.com', user_metadata: {} },
      });
      return { data: { subscription: { unsubscribe: jest.fn() } } };
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user?.id).toBe('real-user-uuid');

    await act(async () => {
      await result.current.deleteAccount();
    });

    expect(mockDeleteAccount).toHaveBeenCalledWith('real-user-uuid');
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(result.current.user).toBeNull();
  });

  it('deleteAccount não desconecta se profileService.deleteAccount devolver erro', async () => {
    confirmDeleteAccountAlert();
    mockDeleteAccount.mockResolvedValueOnce({ data: null, error: 'falha ao excluir' });
    mockOnAuthStateChange.mockImplementation((callback: (event: string, session: any) => void) => {
      callback('SIGNED_IN', {
        user: { id: 'real-user-uuid', email: 'junior@gmail.com', user_metadata: {} },
      });
      return { data: { subscription: { unsubscribe: jest.fn() } } };
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deleteAccount();
    });

    expect(mockSignOut).not.toHaveBeenCalled();
    expect(result.current.user).not.toBeNull();
  });

  it('sessão restaurada no boot (INITIAL_SESSION) é descartada se o usuário escolheu não salvar a conta no dispositivo', async () => {
    await AsyncStorage.setItem(KEEP_SIGNED_IN_KEY, 'false');
    mockOnAuthStateChange.mockImplementation((callback: (event: string, session: any) => void) => {
      callback('INITIAL_SESSION', {
        user: { id: 'real-user-uuid', email: 'junior@gmail.com', user_metadata: {} },
      });
      return { data: { subscription: { unsubscribe: jest.fn() } } };
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(result.current.user).toBeNull();
    expect(result.current.session).toBeNull();
  });

  it('sessão restaurada no boot (INITIAL_SESSION) carrega o perfil normalmente quando o usuário escolheu salvar (ou nunca respondeu)', async () => {
    mockOnAuthStateChange.mockImplementation((callback: (event: string, session: any) => void) => {
      callback('INITIAL_SESSION', {
        user: { id: 'real-user-uuid', email: 'junior@gmail.com', user_metadata: {} },
      });
      return { data: { subscription: { unsubscribe: jest.fn() } } };
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockSignOut).not.toHaveBeenCalled();
    expect(result.current.user?.id).toBe('real-user-uuid');
  });

  it('carrega bio/interests/phone/memberSince do profile quando a leitura tem sucesso (RF-008)', async () => {
    mockOnAuthStateChange.mockImplementation((callback: (event: string, session: any) => void) => {
      callback('SIGNED_IN', {
        user: { id: 'real-user-uuid', email: 'junior@gmail.com', user_metadata: {} },
      });
      return { data: { subscription: { unsubscribe: jest.fn() } } };
    });
    (supabase.from as jest.Mock).mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          id: 'real-user-uuid',
          name: 'Junior',
          email: 'junior@gmail.com',
          avatar_url: 'https://cdn/avatar.jpg',
          role: 'hospede',
          bio: 'Gosto de trilhas',
          interests: ['Trilhas', 'Praia'],
          phone: '62999999999',
          created_at: '2024-03-10T00:00:00.000Z',
        },
        error: null,
      }),
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.user).toMatchObject({
      bio: 'Gosto de trilhas',
      interests: ['Trilhas', 'Praia'],
      phone: '62999999999',
      memberSince: '2024-03-10T00:00:00.000Z',
    });
  });

  it('refreshUser recarrega o profile da sessão atual (ex.: depois de salvar edição de perfil em outra tela)', async () => {
    mockOnAuthStateChange.mockImplementation((callback: (event: string, session: any) => void) => {
      callback('SIGNED_IN', {
        user: { id: 'real-user-uuid', email: 'junior@gmail.com', user_metadata: {} },
      });
      return { data: { subscription: { unsubscribe: jest.fn() } } };
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    (supabase.from as jest.Mock).mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          id: 'real-user-uuid',
          name: 'Nome Atualizado',
          email: 'junior@gmail.com',
          avatar_url: null,
          role: 'hospede',
          bio: 'bio nova',
          interests: [],
          phone: null,
          created_at: '2024-01-01T00:00:00.000Z',
        },
        error: null,
      }),
    });

    await act(async () => {
      await result.current.refreshUser();
    });

    expect(result.current.user?.name).toBe('Nome Atualizado');
    expect(result.current.user?.bio).toBe('bio nova');
  });

  it('refreshUser não consulta o banco quando não há sessão ativa (usuário estático de dev)', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.login('hospede@reservago.com', '1234');
    });

    const fromCallsBefore = (supabase.from as jest.Mock).mock.calls.length;

    await act(async () => {
      await result.current.refreshUser();
    });

    expect((supabase.from as jest.Mock).mock.calls.length).toBe(fromCallsBefore);
  });
});
