import { FontAwesome } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KEEP_SIGNED_IN_KEY, useAuth } from '../context/AuthContext';
import { installCryptoSubtlePolyfillIfNeeded } from '../lib/cryptoPolyfill';
import { supabase } from '../lib/supabase';

export default function LoginScreen() {
  const router = useRouter();
  const { login, user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  useEffect(() => {
    if (user) {
      router.replace('/(tabs)');
    }
  }, [user]);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) return;
    setIsLoading(true);
    await login(email, password);
    setIsLoading(false);
  };

  // Abre o fluxo de OAuth do Google gerenciado pelo Supabase. A troca do
  // código pela sessão (e o redirecionamento pra Explorar) acontece em
  // app/oauth-callback.tsx, que recebe o deep link de volta.
  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    try {
      // Instalado só agora (não no boot do app) - é o momento mais seguro
      // pra isso, depois que toda a inicialização normal do app (incluindo
      // o que quer que configure crypto.getRandomValues) já rodou faz tempo.
      installCryptoSubtlePolyfillIfNeeded();

      const redirectTo = Linking.createURL('oauth-callback');
      console.log('[login] iniciando OAuth Google | redirectTo =', redirectTo, '| platform =', Platform.OS);

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: Platform.OS !== 'web',
          // Sem isso, se a conta Google já estiver com sessão ativa no
          // dispositivo, o Google pula direto pro redirect sem mostrar nada -
          // dá a impressão de que o "Sair da conta" (que só encerra a sessão
          // do app, nunca a do Google no aparelho - isso é comportamento
          // padrão de "Entrar com Google" em qualquer app) não funcionou,
          // porque o próximo login parece automático. Com prompt=select_account,
          // o Google sempre mostra a tela de escolher conta de novo.
          queryParams: { prompt: 'select_account' },
        },
      });

      console.log('[login] resposta signInWithOAuth ->', {
        url: data?.url ?? null,
        error: error?.message ?? null,
      });

      if (error) throw error;

      if (Platform.OS !== 'web' && data?.url) {
        console.log('[login] abrindo sessão de autenticação (WebBrowser) em', data.url);

        // (Teste de isolamento com openBrowserAsync feito e revertido — ele
        // não intercepta o retorno do deep link por design, então não serve
        // pra fechar o fluxo de OAuth. Confirmou que a falha é no redirect de
        // volta para exp://.../--/oauth-callback, não na abertura da página.)
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
        console.log('[login] openAuthSessionAsync retornou (completo) ->', JSON.stringify(result));

        if (result.type === 'success') {
          console.log('[login] [SUCCESS] url de retorno recebida ->', result.url);

          // Troca o código por sessão aqui mesmo, em vez de depender de
          // app/oauth-callback.tsx (useURL()) pegar essa URL depois: no Android,
          // a tela de callback pode montar (via deep link do SO) antes desse
          // retorno estar disponível pra ela, e useURL() fica null pra sempre -
          // travando a tela no spinner "Concluindo login com Google...". Aqui
          // já temos a URL certa na mão, então fechamos o fluxo direto.
          //
          // IMPORTANTE: exchangeCodeForSession espera só o CÓDIGO (uma string
          // tipo '34e770dd-9ff9-...'), não a URL inteira - ver o exemplo na
          // própria tipagem do SDK (GoTrueClient.d.ts). Passar a URL completa
          // faz o servidor responder "invalid flow state, no valid flow state
          // found", porque ele recebe a URL toda como se fosse o auth_code e
          // não bate com nenhum flow_state de verdade - foi exatamente esse o
          // bug que travou o login todo esse tempo (confirmado testando a
          // troca via curl, direto, com o código extraído manualmente).
          const codeMatch = result.url.match(/[?&]code=([^&]+)/);
          const code = codeMatch ? decodeURIComponent(codeMatch[1]) : null;
          if (!code) {
            console.log('[login] não achei "code=" na URL de retorno ->', result.url);
            Alert.alert('Erro ao entrar com Google', 'Não foi possível ler o código de autorização retornado.');
            return;
          }

          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            console.log('[login] erro ao trocar código por sessão ->', exchangeError.message);
            Alert.alert('Erro ao entrar com Google', exchangeError.message);
            return;
          }

          console.log('[login] sessão criada com sucesso');

          // Pergunta feita uma vez por login: se o usuário escolher "Não
          // salvar", AuthContext descarta a sessão restaurada no próximo boot
          // do app (ver onAuthStateChange, evento INITIAL_SESSION) - a sessão
          // atual continua valendo normalmente até o app ser fechado.
          Alert.alert(
            'Manter conectado?',
            'Deseja que sua conta fique salva neste dispositivo? Se não salvar, você vai precisar entrar de novo na próxima vez que abrir o app.',
            [
              {
                text: 'Não salvar',
                style: 'cancel',
                onPress: async () => {
                  await AsyncStorage.setItem(KEEP_SIGNED_IN_KEY, 'false');
                  router.replace('/(tabs)');
                },
              },
              {
                text: 'Manter conectado',
                onPress: async () => {
                  await AsyncStorage.setItem(KEEP_SIGNED_IN_KEY, 'true');
                  router.replace('/(tabs)');
                },
              },
            ]
          );
        } else {
          console.log('[login] sessão de autenticação não retornou "success" -> type =', result.type);
        }
      }
    } catch (err: any) {
      console.log('[login] erro no login com Google ->', err?.message ?? err);
      Alert.alert('Erro ao entrar com Google', err?.message ?? 'Tente novamente.');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.content}>

          <View style={styles.header}>
            <FontAwesome name="tree" size={60} color="#2D5A27" />
            <Text style={styles.title}>Bem-vindo ao ReservaGO</Text>
            <Text style={styles.subtitle}>Sua conta para as melhores cabanas do Brasil.</Text>
          </View>

          <View style={styles.form}>
            <TouchableOpacity
              style={[styles.googleButton, isGoogleLoading && styles.loginButtonDisabled]}
              onPress={handleGoogleLogin}
              disabled={isGoogleLoading}
            >
              {isGoogleLoading ? (
                <ActivityIndicator color="#1F2937" />
              ) : (
                <>
                  <FontAwesome name="google" size={18} color="#1F2937" style={{ marginRight: 10 }} />
                  <Text style={styles.googleText}>Entrar com Google</Text>
                </>
              )}
            </TouchableOpacity>

            {__DEV__ && (
              <>
                <Text style={styles.devDivider}>— apenas em desenvolvimento —</Text>

                <TextInput
                  style={styles.input}
                  placeholder="E-mail"
                  placeholderTextColor="#9CA3AF"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  editable={!isLoading}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Senha"
                  placeholderTextColor="#9CA3AF"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  editable={!isLoading}
                />

                <TouchableOpacity
                  style={[styles.loginButton, (!email || !password || isLoading) && styles.loginButtonDisabled]}
                  onPress={handleLogin}
                  disabled={!email || !password || isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.loginText}>Entrar (login fake)</Text>
                  )}
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
              disabled={isLoading || isGoogleLoading}
            >
              <Text style={styles.backText}>Voltar e explorar</Text>
            </TouchableOpacity>
          </View>

        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { flex: 1, padding: 30, justifyContent: 'space-around' },
  header: { alignItems: 'center' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#1F2937', marginTop: 20, textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#6B7280', textAlign: 'center', marginTop: 10 },
  form: { gap: 15 },
  googleButton: {
    flexDirection: 'row', backgroundColor: '#fff', padding: 18, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center', minHeight: 58,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  googleText: { fontSize: 16, fontWeight: 'bold', color: '#1F2937' },
  devDivider: { textAlign: 'center', color: '#9CA3AF', fontSize: 12, marginTop: 5 },
  input: {
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 15,
    padding: 18, fontSize: 16, color: '#1F2937', backgroundColor: '#F9FAFB',
  },
  loginButton: {
    backgroundColor: '#2D5A27', padding: 18, borderRadius: 15,
    alignItems: 'center', minHeight: 58, justifyContent: 'center',
  },
  loginButtonDisabled: { opacity: 0.5 },
  loginText: { fontSize: 16, fontWeight: 'bold', color: '#fff' },
  backButton: { alignItems: 'center', padding: 10 },
  backText: { color: '#6B7280', textDecorationLine: 'underline' },
});