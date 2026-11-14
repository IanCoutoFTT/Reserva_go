import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CheckCircle2, ChevronLeft, Clock, Copy, QrCode } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
import { formatCurrency } from '../lib/format';
import { formatCpf, formatCountdown, PIX_SIMULATION, secondsLeft } from '../lib/pix';
import { useOnAppActive } from '../lib/useOnAppActive';
import { createPixCharge, getPaymentByBooking, Payment, simulatePixPayment } from '../services/paymentService';

const POLL_MS = 4000;

// Tela de pagamento Pix da reserva. Só é aberta quando o build tem
// EXPO_PUBLIC_PIX_ENABLED=true (ver app/details.tsx). O valor e a divisão entre
// anfitrião e plataforma vêm do banco: aqui só se mostra o código e se espera a
// confirmação, que chega pelo webhook do provedor.
export default function PixPaymentScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ bookingId?: string | string[] }>();
  const bookingId = Array.isArray(params.bookingId) ? params.bookingId[0] : params.bookingId;

  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needCpf, setNeedCpf] = useState(false);
  const [cpf, setCpf] = useState('');
  const [copied, setCopied] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [left, setLeft] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const createCharge = useCallback(
    async (cpfValue?: string) => {
      if (!bookingId) {
        setError('Reserva não identificada.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      const { data, error: err, code } = await createPixCharge(bookingId, cpfValue);
      if (!mounted.current) return;
      if (code === 'cpf_required') {
        setNeedCpf(true);
        if (cpfValue) setError(err); // digitou e o servidor recusou
      } else if (err || !data) {
        setError(err ?? 'Não foi possível gerar o Pix.');
      } else {
        setNeedCpf(false);
        setPayment(data);
      }
      setLoading(false);
    },
    [bookingId]
  );

  useEffect(() => {
    createCharge();
  }, [createCharge]);

  const refreshStatus = useCallback(async () => {
    if (!bookingId) return;
    const { data } = await getPaymentByBooking(bookingId);
    if (data && mounted.current) setPayment(data);
  }, [bookingId]);

  const waiting = payment?.status === 'aguardando';

  // Confere o pagamento de tempos em tempos enquanto espera, e ao voltar do segundo plano.
  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(refreshStatus, POLL_MS);
    return () => clearInterval(id);
  }, [waiting, refreshStatus]);
  useOnAppActive(refreshStatus, waiting);

  // Contagem regressiva do prazo.
  useEffect(() => {
    if (!payment || !waiting) return;
    const tick = () => setLeft(secondsLeft(payment.expires_at));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [payment, waiting]);

  const copyCode = async () => {
    if (!payment?.pix_copy_paste) return;
    await Clipboard.setStringAsync(payment.pix_copy_paste);
    setCopied(true);
    setTimeout(() => mounted.current && setCopied(false), 2000);
  };

  const simulate = async () => {
    if (!bookingId) return;
    setSimulating(true);
    const { error: err } = await simulatePixPayment(bookingId);
    if (!mounted.current) return;
    setSimulating(false);
    if (err) setError(err);
    else await refreshStatus();
  };

  const goToTrips = () => router.replace('/(tabs)/bookings');

  const expired = !!payment && waiting && left === 0;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={goToTrips} style={styles.backButton} hitSlop={8}>
          <ChevronLeft size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Pagamento por Pix</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading && !payment ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2D5A27" />
          <Text style={styles.muted}>Gerando o Pix...</Text>
        </View>
      ) : needCpf ? (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Falta só o seu CPF</Text>
          <Text style={styles.muted}>O banco exige o CPF de quem paga para gerar o Pix. Ele é enviado só ao serviço de pagamento.</Text>
          <TextInput
            style={styles.input}
            value={cpf}
            onChangeText={(t) => setCpf(formatCpf(t))}
            placeholder="000.000.000-00"
            placeholderTextColor="#9CA3AF"
            keyboardType="number-pad"
            maxLength={14}
          />
          {!!error && <Text style={styles.errorText}>{error}</Text>}
          <TouchableOpacity style={styles.primaryBtn} onPress={() => createCharge(cpf)} disabled={loading}>
            {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryBtnText}>Gerar Pix</Text>}
          </TouchableOpacity>
        </ScrollView>
      ) : error && !payment ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => createCharge()}>
            <Text style={styles.primaryBtnText}>Tentar de novo</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={goToTrips}>
            <Text style={styles.linkText}>Ver minhas viagens</Text>
          </TouchableOpacity>
        </View>
      ) : payment?.status === 'pago' ? (
        <View style={styles.centered}>
          <CheckCircle2 size={64} color="#2D5A27" />
          <Text style={styles.title}>Pagamento confirmado!</Text>
          <Text style={styles.muted}>Recebemos {formatCurrency(Number(payment.amount))}. Sua reserva está garantida.</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={goToTrips}>
            <Text style={styles.primaryBtnText}>Ver minhas viagens</Text>
          </TouchableOpacity>
        </View>
      ) : payment ? (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}>
          {PIX_SIMULATION && (
            <View style={styles.testBanner}>
              <Text style={styles.testBannerText}>Modo de teste: nenhum dinheiro é cobrado de verdade.</Text>
            </View>
          )}

          <Text style={styles.amount}>{formatCurrency(Number(payment.amount))}</Text>

          {payment.status === 'aguardando' && !expired && (
            <View style={styles.timerRow}>
              <Clock size={16} color="#B45309" />
              <Text style={styles.timerText}>Pague em {formatCountdown(left)} para garantir a reserva</Text>
            </View>
          )}

          {expired || payment.status === 'expirado' || payment.status === 'falhou' ? (
            <View style={styles.expiredBox}>
              <Text style={styles.errorText}>O prazo para pagar acabou.</Text>
              <Text style={styles.muted}>A reserva é cancelada e as datas ficam livres. Faça uma nova reserva para tentar de novo.</Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={goToTrips}>
                <Text style={styles.primaryBtnText}>Ver minhas viagens</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {payment.pix_qr_image ? (
                <Image source={{ uri: `data:image/png;base64,${payment.pix_qr_image}` }} style={styles.qr} resizeMode="contain" />
              ) : (
                <View style={[styles.qr, styles.qrPlaceholder]}>
                  <QrCode size={64} color="#9CA3AF" />
                  <Text style={styles.qrPlaceholderText}>QR Code indisponível. Use o código abaixo.</Text>
                </View>
              )}

              <Text style={styles.label}>Pix copia e cola</Text>
              <Text style={styles.code} selectable numberOfLines={4}>
                {payment.pix_copy_paste}
              </Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={copyCode}>
                <Copy size={18} color="#FFFFFF" />
                <Text style={styles.primaryBtnText}>{copied ? 'Código copiado!' : 'Copiar código'}</Text>
              </TouchableOpacity>
              <Text style={styles.muted}>Abra o app do seu banco, escolha Pix e cole o código. A confirmação aparece aqui sozinha.</Text>

              {PIX_SIMULATION && (
                <TouchableOpacity style={styles.secondaryBtn} onPress={simulate} disabled={simulating}>
                  {simulating ? <ActivityIndicator color="#2D5A27" /> : <Text style={styles.secondaryBtnText}>Simular pagamento (teste)</Text>}
                </TouchableOpacity>
              )}
              {!!error && <Text style={styles.errorText}>{error}</Text>}

              <TouchableOpacity onPress={goToTrips}>
                <Text style={styles.linkText}>Pagar depois (ver minhas viagens)</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1F2937' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  content: { padding: 20, gap: 14, alignItems: 'stretch' },
  title: { fontSize: 22, fontWeight: '800', color: '#1F2937', textAlign: 'center' },
  muted: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 20 },
  amount: { fontSize: 34, fontWeight: '800', color: '#2D5A27', textAlign: 'center' },
  timerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  timerText: { fontSize: 14, fontWeight: '600', color: '#B45309' },
  qr: { width: 220, height: 220, alignSelf: 'center', borderRadius: 12 },
  qrPlaceholder: { backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 },
  qrPlaceholderText: { fontSize: 12, color: '#6B7280', textAlign: 'center' },
  label: { fontSize: 13, fontWeight: '700', color: '#374151' },
  code: { fontSize: 12, color: '#374151', backgroundColor: '#F9FAFB', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  input: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 12, padding: 14, fontSize: 18, color: '#1F2937', textAlign: 'center' },
  primaryBtn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2D5A27', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24 },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  secondaryBtn: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#2D5A27', borderRadius: 14, paddingVertical: 12 },
  secondaryBtnText: { color: '#2D5A27', fontSize: 15, fontWeight: '700' },
  linkText: { color: '#2D5A27', fontSize: 14, fontWeight: '600', textAlign: 'center', paddingVertical: 6 },
  errorText: { color: '#DC2626', fontSize: 14, textAlign: 'center' },
  expiredBox: { gap: 12, alignItems: 'stretch' },
  testBanner: { backgroundColor: '#FEF3C7', borderRadius: 10, padding: 10 },
  testBannerText: { color: '#92400E', fontSize: 13, textAlign: 'center', fontWeight: '600' },
});
