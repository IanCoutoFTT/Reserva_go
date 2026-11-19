import { useNavigation, useRouter } from 'expo-router';
import { Check, Circle, Lock } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { AuthShell } from '../components/auth/AuthShell';
import { AuthButton, AuthField, AuthHeading, AuthNotice, BackLink, StepIndicator, authStyles } from '../components/auth/AuthUI';
import { exitAuthFlow } from '../components/auth/authNavigation';
import { HERO_IMAGES, RF } from '../constants/Refugio';
import { useAuth } from '../context/AuthContext';
import { PASSWORD_MIN_LENGTH, passwordIssues } from '../lib/authValidation';
import { cancelRecovery, updatePassword } from '../services/authService';

const RULES = [
  { label: `Pelo menos ${PASSWORD_MIN_LENGTH} caracteres`, test: (p: string) => p.length >= PASSWORD_MIN_LENGTH },
  { label: 'Pelo menos uma letra', test: (p: string) => /[A-Za-zÀ-ÿ]/.test(p) },
  { label: 'Pelo menos um número', test: (p: string) => /\d/.test(p) },
];

// Recuperação de senha - passo 3 de 3 (Nova senha). Usa a sessão temporária
// aberta pelo código (evento PASSWORD_RECOVERY). Gravando a senha, o Supabase
// dispara USER_UPDATED, o AuthContext carrega o perfil e a pessoa já entra.
export default function ResetPasswordScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { session } = useAuth();
  const confirmRef = useRef<TextInput>(null);
  const doneRef = useRef(false);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Saiu desta tela sem gravar a senha (voltar, gesto, botão do Android):
  // encerra a sessão temporária, para não ficar "logado" sem ter trocado a senha.
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', () => {
      if (!doneRef.current) cancelRecovery();
    });
    return unsubscribe;
  }, [navigation]);

  const handleCancel = () => {
    if (router.canGoBack()) router.back();
    else {
      cancelRecovery();
      router.replace('/login');
    }
  };

  const handleSubmit = async () => {
    setError(null);
    const issues = passwordIssues(password);
    if (issues.length > 0) {
      setError(`Senha fraca: ${issues.join(', ').toLowerCase()}.`);
      return;
    }
    if (password !== confirm) {
      setError('As senhas não conferem.');
      return;
    }
    setLoading(true);
    const { error: updateError } = await updatePassword(password);
    setLoading(false);
    if (updateError) {
      setError(updateError);
      return;
    }
    doneRef.current = true;
    exitAuthFlow(router, '/(tabs)');
  };

  return (
    <AuthShell
      testID="reset-password-screen"
      heroImage={HERO_IMAGES.reset}
      heroBadge="QUASE LÁ"
      eyebrow="Etapa 03 • Nova senha"
      heroTitle="Uma nova chave para o seu refúgio."
      heroSubtitle="Escolha uma senha que você não usa em outros sites. Depois disso você já entra direto."
      compactHero
      topBar={<BackLink label="Cancelar" onPress={handleCancel} />}
    >
      <AuthHeading title="Criar nova senha" subtitle="Código confirmado. Agora defina a senha que você vai usar para entrar." />

      {!session ? (
        <View style={authStyles.form}>
          <AuthNotice
            kind="error"
            title="Verificação expirada"
            message="Não encontramos uma verificação ativa. Peça um novo código para continuar."
            testID="reset-no-session"
          />
          <AuthButton title="Pedir novo código" onPress={() => router.replace('/forgot-password')} />
        </View>
      ) : (
        <View style={authStyles.form}>
          {error ? <AuthNotice kind="error" message={error} testID="reset-error" /> : null}

          <AuthField
            label="Nova senha"
            icon={Lock}
            password
            value={password}
            onChangeText={(t) => { setPassword(t); setError(null); }}
            placeholder="Mínimo de 8 caracteres"
            textContentType="newPassword"
            autoComplete="new-password"
            returnKeyType="next"
            onSubmitEditing={() => confirmRef.current?.focus()}
            editable={!loading}
            autoFocus
            testID="reset-password"
          />

          <View style={styles.rules}>
            {RULES.map((rule) => {
              const ok = rule.test(password);
              return (
                <View key={rule.label} style={styles.rule}>
                  {ok ? <Check size={14} color={RF.success} /> : <Circle size={12} color="#A8A29E" />}
                  <Text style={[styles.ruleText, ok && styles.ruleOk]}>{rule.label}</Text>
                </View>
              );
            })}
          </View>

          <AuthField
            ref={confirmRef}
            label="Confirmar nova senha"
            icon={Lock}
            password
            value={confirm}
            onChangeText={(t) => { setConfirm(t); setError(null); }}
            placeholder="Repita a senha"
            textContentType="newPassword"
            autoComplete="new-password"
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
            editable={!loading}
            error={confirm.length > 0 && confirm !== password ? 'As senhas não conferem.' : null}
            testID="reset-confirm"
          />

          <AuthButton title="Salvar e entrar" onPress={handleSubmit} loading={loading} testID="reset-submit" />
        </View>
      )}

      <StepIndicator step={3} />
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  rules: { gap: 6, marginTop: -6 },
  rule: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ruleText: { fontSize: 12, color: RF.warmgray },
  ruleOk: { color: RF.success, fontWeight: '600' },
});
