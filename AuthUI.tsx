import { AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle2, Eye, EyeOff, LifeBuoy } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import React, { forwardRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
} from 'react-native';
import { RF, SERIF } from '../../constants/Refugio';

// Peças pequenas das telas de acesso (estilo "Refúgio").

export function AuthHeading({ kicker, title, subtitle }: { kicker?: string; title: string; subtitle?: string }) {
  return (
    <View style={styles.heading}>
      {kicker ? <Text style={styles.kicker}>{kicker}</Text> : null}
      <Text style={styles.title} accessibilityRole="header">{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export type AuthFieldProps = TextInputProps & {
  label: string;
  icon: LucideIcon;
  /** Campo de senha com botão de mostrar/ocultar. */
  password?: boolean;
  error?: string | null;
  /** Link pequeno à direita do rótulo (ex.: "Esqueceu sua senha?"). */
  labelAction?: { text: string; onPress: () => void };
};

export const AuthField = forwardRef<TextInput, AuthFieldProps>(function AuthField(
  { label, icon: Icon, password, error, labelAction, style, onFocus, onBlur, ...inputProps },
  ref
) {
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {labelAction ? (
          <Text style={styles.labelAction} onPress={labelAction.onPress} accessibilityRole="link">
            {labelAction.text}
          </Text>
        ) : null}
      </View>
      <View style={[styles.inputWrap, focused && styles.inputWrapFocused, !!error && styles.inputWrapError]}>
        <Icon size={19} color={focused ? RF.moss : '#A8A29E'} strokeWidth={1.7} />
        <TextInput
          ref={ref}
          style={[styles.input, style]}
          placeholderTextColor="#A8A29E"
          secureTextEntry={password && !visible}
          autoCapitalize="none"
          autoCorrect={false}
          onFocus={(e) => { setFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
          accessibilityLabel={label}
          {...inputProps}
        />
        {password ? (
          <Pressable
            onPress={() => setVisible((v) => !v)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={visible ? 'Ocultar senha' : 'Mostrar senha'}
          >
            {visible ? <EyeOff size={19} color="#A8A29E" /> : <Eye size={19} color="#A8A29E" />}
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
});

export function AuthButton({
  title,
  onPress,
  loading,
  disabled,
  variant = 'primary',
  icon,
  testID,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'outline';
  icon?: React.ReactNode;
  testID?: string;
}) {
  const isPrimary = variant === 'primary';
  const blocked = disabled || loading;
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      disabled={blocked}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!blocked, busy: !!loading }}
      style={[styles.button, isPrimary ? styles.buttonPrimary : styles.buttonOutline, blocked && styles.buttonBlocked]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? RF.white : RF.moss} />
      ) : (
        <>
          {!isPrimary && icon ? icon : null}
          <Text style={isPrimary ? styles.buttonPrimaryText : styles.buttonOutlineText}>{title}</Text>
          {isPrimary ? (icon ?? <ArrowRight size={17} color={RF.white} />) : null}
        </>
      )}
    </TouchableOpacity>
  );
}

export function AuthNotice({ kind, title, message, testID }: { kind: 'error' | 'success'; title?: string; message: string; testID?: string }) {
  const isError = kind === 'error';
  const Icon = isError ? AlertCircle : CheckCircle2;
  return (
    <View
      testID={testID}
      accessibilityLiveRegion="polite"
      style={[styles.notice, isError ? styles.noticeError : styles.noticeSuccess]}
    >
      <Icon size={18} color={isError ? RF.error : RF.success} />
      <View style={{ flex: 1 }}>
        {title ? <Text style={[styles.noticeTitle, { color: isError ? RF.error : RF.pine }]}>{title}</Text> : null}
        <Text style={[styles.noticeText, { color: isError ? RF.error : RF.moss }]}>{message}</Text>
      </View>
    </View>
  );
}

export function BackLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.backLink} accessibilityRole="link" hitSlop={8}>
      <ArrowLeft size={16} color={RF.moss} />
      <Text style={styles.backLinkText}>{label}</Text>
    </TouchableOpacity>
  );
}

const STEP_LABELS = ['Identificação', 'Verificação', 'Nova senha'];

/** Régua "Fluxo de restauração - passo X de 3". */
export function StepIndicator({ step, labels = STEP_LABELS, title = 'Recuperação de acesso' }: { step: 1 | 2 | 3; labels?: string[]; title?: string }) {
  return (
    <View style={styles.steps} accessibilityLabel={`${title}, passo ${step} de ${labels.length}`}>
      <View style={styles.stepsHeader}>
        <Text style={styles.stepsTitle}>{title.toUpperCase()}</Text>
        <Text style={styles.stepsCount}>Passo {step} de {labels.length}</Text>
      </View>
      <View style={styles.stepsBar}>
        {labels.map((_, i) => (
          <View
            key={i}
            style={[styles.stepsSegment, i + 1 < step && styles.stepsDone, i + 1 === step && styles.stepsCurrent]}
          />
        ))}
      </View>
      <View style={styles.stepsLabels}>
        {labels.map((label, i) => (
          <View key={label} style={styles.stepsLabelWrap}>
            {i + 1 < step ? <Check size={11} color={RF.moss} /> : null}
            <Text style={[styles.stepsLabel, i + 1 === step && styles.stepsLabelCurrent]}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Caixa "Problemas com o acesso?" com ação à direita. */
export function HelpCard({ title, text, actionText, onPress }: { title: string; text: string; actionText: string; onPress: () => void }) {
  return (
    <View style={styles.help}>
      <View style={styles.helpIcon}>
        <LifeBuoy size={18} color={RF.moss} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.helpTitle}>{title}</Text>
        <Text style={styles.helpText}>{text}</Text>
      </View>
      <Text style={styles.helpAction} onPress={onPress} accessibilityRole="button">
        {actionText.toUpperCase()}
      </Text>
    </View>
  );
}

export function Divider({ text }: { text: string }) {
  return (
    <View style={styles.divider}>
      <View style={styles.dividerLine} />
      <Text style={styles.dividerText}>{text.toUpperCase()}</Text>
      <View style={styles.dividerLine} />
    </View>
  );
}

export const authStyles = StyleSheet.create({
  form: { gap: 18 },
  center: { textAlign: 'center' },
  smallText: { fontSize: 13, color: RF.muted, textAlign: 'center', lineHeight: 19 },
  link: { color: RF.moss, fontWeight: '700', textDecorationLine: 'underline' },
});

const styles = StyleSheet.create({
  heading: { marginBottom: 24 },
  kicker: { fontSize: 11, fontWeight: '700', letterSpacing: 2, color: RF.sage, textTransform: 'uppercase', marginBottom: 8 },
  title: { fontFamily: SERIF, fontSize: 30, lineHeight: 37, color: RF.pine },
  subtitle: { fontSize: 14, lineHeight: 21, color: RF.muted, marginTop: 8 },

  field: { gap: 7 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, color: RF.pine, textTransform: 'uppercase' },
  labelAction: { fontSize: 12, fontWeight: '600', color: RF.sage, textDecorationLine: 'underline' },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: RF.white, borderWidth: 1, borderColor: RF.border, borderRadius: 14,
    paddingHorizontal: 14, minHeight: 54,
  },
  inputWrapFocused: { borderColor: RF.moss, shadowColor: RF.moss, shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 0 }, elevation: 1 },
  inputWrapError: { borderColor: RF.error },
  // outlineStyle: tira a borda preta de foco do navegador (web); a moldura verde já indica o foco.
  input: { flex: 1, fontSize: 15, color: '#292524', paddingVertical: 14, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null) },
  fieldError: { fontSize: 12, color: RF.error },

  button: {
    minHeight: 56, borderRadius: 999, paddingHorizontal: 24,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  buttonPrimary: {
    backgroundColor: RF.darkmoss,
    shadowColor: RF.darkmoss, shadowOpacity: 0.22, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 3,
  },
  buttonOutline: { backgroundColor: RF.white, borderWidth: 1, borderColor: RF.border },
  buttonBlocked: { opacity: 0.55 },
  buttonPrimaryText: { color: RF.white, fontSize: 13, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase' },
  buttonOutlineText: { color: '#44403C', fontSize: 14, fontWeight: '600' },

  notice: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 14, borderWidth: 1 },
  noticeError: { backgroundColor: RF.errorBg, borderColor: '#FECDCA' },
  noticeSuccess: { backgroundColor: RF.successBg, borderColor: 'rgba(35,63,49,0.2)' },
  noticeTitle: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  noticeText: { fontSize: 13, lineHeight: 19 },

  backLink: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  backLinkText: { fontSize: 12, fontWeight: '700', letterSpacing: 1.2, color: RF.moss, textTransform: 'uppercase' },

  steps: { marginTop: 28, paddingTop: 20, borderTopWidth: 1, borderTopColor: RF.divider },
  stepsHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  stepsTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 1.4, color: RF.warmgray },
  stepsCount: { fontSize: 11, fontWeight: '700', color: RF.gold },
  stepsBar: { flexDirection: 'row', gap: 6 },
  stepsSegment: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(22,40,31,0.12)' },
  stepsDone: { backgroundColor: RF.moss },
  stepsCurrent: { backgroundColor: RF.gold },
  stepsLabels: { flexDirection: 'row', marginTop: 8 },
  stepsLabelWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 },
  stepsLabel: { fontSize: 11, color: RF.warmgray },
  stepsLabelCurrent: { color: RF.pine, fontWeight: '700' },

  help: {
    marginTop: 20, padding: 14, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.75)',
    borderWidth: 1, borderColor: 'rgba(22,40,31,0.1)', flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  helpIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(197,168,128,0.2)', alignItems: 'center', justifyContent: 'center' },
  helpTitle: { fontSize: 13, fontWeight: '700', color: RF.pine },
  helpText: { fontSize: 12, color: RF.warmgray, marginTop: 1 },
  helpAction: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: RF.moss, textDecorationLine: 'underline' },

  divider: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: RF.divider },
  dividerText: { fontSize: 10, fontWeight: '600', letterSpacing: 1.4, color: '#A8A29E' },
});
