import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { RF, SERIF } from '../../constants/Refugio';
import { OTP_LENGTH, sanitizeOtp } from '../../lib/authValidation';

type Props = {
  value: string;
  onChange: (code: string) => void;
  /** Chamado quando os dígitos ficam completos (digitando ou colando). */
  onComplete?: (code: string) => void;
  length?: number;
  hasError?: boolean;
  editable?: boolean;
};

/**
 * Código de N dígitos em caixinhas. Por baixo é UM TextInput invisível que
 * cobre as caixas: assim colar "123456", o preenchimento automático do
 * teclado (iOS "From Mail" / Android) e o apagar funcionam sem pular foco
 * entre vários inputs.
 */
export function OtpInput({ value, onChange, onComplete, length = OTP_LENGTH, hasError, editable = true }: Props) {
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const digits = value.split('');

  const handleChange = (text: string) => {
    const clean = sanitizeOtp(text, length);
    onChange(clean);
    if (clean.length === length) onComplete?.(clean);
  };

  return (
    <Pressable onPress={() => inputRef.current?.focus()} style={styles.wrap} accessibilityLabel={`Código de ${length} dígitos`}>
      <View style={styles.row} pointerEvents="none">
        {Array.from({ length }).map((_, i) => {
          const isActive = focused && (i === value.length || (i === length - 1 && value.length === length));
          return (
            <View
              key={i}
              style={[styles.box, !!digits[i] && styles.boxFilled, isActive && styles.boxActive, hasError && styles.boxError]}
            >
              <Text style={styles.digit}>{digits[i] ?? ''}</Text>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={inputRef}
        testID="otp-input"
        value={value}
        onChangeText={handleChange}
        keyboardType="number-pad"
        inputMode="numeric"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={length}
        caretHidden
        editable={editable}
        autoFocus
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={styles.hiddenInput}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  row: { flexDirection: 'row', gap: 8 },
  box: {
    flex: 1, aspectRatio: 0.9, maxHeight: 64, borderRadius: 14,
    backgroundColor: RF.sand, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'transparent',
  },
  boxFilled: { backgroundColor: RF.white, borderColor: RF.border },
  boxActive: { borderColor: RF.gold, backgroundColor: RF.white },
  boxError: { borderColor: RF.error },
  digit: { fontFamily: SERIF, fontSize: 24, fontWeight: '600', color: RF.pine },
  hiddenInput: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.011, // 0 desliga o toque em alguns Androids
    color: 'transparent',
    fontSize: 1,
  },
});
