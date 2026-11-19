import { useLocalSearchParams, useRouter } from 'expo-router';
import { Mail } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AccessHelpModal } from '../components/auth/AccessHelpModal';
import { AuthShell } from '../components/auth/AuthShell';
import { AuthButton, AuthHeading, AuthNotice, BackLink, HelpCard, StepIndicator, authStyles } from '../components/auth/AuthUI';
import { exitAuthFlow } from '../components/auth/authNavigation';
import { OtpInput } from '../components/auth/OtpInput';
import { HERO_IMAGES, RF } from '../constants/Refugio';
import { OTP_LENGTH, RESEND_COOLDOWN_SECONDS, formatCountdown, isValidEmail, maskEmail } from '../lib/authValidation';
import { CodePurpose, resendCode, verifyCode } from '../services/authService';

// Passo 2: confere o código de 6 dígitos enviado por e-mail.
//   purpose=recovery -> veio de "Esqueceu sua senha?"; segue para app/reset-password.tsx
//   purpose=signup   -> confirmação de conta nova;      segue para app/select-role.tsx
export default function VerifyCodeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; purpose?: string }>();
  const email = typeof params.email === 'string' ? params.email : '';
  const purpose: CodePurpose = params.purpose === 'signup' ? 'signup' : 'recovery';

  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [helpOpen, setHelpOpen] = useState(false);
  const verifyingRef = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/login'));

  const submit = async (value: string = code) => {
    if (verifyingRef.current) return; // evita conferir duas vezes (digitar + tocar no botão)
    if (value.length !== OTP_LENGTH) {
      setError(`Digite os ${OTP_LENGTH} dígitos do código.`);
      return;
    }
    verifyingRef.current = true;
    setVerifying(true);
    setError(null);
    setInfo(null);
    const { error: verifyError } = await verifyCode(email, value, purpose);
    verifyingRef.current = false;
    setVerifying(false);

    if (verifyError) {
      setError(verifyError);
      setCode('');
      return;
    }
    if (purpose === 'recovery') router.replace('/reset-password');
    else exitAuthFlow(router, '/select-role');
  };

  const handleResend = async () => {
    setError(null);
    setInfo(null);
    setResending(true);
    const { error: resendError } = await resendCode(email, purpose);
    setResending(false);
    if (resendError) {
      setError(resendError);
      return;
    }
    setCode('');
    setCooldown(RESEND_COOLDOWN_SECONDS);
    setInfo('Enviamos um novo código. O anterior deixou de valer.');
  };

  const isSignup = purpose === 'signup';

  return (
    <AuthShell
      testID="verify-code-screen"
      heroImage={HERO_IMAGES.verify}
      heroBadge="VERIFICAÇÃO EM DUAS ETAPAS"
      eyebrow={isSignup ? 'Etapa 02 • Confirme seu e-mail' : 'Etapa 02 • Autenticação segura'}
      heroTitle="Confirme sua identidade com serenidade."
      heroSubtitle="Para proteger sua conta, enviamos um código temporário de 6 dígitos para o seu e-mail."
      compactHero
      topBar={<BackLink label="Alterar e-mail" onPress={goBack} />}
    >
      <AuthHeading title="Código de verificação" subtitle="Digite o código de 6 dígitos que enviamos para:" />

      {isValidEmail(email) ? (
        <View style={styles.recipient}>
          <Mail size={14} color={RF.moss} />
          <Text style={styles.recipientText} testID="verify-recipient">{maskEmail(email)}</Text>
        </View>
      ) : (
        <AuthNotice kind="error" message="E-mail não informado. Volte e comece de novo." />
      )}

      <View style={[authStyles.form, { marginTop: 20 }]}>
        {error ? <AuthNotice kind="error" message={error} testID="verify-error" /> : null}
        {info ? <AuthNotice kind="success" message={info} testID="verify-info" /> : null}

        <OtpInput
          value={code}
          onChange={(v) => { setCode(v); if (error) setError(null); }}
          onComplete={(v) => submit(v)}
          hasError={!!error}
          editable={!verifying}
        />

        <View style={styles.resendRow}>
          <Text style={styles.resendLabel}>Não recebeu? Veja o spam.</Text>
          {cooldown > 0 ? (
            <Text style={styles.resendWait} testID="verify-cooldown">Reenviar em {formatCountdown(cooldown)}</Text>
          ) : (
            <Text
              style={[styles.resendAction, resending && { opacity: 0.5 }]}
              onPress={resending ? undefined : handleResend}
              accessibilityRole="button"
              testID="verify-resend"
            >
              {resending ? 'ENVIANDO...' : 'REENVIAR CÓDIGO'}
            </Text>
          )}
        </View>

        <AuthButton
          title={isSignup ? 'Confirmar e-mail' : 'Validar código'}
          onPress={() => submit()}
          loading={verifying}
          disabled={code.length !== OTP_LENGTH}
          testID="verify-submit"
        />
      </View>

      {isSignup ? (
        <StepIndicator step={2} title="Criação de conta" labels={['Dados', 'Confirmação', 'Perfil']} />
      ) : (
        <StepIndicator step={2} />
      )}

      <HelpCard title="Dificuldades no acesso?" text="O que fazer se o código não chega." actionText="Ajuda" onPress={() => setHelpOpen(true)} />
      <AccessHelpModal visible={helpOpen} onClose={() => setHelpOpen(false)} />
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  recipient: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: RF.sand, marginTop: -10,
  },
  recipientText: { fontSize: 13, fontWeight: '600', color: RF.moss },
  resendRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  resendLabel: { fontSize: 13, color: RF.muted },
  resendWait: { fontSize: 12, fontWeight: '700', color: RF.gold },
  resendAction: { fontSize: 12, fontWeight: '800', letterSpacing: 1, color: RF.moss, textDecorationLine: 'underline' },
});
