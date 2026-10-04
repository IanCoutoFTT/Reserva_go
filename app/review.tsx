import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, Star } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { createReview, hasReviewed } from '../services/reviewService';

export default function ReviewScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { bookingId, propertyId, propertyTitle } = useLocalSearchParams();

  const [checking, setChecking] = useState(true);
  const [alreadyReviewed, setAlreadyReviewed] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user?.id || !bookingId) {
      setChecking(false);
      return;
    }
    // Impede avaliação duplicada (a tabela também tem UNIQUE(booking_id,
    // author_id), mas checar antes evita o usuário preencher tudo pra
    // depois levar um erro).
    hasReviewed(user.id, bookingId as string).then(({ data, error }) => {
      if (error) {
        console.log('[review] hasReviewed falhou ->', error);
      }
      setAlreadyReviewed(!!data);
      setChecking(false);
    });
  }, [user?.id, bookingId]);

  const handleSubmit = async () => {
    if (!user?.id || !bookingId || !propertyId) {
      Alert.alert('Erro', 'Não foi possível identificar essa reserva.');
      return;
    }
    if (rating === 0) {
      Alert.alert('Selecione uma nota', 'Toque nas estrelas para avaliar de 1 a 5.');
      return;
    }

    setSubmitting(true);
    const { error } = await createReview({
      property_id: propertyId as string,
      booking_id: bookingId as string,
      author_id: user.id,
      rating,
      comment: comment.trim(),
    });
    setSubmitting(false);

    if (error) {
      Alert.alert('Erro ao enviar avaliação', error);
      return;
    }

    // reviews_rating_trigger (schema.sql) recalcula properties.rating/
    // reviews_count sozinho - não fazemos essa conta aqui.
    Alert.alert('Obrigado pela avaliação! 🌿', 'Sua opinião ajuda outros viajantes.', [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Avaliar estadia</Text>
        <View style={{ width: 24 }} />
      </View>

      {checking ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2D5A27" />
        </View>
      ) : alreadyReviewed ? (
        <View style={styles.centered}>
          <Text style={styles.infoText}>Você já avaliou essa estadia. Obrigado!</Text>
          <TouchableOpacity style={styles.backLinkBtn} onPress={() => router.back()}>
            <Text style={styles.backLinkText}>Voltar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.propertyTitle}>{propertyTitle}</Text>
          <Text style={styles.label}>Sua nota</Text>
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <TouchableOpacity key={n} onPress={() => setRating(n)} hitSlop={8}>
                <Star size={36} color="#F59E0B" fill={n <= rating ? '#F59E0B' : 'transparent'} />
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Comentário (opcional)</Text>
          <TextInput
            style={styles.textArea}
            placeholder="Conte como foi sua experiência nessa cabana..."
            placeholderTextColor="#9CA3AF"
            value={comment}
            onChangeText={setComment}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
          />

          <TouchableOpacity
            style={[styles.submitButton, submitting && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>Enviar avaliação</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 60, paddingHorizontal: 20, paddingBottom: 20,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  backButton: { padding: 8, marginLeft: -8 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#1F2937' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  infoText: { fontSize: 16, color: '#374151', textAlign: 'center', marginBottom: 20 },
  backLinkBtn: { padding: 10 },
  backLinkText: { color: '#2D5A27', fontWeight: '600', fontSize: 15 },
  scrollContent: { padding: 20, paddingBottom: 60 },
  propertyTitle: { fontSize: 18, fontWeight: 'bold', color: '#1F2937', marginBottom: 20, textAlign: 'center' },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 10 },
  starsRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 24 },
  textArea: {
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 14,
    fontSize: 15, color: '#1F2937', backgroundColor: '#F9FAFB', height: 120, marginBottom: 24,
  },
  submitButton: { backgroundColor: '#2D5A27', paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
