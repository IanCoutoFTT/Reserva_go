import { useLocalSearchParams, useRouter } from 'expo-router';
import { AtSign } from 'lucide-react-native';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AccessHelpModal } from '../components/auth/AccessHelpModal';
import { AuthShell } from '../components/auth/AuthShell';
import { AuthButton, AuthField, AuthHeading, AuthNotice, BackLink, HelpCard, StepIndicator, authStyles } from '../components/auth/AuthUI';
import { HERO_IMAGES, RF, SERIF } from '../constants/Refugio';
import { isValidEmail, normalizeEmail } from '../lib/authValidation';
import { requestPasswordReset } from '../services/authService';

// Recuperação de senha - passo 1 de 3 (Identificação).
// Envia um código de 6 dígitos para o e-mail; o passo 2 é app/verify-code.tsx.
export default function ForgotPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(typeof params.email === 'string' ? params.email : '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/login'));

  const handleSubmit = async () => {
    setError(null);
    if (!isValidEmail(email)) {
      setError('Digite o e-mail da sua conta.');
      return;
    }
    setLoading(true);
    const { error: sendError } = await requestPasswordReset(email);
    setLoading(false);
    if (sendError) {
      setError(sendError);
      return;
    }
    router.push({ pathname: '/verify-code', params: { email: normalizeEmail(email), purpose: 'recovery' } });
  };

  return (
    <AuthShell
      testID="forgot-password-screen"
      heroImage={HERO_IMAGES.recovery}
      heroBadge="SEGURANÇA • ATENDIMENTO"
      eyebrow="Proteção • continuidade"
      heroTitle="Recupere o acesso ao seu refúgio de tranquilidade."
      heroSubtitle="Em poucos instantes você cria uma nova senha e volta para as suas reservas."
      compactHero
      heroFooter={
        <View style={styles.heroCard}>
          <Text style={styles.heroCardTitle}>Código de uso único</Text>
          <Text style={styles.heroCardText}>
            O código enviado vale para uma única troca de senha e deixa de funcionar depois de usado.
          </Text>
        </View>
      }
      topBar={<BackLink label="Voltar ao login" onPress={goBack} />}
    >
      <AuthHeading
        title="Recuperar senha"
        subtitle="Informe o e-mail da sua conta. Enviaremos um código de 6 dígitos para você criar uma nova senha."
      />

      <View style={authStyles.form}>
        {error ? <AuthNotice kind="error" message={error} testID="forgot-error" /> : null}

        <AuthField
          label="E-mail cadastrado"
          icon={AtSign}
          value={email}
          onChangeText={(t) => { setEmail(t); setError(null); }}
          placeholder="voce@email.com"
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          returnKeyType="send"
          onSubmitEditing={handleSubmit}
          editable={!loading}
          autoFocus={!email}
          testID="forgot-email"
        />

        <AuthButton title="Enviar código" onPress={handleSubmit} loading={loading} testID="forgot-submit" />
      </View>

      <StepIndicator step={1} />

      <HelpCard
        title="Problemas com o acesso?"
        text="Entrou com Google ou perdeu o e-mail?"
        actionText="Ajuda"
        onPress={() => setHelpOpen(true)}
      />
      <AccessHelpModal visible={helpOpen} onClose={() => setHelpOpen(false)} />
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    padding: 18, borderRadius: 18, backgroundColor: 'rgba(22,40,31,0.5)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  heroCardTitle: { fontFamily: SERIF, fontSize: 15, color: RF.cream, marginBottom: 4 },
  heroCardText: { fontSize: 12, lineHeight: 18, color: 'rgba(233,228,220,0.75)' },
});
