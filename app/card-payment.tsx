import { useStripe } from '@stripe/stripe-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CheckCircle2, ChevronLeft, Clock, CreditCard, ShieldCheck } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isStripeTestKey, TEST_CARD_NUMBER } from '../lib/card';
import { formatCountdown, secondsLeft } from '../lib/pix';
import { formatCurrency } from '../lib/format';
import { useOnAppActive } from '../lib/useOnAppActive';
import { createCardIntent, getPaymentByBooking, Payment } from '../services/paymentService';

const POLL_MS = 2500;
const CONFIRM_TIMEOUT_MS = 60_000;

// Tela de pagamento por cartão da reserva. Só é aberta quando o build tem o cartão
// ligado (EXPO_PUBLIC_CARD_ENABLED + chave publicável; ver app/details.tsx).
// O número do cartão é digitado na tela da PRÓPRIA Stripe (PaymentSheet) e vai direto
// para ela: o ReservaGO nunca vê nem guarda dados de cartão. O valor vem do banco, e a
// confirmação chega pelo webhook da Stripe, que esta tela só espera.
export default function CardPaymentScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const params = useLocalSearchParams<{ bookingId?: string | string[] }>();
  const bookingId = Array.isArray(params.bookingId) ? params.bookingId[0] : params.bookingId;

  const [payment, setPayment] = useState<Payment | null>(null);
  const [ready, setReady] = useState(false); // tela de pagamento da Stripe pronta para abrir
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [confirming, setConfirming] = useState(false); // cartão aceito, esperando o webhook
  const [slow, setSlow] = useState(false); // webhook demorou mais que o esperado
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(0);
  const mounted = useRef(true);
  const confirmStart = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const prepare = useCallback(async () => {
    if (!bookingId) {
      setError('Reserva não identificada.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setReady(false);
    const { data, error: err } = await createCardIntent(bookingId);
    if (!mounted.current) return;
    if (err || !data) {
      setError(err ?? 'Não foi possível preparar o pagamento.');
      setLoading(false);
      return;
    }
    setPayment(data.payment);
    const init = await initPaymentSheet({
      merchantDisplayName: 'ReservaGO',
      paymentIntentClientSecret: data.clientSecret,
      allowsDelayedPaymentMethods: false,
    });
    if (!mounted.current) return;
    if (init.error) setError('Não foi possível abrir a tela de pagamento. Tente novamente.');
    else setReady(true);
    setLoading(false);
  }, [bookingId, initPaymentSheet]);

  useEffect(() => {
    prepare();
  }, [prepare]);

  const refreshStatus = useCallback(async () => {
    if (!bookingId) return;
    const { data } = await getPaymentByBooking(bookingId);
    if (data && mounted.current) setPayment(data);
  }, [bookingId]);

  const waiting = payment?.status === 'aguardando';

  // Depois que o cartão é aceito, confere a confirmação (webhook) de tempos em tempos.
  useEffect(() => {
    if (!confirming || !waiting) return;
    const id = setInterval(() => {
      refreshStatus();
      if (Date.now() - confirmStart.current > CONFIRM_TIMEOUT_MS) setSlow(true);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [confirming, waiting, refreshStatus]);
  useOnAppActive(refreshStatus, waiting);

  // Contagem regressiva do prazo.
  useEffect(() => {
    if (!payment || !waiting) return;
    const tick = () => setLeft(secondsLeft(payment.expires_at));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [payment, waiting]);

  const pay = async () => {
    setPaying(true);
    setError(null);
    const { error: err } = await presentPaymentSheet();
    if (!mounted.current) return;
    setPaying(false);
    if (!err) {
      confirmStart.current = Date.now();
      setSlow(false);
      setConfirming(true);
      await refreshStatus();
      return;
    }
    if (err.code === 'Canceled') return; // fechou a tela de pagamento: nada a avisar
    setError(err.message || 'O pagamento não foi concluído. Confira os dados do cartão e tente de novo.');
    // A Stripe só aceita tentar de novo com a tela preparada de novo.
    prepare();
  };

  const goToTrips = () => router.replace('/(tabs)/bookings');
  const expired = !!payment && waiting && left === 0 && !confirming;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={goToTrips} style={styles.backButton} hitSlop={8}>
          <ChevronLeft size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Pagamento no cartão</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading && !payment ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2D5A27" />
          <Text style={styles.muted}>Preparando o pagamento...</Text>
        </View>
      ) : error && !payment ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={prepare}>
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
      ) : payment && (expired || payment.status === 'expirado' || payment.status === 'falhou') ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>O prazo para pagar acabou.</Text>
          <Text style={styles.muted}>A reserva é cancelada e as datas ficam livres. Faça uma nova reserva para tentar de novo.</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={goToTrips}>
            <Text style={styles.primaryBtnText}>Ver minhas viagens</Text>
          </TouchableOpacity>
        </View>
      ) : confirming && payment ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2D5A27" />
          <Text style={styles.title}>Confirmando o pagamento...</Text>
          <Text style={styles.muted}>
            {slow
              ? 'Está demorando mais que o normal. Você já pode sair: a confirmação aparece em Minhas Viagens assim que chegar.'
              : 'O cartão foi aceito. Só estamos esperando a confirmação do banco.'}
          </Text>
          {slow && (
            <TouchableOpacity style={styles.primaryBtn} onPress={goToTrips}>
              <Text style={styles.primaryBtnText}>Ver minhas viagens</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : payment ? (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}>
          {isStripeTestKey() && (
            <View style={styles.testBanner}>
              <Text style={styles.testBannerText}>Modo de teste: nenhum dinheiro é cobrado de verdade.</Text>
              <Text style={styles.testBannerText}>Cartão de teste: {TEST_CARD_NUMBER}, validade futura e qualquer CVC.</Text>
            </View>
          )}

          <Text style={styles.amount}>{formatCurrency(Number(payment.amount))}</Text>

          <View style={styles.timerRow}>
            <Clock size={16} color="#B45309" />
            <Text style={styles.timerText}>Pague em {formatCountdown(left)} para garantir a reserva</Text>
          </View>

          <TouchableOpacity style={[styles.primaryBtn, (!ready || paying) && styles.btnDisabled]} onPress={pay} disabled={!ready || paying}>
            {paying ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <CreditCard size={18} color="#FFFFFF" />
                <Text style={styles.primaryBtnText}>Pagar com cartão</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.secureRow}>
            <ShieldCheck size={16} color="#2D5A27" />
            <Text style={styles.secureText}>O número do cartão é digitado na tela segura da Stripe. O ReservaGO não vê nem guarda esses dados.</Text>
          </View>

          {!!error && <Text style={styles.errorText}>{error}</Text>}

          <TouchableOpacity onPress={goToTrips}>
            <Text style={styles.linkText}>Pagar depois (ver minhas viagens)</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : null}
    </View>
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
  primaryBtn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2D5A27', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24 },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  btnDisabled: { opacity: 0.55 },
  secureRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  secureText: { flex: 1, fontSize: 12, color: '#6B7280', lineHeight: 17 },
  linkText: { color: '#2D5A27', fontSize: 14, fontWeight: '600', textAlign: 'center', paddingVertical: 6 },
  errorText: { color: '#DC2626', fontSize: 14, textAlign: 'center' },
  testBanner: { backgroundColor: '#FEF3C7', borderRadius: 10, padding: 10, gap: 4 },
  testBannerText: { color: '#92400E', fontSize: 13, textAlign: 'center', fontWeight: '600' },
});
