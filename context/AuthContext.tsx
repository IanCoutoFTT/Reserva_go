import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { supabase } from '../lib/supabase';
import { deleteAccount as deleteAccountInDb, updateRole as updateRoleInDb } from '../services/profileService';

// Preferência do usuário (por dispositivo, não por conta) sobre manter ou não
// a sessão do Google salva entre aberturas do app - perguntada em
// app/login.tsx logo após um login com Google bem-sucedido.
export const KEEP_SIGNED_IN_KEY = '@reservago:keepSignedIn';

export type UserRole = 'hospede' | 'anfitriao' | 'admin';

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar: string;
  bio: string;
  interests: string[];
  phone: string | null;
  /** ISO de profiles.created_at - null pro usuário estático de dev (não existe linha em profiles). */
  memberSince: string | null;
}

const DEFAULT_AVATAR = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200';

// Usuários estáticos de dev (__DEV__) não têm linha em `profiles` - por isso
// bio/interests/phone/memberSince ficam vazios/null aqui, sempre. Editar
// perfil pra esses continua só em memória (ver comentário em profile.tsx).
const STATIC_USERS: { email: string; password: string; user: AppUser }[] = [
  {
    email: 'admin@reservago.com',
    password: '1234',
    user: {
      id: 'static-admin-01',
      name: 'Admin ReservaGO',
      email: 'admin@reservago.com',
      role: 'admin',
      avatar: DEFAULT_AVATAR,
      bio: '',
      interests: [],
      phone: null,
      memberSince: null,
    },
  },
  {
    email: 'hospede@reservago.com',
    password: '1234',
    user: {
      id: 'static-hospede-01',
      name: 'João Hóspede',
      email: 'hospede@reservago.com',
      role: 'hospede',
      avatar: DEFAULT_AVATAR,
      bio: '',
      interests: [],
      phone: null,
      memberSince: null,
    },
  },
  {
    email: 'anfitriao@reservago.com',
    password: '1234',
    user: {
      id: 'static-anfitriao-01',
      name: 'Maria Anfitriã',
      email: 'anfitriao@reservago.com',
      role: 'anfitriao',
      avatar: DEFAULT_AVATAR,
      bio: '',
      interests: [],
      phone: null,
      memberSince: null,
    },
  },
];

interface AuthContextData {
  user: AppUser | null;
  session: Session | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateRole: (role: UserRole) => Promise<void>;
  deleteAccount: () => Promise<void>;
  /** Recarrega profiles pra sessão atual - usado por quem grava direto no banco (ex.: salvar edição de perfil) pra refletir o dado confirmado sem esperar um evento do onAuthStateChange. No-op pra usuário estático/sem sessão. */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Busca a linha em `profiles` correspondente à sessão do Supabase.
  // Não cria nada aqui: a trigger handle_new_user (schema.sql) já garante
  // que o profile existe assim que o usuário é criado em auth.users.
  const loadProfileForSession = async (activeSession: Session) => {
    console.log('[auth] carregando profile para usuário', activeSession.user.id);
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, name, email, avatar_url, role, bio, interests, phone, created_at')
      .eq('id', activeSession.user.id)
      .single();

    if (error || !profile) {
      console.log('[auth] falha ao ler profile, usando fallback ->', error?.message);
      // Não deveria acontecer (a trigger roda antes disso), mas evita deixar
      // o usuário sem `user` populado se a leitura falhar por algum motivo.
      setUser({
        id: activeSession.user.id,
        name: activeSession.user.user_metadata?.full_name ?? activeSession.user.email ?? 'Usuário',
        email: activeSession.user.email ?? '',
        role: 'hospede',
        avatar: activeSession.user.user_metadata?.avatar_url ?? DEFAULT_AVATAR,
        bio: '',
        interests: [],
        phone: null,
        memberSince: null,
      });
      console.log('[auth] user (fallback) definido no estado');
      return;
    }

    setUser({
      id: profile.id,
      name: profile.name || activeSession.user.email || 'Usuário',
      email: profile.email,
      role: (profile.role as UserRole) ?? 'hospede',
      avatar: profile.avatar_url || DEFAULT_AVATAR,
      bio: profile.bio ?? '',
      interests: profile.interests ?? [],
      phone: profile.phone ?? null,
      memberSince: profile.created_at ?? null,
    });
    console.log('[auth] user definido no estado a partir do profile ->', profile.email, profile.role);
  };

  useEffect(() => {
    let isMounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      console.log('[auth] onAuthStateChange ->', event, '| sessão presente?', !!newSession);
      if (!isMounted) return;

      // INITIAL_SESSION é a sessão restaurada do SecureStore no boot do app -
      // se o usuário escolheu não deixar a conta salva neste dispositivo
      // (pergunta feita em app/login.tsx logo após o login), descarta essa
      // sessão restaurada e trata como se não houvesse nenhuma, em vez de
      // deixar entrar direto sem pedir login de novo.
      if (event === 'INITIAL_SESSION' && newSession) {
        AsyncStorage.getItem(KEEP_SIGNED_IN_KEY).then((keepSignedIn) => {
          if (!isMounted) return;
          if (keepSignedIn === 'false') {
            console.log('[auth] sessão restaurada, mas usuário escolheu não salvar a conta neste dispositivo - encerrando');
            supabase.auth.signOut().catch(() => {}).finally(() => {
              if (!isMounted) return;
              setSession(null);
              setUser(null);
              setLoading(false);
            });
            return;
          }
          setSession(newSession);
          loadProfileForSession(newSession).finally(() => isMounted && setLoading(false));
        });
        return;
      }

      setSession(newSession);

      if (!newSession) {
        setUser(null);
        setLoading(false);
        return;
      }

      // Só recarrega o profile quando a identidade muda de fato — evita
      // sobrescrever alterações locais (ex: updateRole) a cada renovação
      // automática de token (TOKEN_REFRESHED).
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        loadProfileForSession(newSession).finally(() => isMounted && setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    setLoading(true);
    const found = STATIC_USERS.find(
      (u) => u.email === email.trim().toLowerCase() && u.password === password
    );
    if (found) {
      setUser(found.user);
    } else {
      Alert.alert('Erro', 'E-mail ou senha inválidos.');
    }
    setLoading(false);
  };

  const logout = async () => {
    // "Sair da conta" precisa funcionar mesmo se a chamada de rede pro
    // Supabase falhar/travar (sem internet, servidor lento etc.) - sign-out
    // é fundamentalmente uma ação local (limpar a sessão salva) e o usuário
    // nunca deveria ficar "preso" logado só por causa de uma rede ruim.
    try {
      const { error } = await supabase.auth.signOut();
      if (error) console.log('[auth] signOut retornou erro ->', error.message);
    } catch (e: any) {
      console.log('[auth] signOut lançou exceção ->', e?.message ?? e);
    } finally {
      setUser(null);
    }
  };

  const updateRole = async (role: UserRole) => {
    if (!user) return;

    // Grava de verdade em profiles.role via RPC set_own_role (antes só
    // trocava em memória - ver PROJETO.md). Para os usuários estáticos de dev
    // (STATIC_USERS, ids "static-*") não existe linha em profiles, então
    // isso falha por design nesse caso específico - é esperado, esse login
    // fake não passa de __DEV__ e nunca vai pra produção.
    const { data, error } = await updateRoleInDb(role);

    if (error) {
      Alert.alert('Erro ao atualizar perfil', error);
      return;
    }

    setUser((prev) => (prev ? { ...prev, role: data?.role ?? role } : null));
  };

  const deleteAccount = async () => {
    if (!user) return;
    Alert.alert(
      'Excluir conta',
      'Tem certeza? Seus dados de perfil serão desativados e você será desconectado. Essa ação não pode ser desfeita por você mesmo.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            // Usuários estáticos de dev (STATIC_USERS, ids "static-*") não têm
            // linha em profiles - não faz sentido chamar o soft delete real
            // pra eles (mesma ressalva de updateRole, acima).
            if (!user.id.startsWith('static-')) {
              const { error } = await deleteAccountInDb(user.id);
              if (error) {
                Alert.alert('Erro ao excluir conta', error);
                return;
              }
            }

            try {
              const { error } = await supabase.auth.signOut();
              if (error) console.log('[auth] signOut (delete) retornou erro ->', error.message);
            } catch (e: any) {
              console.log('[auth] signOut (delete) lançou exceção ->', e?.message ?? e);
            } finally {
              setUser(null);
            }
          },
        },
      ]
    );
  };

  const refreshUser = async () => {
    if (!session) return;
    await loadProfileForSession(session);
  };

  return (
    <AuthContext.Provider
      value={{ user, session, loading, login, logout, updateRole, deleteAccount, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return context;
};