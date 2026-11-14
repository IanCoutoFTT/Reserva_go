import { useRouter } from 'expo-router';
import { ChevronLeft, Lock, Wallet } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { maskCpf, maskPixKey, PIX_KEY_TYPES, validatePayoutForm, type PixKeyType } from '../lib/payout';
import { formatCpf } from '../lib/pix';
import { getMyPayout, PayoutDetails, savePayout } from '../services/payoutService';

// "Dados para receber": nome completo, CPF e chave Pix de quem recebe (anfitrião
// e admin). O banco valida e só o dono enxerga. Esta tela só avisa antes de enviar.
export default function PayoutSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const canReceive = user?.role === 'anfitriao' || user?.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState<PayoutDetails | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const [fullName, setFullName] = useState('');
  const [cpf, setCpf] = useState('');
  const [keyType, setKeyType] = useState<PixKeyType>('cpf');
  const [key, setKey] = useState('');
  const [error, setError] = useState<{ field: 'fullName' | 'cpf' | 'key' | 'form'; message: string } | null>(null);

  const load = useCallback(async () => {
    if (!user?.id || !canReceive) {
      setLoading(false);
      return;
    }
    const { data } = await getMyPayout(user.id);
    setSaved(data && data.pix_key ? data : null);
    setEditing(!(data && data.pix_key));
    setLoading(false);
  }, [user?.id, canReceive]);

  useEffect(() => {
    load();
  }, [load]);

  const startEditing = () => {
    // Não preenche de volta o CPF nem a chave: mostra só máscara na tela de resumo.
    setFullName(saved?.full_name ?? '');
    setCpf('');
    setKey('');
    setKeyType(saved?.pix_key_type ?? 'cpf');
    setError(null);
    setJustSaved(false);
    setEditing(true);
  };

  const submit = async () => {
    if (!user?.id) return;
    const effectiveKey = keyType === 'cpf' ? cpf : key;
    const result = validatePayoutForm({ fullName, cpf, keyType, key: effectiveKey });
    if (!result.ok) {
      setError({ field: result.field, message: result.message });
      return;
    }
    setError(null);
    setSaving(true);
    const { data, error: err } = await savePayout(user.id, result.value);
    setSaving(false);
    if (err || !data) {
      setError({ field: 'form', message: err ?? 'Não foi possível salvar.' });
      return;
    }
    setSaved(data);
    setEditing(false);
    setJustSaved(true);
  };

  const placeholder = PIX_KEY_TYPES.find((t) => t.value === keyType)?.placeholder ?? '';

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} hitSlop={8}>
          <ChevronLeft size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Dados para receber</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2D5A27" />
        </View>
      ) : !canReceive ? (
        <View style={styles.centered}>
          <Text style={styles.muted}>Só anfitriões e administradores cadastram dados de recebimento.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]} keyboardShouldPersistTaps="handled">
          <View style={styles.notice}>
            <Lock size={16} color="#065F46" />
            <Text style={styles.noticeText}>
              Usamos estes dados só para repassar o valor das reservas. Só você consegue ver, e avisamos você sempre que algo mudar.
            </Text>
          </View>

          {!editing && saved ? (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Wallet size={20} color="#2D5A27" />
                <Text style={styles.cardTitle}>Cadastro ativo</Text>
              </View>
              <Text style={styles.label}>Nome completo</Text>
              <Text style={styles.value}>{saved.full_name}</Text>
              <Text style={styles.label}>CPF</Text>
              <Text style={styles.value}>{saved.document ? maskCpf(saved.document) : ''}</Text>
              <Text style={styles.label}>Chave Pix ({PIX_KEY_TYPES.find((t) => t.value === saved.pix_key_type)?.label})</Text>
              <Text style={styles.value}>{saved.pix_key_type && saved.pix_key ? maskPixKey(saved.pix_key_type, saved.pix_key) : ''}</Text>
              {justSaved && <Text style={styles.success}>Dados salvos! Você recebeu um aviso de confirmação.</Text>}
              <TouchableOpacity style={styles.secondaryBtn} onPress={startEditing}>
                <Text style={styles.secondaryBtnText}>Alterar dados</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {saved && <Text style={styles.muted}>Por segurança, informe o CPF e a chave de novo para alterar.</Text>}

              <Text style={styles.label}>Nome completo</Text>
              <TextInput
                style={[styles.input, error?.field === 'fullName' && styles.inputError]}
                value={fullName}
                onChangeText={setFullName}
                placeholder="Como está no seu documento"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="words"
                maxLength={100}
              />
              {error?.field === 'fullName' && <Text style={styles.errorText}>{error.message}</Text>}

              <Text style={styles.label}>CPF</Text>
              <TextInput
                style={[styles.input, error?.field === 'cpf' && styles.inputError]}
                value={cpf}
                onChangeText={(t) => setCpf(formatCpf(t))}
                placeholder="000.000.000-00"
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
                maxLength={14}
              />
              {error?.field === 'cpf' && <Text style={styles.errorText}>{error.message}</Text>}

              <Text style={styles.label}>Tipo da chave Pix</Text>
              <View style={styles.chips}>
                {PIX_KEY_TYPES.map((t) => (
                  <TouchableOpacity
                    key={t.value}
                    style={[styles.chip, keyType === t.value && styles.chipActive]}
                    onPress={() => {
                      setKeyType(t.value);
                      setKey('');
                      setError(null);
                    }}
                  >
                    <Text style={[styles.chipText, keyType === t.value && styles.chipTextActive]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {keyType === 'cpf' ? (
                <Text style={styles.muted}>A chave será o seu CPF, informado acima.</Text>
              ) : (
                <>
                  <Text style={styles.label}>Chave Pix</Text>
                  <TextInput
                    style={[styles.input, error?.field === 'key' && styles.inputError]}
                    value={key}
                    onChangeText={setKey}
                    placeholder={placeholder}
                    placeholderTextColor="#9CA3AF"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType={keyType === 'email' ? 'email-address' : keyType === 'telefone' ? 'phone-pad' : 'default'}
                    maxLength={100}
                  />
                </>
              )}
              {error?.field === 'key' && <Text style={styles.errorText}>{error.message}</Text>}
              {error?.field === 'form' && <Text style={styles.errorText}>{error.message}</Text>}

              <TouchableOpacity style={styles.primaryBtn} onPress={submit} disabled={saving}>
                {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryBtnText}>Salvar dados</Text>}
              </TouchableOpacity>
              {saved && (
                <TouchableOpacity onPress={() => setEditing(false)}>
                  <Text style={styles.linkText}>Cancelar</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1F2937' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  content: { padding: 20, gap: 8 },
  notice: { flexDirection: 'row', gap: 8, backgroundColor: '#ECFDF5', borderRadius: 12, padding: 12, marginBottom: 8 },
  noticeText: { flex: 1, color: '#065F46', fontSize: 13, lineHeight: 18 },
  muted: { fontSize: 14, color: '#6B7280', lineHeight: 20, marginVertical: 4 },
  label: { fontSize: 13, fontWeight: '700', color: '#374151', marginTop: 10 },
  input: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 12, padding: 14, fontSize: 16, color: '#1F2937' },
  inputError: { borderColor: '#DC2626' },
  errorText: { color: '#DC2626', fontSize: 13 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { borderWidth: 1.5, borderColor: '#D1D5DB', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14 },
  chipActive: { borderColor: '#2D5A27', backgroundColor: '#ECFDF5' },
  chipText: { color: '#6B7280', fontWeight: '600' },
  chipTextActive: { color: '#2D5A27' },
  primaryBtn: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#2D5A27', borderRadius: 14, paddingVertical: 14, marginTop: 16 },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  secondaryBtn: { alignItems: 'center', borderWidth: 1.5, borderColor: '#2D5A27', borderRadius: 14, paddingVertical: 12, marginTop: 16 },
  secondaryBtnText: { color: '#2D5A27', fontSize: 15, fontWeight: '700' },
  linkText: { color: '#2D5A27', fontSize: 14, fontWeight: '600', textAlign: 'center', paddingVertical: 10 },
  card: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 16, padding: 16, gap: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#1F2937' },
  value: { fontSize: 16, color: '#1F2937' },
  success: { color: '#2D5A27', fontSize: 13, fontWeight: '600', marginTop: 10 },
});
