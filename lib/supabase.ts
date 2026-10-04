import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Se EXPO_PUBLIC_SUPABASE_URL/ANON_KEY não estiverem definidos (.env ausente
// nesta máquina, ou Metro iniciado antes do .env existir), o client cairia
// silenciosamente num host "placeholder.supabase.co" que não existe. Isso é
// exatamente o que produz o erro "Safari não pode abrir a página porque não
// pode se conectar ao servidor" ao tentar o login com Google: o WebBrowser
// tenta abrir https://placeholder.supabase.co/auth/v1/authorize e o DNS
// falha. Por isso avisamos alto no console assim que o módulo carrega, em
// vez de deixar isso passar batido.
if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[supabase] EXPO_PUBLIC_SUPABASE_URL e/ou EXPO_PUBLIC_SUPABASE_ANON_KEY não ' +
    'foram encontrados em process.env. Crie um arquivo .env na raiz do projeto ' +
    '(veja .env.example) com esses valores e reinicie com "npx expo start --clear". ' +
    'Sem isso, o login com Google (e qualquer chamada ao Supabase) vai falhar.'
  );
} else {
  console.log('[supabase] client configurado para', supabaseUrl);
}

const resolvedUrl = supabaseUrl ?? 'https://placeholder.supabase.co';
const resolvedAnonKey = supabaseAnonKey ?? 'placeholder-key';

// Faz o client do Supabase persistir a sessão (access_token e refresh_token)
// no SecureStore em vez de AsyncStorage, em dispositivos nativos. O SDK usa
// essa interface pra ler/gravar a sessão sozinho e renová-la automaticamente
// (autoRefreshToken). No web, SecureStore não existe — o SDK cai pro storage
// padrão dele (localStorage).
const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(resolvedUrl, resolvedAnonKey, {
  auth: {
    storage: Platform.OS === 'web' ? undefined : ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // O default do SDK é 'implicit' (ver node_modules/@supabase/supabase-js/
    // src/lib/constants.ts). Sem isso explícito, signInWithOAuth gera uma URL
    // de autorização SEM code_challenge/code_challenge_method, e o callback
    // volta com o token no fragmento (#access_token=...) em vez de "?code=".
    // Só que app/oauth-callback.tsx chama exchangeCodeForSession(url), que é
    // específico do fluxo PKCE e espera "?code=" — com implicit, não há code
    // nenhum pra trocar. Precisa ser 'pkce' pros dois lados baterem.
    flowType: 'pkce',
  },
});
