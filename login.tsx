import { FontAwesome } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Lock, Mail } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AccessHelpModal } from '../components/auth/AccessHelpModal';
import { AuthShell } from '../components/auth/AuthShell';
import { AuthButton, AuthField, AuthHeading, AuthNotice, Divider, HelpCard, authStyles } from '../components/auth/AuthUI';
import { HERO_IMAGES, RF, SERIF } from '../constants/Refugio';
import { KEEP_SIGNED_IN_KEY, useAuth } from '../context/AuthContext';
import { isValidEmail, normalizeEmail } from '../lib/authValidation';
import { installCryptoSubtlePolyfillIfNeeded } from '../lib/cryptoPolyfill';
import { supabase } from '../lib/supabase';
import { resendCode } from '../services/authService';

export default function LoginScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const { login, user } = useAuth();
  const passwordRef = useRef<TextInput>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  // Entrou (e-mail/senha, Google ou usuário de dev) -> sai do login.
  // Só reage com a tela em foco: durante cadastro/recuperação (telas empilhadas
  // por cima desta) a sessão nasce no meio do fluxo e quem navega é a própria
  // tela do fluxo.
  useEffect(() => {
    if (!user || !isFocused) return;
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, [user, isFocused]);

  const busy = isLoading || isGoogleLoading;

  const saveRememberChoice = () => AsyncStorage.setItem(KEEP_SIGNED_IN_KEY, remember ? 'true' : 'false');

  const handleLogin = async () => {
    setError(null);
    if (!isValidEmail(email)) {
      setEmailError('Digite um e-mail válido.');
      return;
    }
    if (!password) {
      setError('Digite sua senha.');
      return;
    }
    setEmailError(null);
    setIsLoading(true);
    try {
      await saveRememberChoice();
      const result = await login(email, password);
      if (result.needsConfirmation) {
        // Conta criada mas e-mail não confirmado: manda um código novo e abre a verificação.
        await resendCode(email, 'signup');
        router.push({ pathname: '/verify-code', params: { email: normalizeEmail(email), purpose: 'signup' } });
        return;
      }
      if (result.error) setError(result.error);
    } finally {
      setIsLoading(false);
    }
  };

  // Abre o fluxo de OAuth do Google gerenciado pelo Supabase (PKCE). Mesma
  // lógica de antes; a pergunta "Manter conectado?" virou a caixa
  // "Manter conectado neste dispositivo", gravada antes de sair para o Google.
  const handleGoogleLogin = async () => {
    setError(null);
    setIsGoogleLoading(true);
    try {
      await saveRememberChoice();
      installCryptoSubtlePolyfillIfNeeded();

      const redirectTo = Linking.createURL('oauth-callback');
      console.log('[login] iniciando OAuth Google | platform =', Platform.OS);

      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: Platform.OS !== 'web',
          // Sempre mostra o seletor de conta do Google (senão "Sair" parece não funcionar).
          queryParams: { prompt: 'select_account' },
        },
      });

      // S-14: a URL de autorização e a de retorno (com o código) não vão para o log.
      console.log('[login] resposta signInWithOAuth | url gerada?', !!data?.url, '| erro =', oauthError?.message ?? null);
      if (oauthError) throw oauthError;

      if (Platform.OS !== 'web' && data?.url) {
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
        console.log('[login] openAuthSessionAsync retornou | type =', result.type);
        if (result.type !== 'success') return;

        // Troca o código aqui mesmo (no Android a tela de callback pode montar
        // antes da URL existir). exchangeCodeForSession espera SÓ o código.
        const codeMatch = result.url.match(/[?&]code=([^&]+)/);
        const code = codeMatch ? decodeURIComponent(codeMatch[1]) : null;
        if (!code) {
          setError('Não foi possível ler o código de autorização do Google.');
          return;
        }

        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          console.log('[login] erro ao trocar código por sessão ->', exchangeError.message);
          setError(`Não foi possível entrar com Google: ${exchangeError.message}`);
          return;
        }
        console.log('[login] sessão criada com sucesso');
        // A navegação acontece no useEffect acima, quando o perfil carregar.
      }
    } catch (err: any) {
      console.log('[login] erro no login com Google ->', err?.message ?? err);
      setError(`Não foi possível entrar com Google. ${err?.message ?? 'Tente novamente.'}`);
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <AuthShell
      testID="login-screen"
      heroImage={HERO_IMAGES.login}
      heroBadge="CABANAS • CHALÉS • REFÚGIOS"
      eyebrow="Exclusividade & natureza"
      heroTitle="Seu refúgio particular"
      heroTitleAccent="começa aqui."
      heroSubtitle="Hospedagens isoladas, em meio à natureza, para quem quer desconectar e viver o essencial."
      heroFooter={
        <View style={styles.features}>
          <Feature title="Pix ou cartão" text="Pagamento dentro do app" />
          <View style={styles.featureSep} />
          <Feature title="Chat direto" text="Fale com o anfitrião" />
          <View style={styles.featureSep} />
          <Feature title="Avaliações" text="De quem já se hospedou" />
        </View>
      }
    >
      <AuthHeading kicker="Hóspedes & anfitriões" title="Bem-vindo de volta!" subtitle="Entre para reservar, conversar com anfitriões e gerenciar suas cabanas." />

      <View style={authStyles.form}>
        {error ? <AuthNotice kind="error" message={error} testID="login-error" /> : null}

        <AuthField
          label="E-mail"
          icon={Mail}
          value={email}
          onChangeText={(t) => { setEmail(t); setEmailError(null); }}
          placeholder="voce@email.com"
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          editable={!busy}
          error={emailError}
          testID="login-email"
        />

        <AuthField
          ref={passwordRef}
          label="Senha"
          icon={Lock}
          password
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          textContentType="password"
          autoComplete="password"
          returnKeyType="go"
          onSubmitEditing={handleLogin}
          editable={!busy}
          labelAction={{
            text: 'Esqueceu sua senha?',
            onPress: () => router.push({ pathname: '/forgot-password', params: email ? { email: normalizeEmail(email) } : {} }),
          }}
          testID="login-password"
        />

        <Pressable
          style={styles.remember}
          onPress={() => setRemember((v) => !v)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: remember }}
          testID="login-remember"
        >
          <View style={[styles.checkbox, remember && styles.checkboxOn]}>
            {remember ? <Text style={styles.checkmark}>✓</Text> : null}
          </View>
          <Text style={styles.rememberText}>Manter conectado neste dispositivo</Text>
        </Pressable>

        <AuthButton title="Entrar" onPress={handleLogin} loading={isLoading} disabled={isGoogleLoading} testID="login-submit" />

        <Divider text="ou continue com" />

        <AuthButton
          variant="outline"
          title="Entrar com Google"
          onPress={handleGoogleLogin}
          loading={isGoogleLoading}
          disabled={isLoading}
          icon={<FontAwesome name="google" size={17} color="#DB4437" />}
          testID="login-google"
        />

        <Text style={authStyles.smallText}>
          Ainda não tem conta?{' '}
          <Text style={authStyles.link} onPress={() => router.push('/register')} accessibilityRole="link">
            Criar uma conta
          </Text>
        </Text>

        <Text style={[authStyles.smallText, styles.explore]} onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}>
          Voltar e explorar sem entrar
        </Text>

        {__DEV__ ? (
          <Text style={styles.devHint}>
            Dev: admin@ · hospede@ · anfitriao@reservago.com — senha 1234
          </Text>
        ) : null}
      </View>

      <HelpCard
        title="Problemas com o acesso?"
        text="Conta do Google, código que não chegou..."
        actionText="Ajuda"
        onPress={() => setHelpOpen(true)}
      />

      <AccessHelpModal visible={helpOpen} onClose={() => setHelpOpen(false)} />
    </AuthShell>
  );
}

function Feature({ title, text }: { title: string; text: string }) {
  return (
    <View>
      <Text style={styles.featureTitle}>{title}</Text>
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  remember: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'flex-start' },
  checkbox: {
    width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: RF.border,
    backgroundColor: RF.white, alignItems: 'center', justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: RF.moss, borderColor: RF.moss },
  checkmark: { color: RF.white, fontSize: 12, fontWeight: '800', marginTop: -1 },
  rememberText: { fontSize: 13, color: RF.muted },
  explore: { textDecorationLine: 'underline', color: RF.warmgray },
  devHint: { fontSize: 11, color: '#A8A29E', textAlign: 'center' },
  features: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 20 },
  featureSep: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.2)' },
  featureTitle: { fontFamily: SERIF, fontSize: 18, color: RF.white },
  featureText: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
});
