import { FontAwesome } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Lock, Mail, User } from 'lucide-react-native';
import React, { useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { AuthShell } from '../components/auth/AuthShell';
import { AuthButton, AuthField, AuthHeading, AuthNotice, BackLink, Divider, StepIndicator, authStyles } from '../components/auth/AuthUI';
import { exitAuthFlow } from '../components/auth/authNavigation';
import { HERO_IMAGES } from '../constants/Refugio';
import { isValidEmail, normalizeEmail, passwordIssues } from '../lib/authValidation';
import { signUpWithPassword } from '../services/authService';

// Criar conta com e-mail e senha. Com "Confirm email" ligado no Supabase (padrão),
// segue para app/verify-code.tsx (purpose=signup); depois, escolha de perfil.
export default function RegisterScreen() {
  const router = useRouter();
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; email?: string; password?: string }>({});

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/login'));

  const handleSubmit = async () => {
    setError(null);
    const errs: typeof fieldErrors = {};
    if (name.trim().length < 2) errs.name = 'Digite seu nome.';
    if (!isValidEmail(email)) errs.email = 'Digite um e-mail válido.';
    const issues = passwordIssues(password);
    if (issues.length) errs.password = `Falta: ${issues.join(', ').toLowerCase()}.`;
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    const { data, error: signUpError } = await signUpWithPassword(name, email, password);
    setLoading(false);
    if (signUpError || !data) {
      setError(signUpError ?? 'Não foi possível criar a conta.');
      return;
    }
    if (data.needsCode) {
      router.push({ pathname: '/verify-code', params: { email: normalizeEmail(email), purpose: 'signup' } });
    } else {
      // Projeto sem confirmação de e-mail: a sessão já veio pronta.
      exitAuthFlow(router, '/select-role');
    }
  };

  return (
    <AuthShell
      testID="register-screen"
      heroImage={HERO_IMAGES.register}
      heroBadge="BEM-VINDO AO CLUBE DE REFÚGIOS"
      eyebrow="Nova conta"
      heroTitle="Seu próximo silêncio"
      heroTitleAccent="está esperando."
      heroSubtitle="Crie sua conta para reservar cabanas isoladas ou anunciar o seu próprio refúgio."
      compactHero
      topBar={<BackLink label="Voltar ao login" onPress={goBack} />}
    >
      <AuthHeading title="Criar conta" subtitle="Leva menos de um minuto. Você confirma o e-mail com um código." />

      <View style={authStyles.form}>
        {error ? <AuthNotice kind="error" message={error} testID="register-error" /> : null}

        <AuthField
          label="Nome"
          icon={User}
          value={name}
          onChangeText={(t) => { setName(t); setFieldErrors((e) => ({ ...e, name: undefined })); }}
          placeholder="Como você quer ser chamado"
          autoCapitalize="words"
          autoCorrect={false}
          textContentType="name"
          autoComplete="name"
          returnKeyType="next"
          onSubmitEditing={() => emailRef.current?.focus()}
          editable={!loading}
          error={fieldErrors.name}
          testID="register-name"
        />
        <AuthField
          ref={emailRef}
          label="E-mail"
          icon={Mail}
          value={email}
          onChangeText={(t) => { setEmail(t); setFieldErrors((e) => ({ ...e, email: undefined })); }}
          placeholder="voce@email.com"
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          editable={!loading}
          error={fieldErrors.email}
          testID="register-email"
        />
        <AuthField
          ref={passwordRef}
          label="Senha"
          icon={Lock}
          password
          value={password}
          onChangeText={(t) => { setPassword(t); setFieldErrors((e) => ({ ...e, password: undefined })); }}
          placeholder="8+ caracteres, letras e números"
          textContentType="newPassword"
          autoComplete="new-password"
          returnKeyType="go"
          onSubmitEditing={handleSubmit}
          editable={!loading}
          error={fieldErrors.password}
          testID="register-password"
        />

        <AuthButton title="Criar conta" onPress={handleSubmit} loading={loading} testID="register-submit" />

        <Divider text="ou" />
        <AuthButton
          variant="outline"
          title="Usar minha conta Google"
          onPress={goBack}
          icon={<FontAwesome name="google" size={17} color="#DB4437" />}
        />

        <Text style={authStyles.smallText}>
          Já tem conta?{' '}
          <Text style={authStyles.link} onPress={goBack} accessibilityRole="link">Entrar</Text>
        </Text>
      </View>

      <StepIndicator step={1} title="Criação de conta" labels={['Dados', 'Confirmação', 'Perfil']} />
    </AuthShell>
  );
}
