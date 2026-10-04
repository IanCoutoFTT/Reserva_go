import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, FlatList, Image, TouchableOpacity, Alert } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useListings } from '../../context/ListingContext';
import { useBookings } from '../../context/BookingContext';
import { Calendar, MapPin, ChevronRight, X, CreditCard, Star } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { cancelBooking as cancelBookingRemote, getBookingsByGuest } from '../../services/bookingService';
import type { BookingWithProperty } from '../../services/types';
import { formatCurrency } from '../../lib/format';

// Linha unificada de exibição - pode vir de uma reserva real (Supabase,
// com id de verdade) ou de uma reserva local (BookingContext/AsyncStorage,
// sem id - usuário estático ou fallback de quando o Supabase falhou).
type BookingRow = {
  key: string;
  isReal: boolean;
  bookingId?: string;
  propertyId: string;
  propertyTitle: string;
  propertyImage?: string | null;
  propertyLocation: string;
  status: string;
  checkInLabel: string;
  checkOutLabel: string;
  checkOutDate?: Date;
  nights?: number;
  total?: number;
  payMethod?: string;
};

function isoToBR(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export default function BookingsScreen() {
  const { user } = useAuth();
  const { bookings: localBookings, cancelBooking: cancelLocalBooking } = useBookings();
  const { allProperties } = useListings();
  const router = useRouter();

  // Usuário estático (__DEV__) não existe em profiles/auth - só mostra as
  // reservas locais, como sempre funcionou.
  const isStaticUser = !!user?.id && user.id.startsWith('static-');
  const [remoteBookings, setRemoteBookings] = useState<BookingWithProperty[] | null>(null);
  const [loading, setLoading] = useState(!isStaticUser);

  const loadRemote = () => {
    if (isStaticUser || !user?.id) {
      setRemoteBookings(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    getBookingsByGuest(user.id).then(({ data, error }) => {
      if (error || !data) {
        console.log('[bookings] getBookingsByGuest falhou, mostrando só as locais ->', error);
        setRemoteBookings(null);
      } else {
        setRemoteBookings(data);
      }
      setLoading(false);
    });
  };

  useEffect(() => {
    loadRemote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStaticUser, user?.id]);

  // Um usuário real pode ter as duas coisas ao mesmo tempo: reservas reais
  // (criadas em app/details.tsx via bookingService) e reservas locais
  // antigas ou criadas como fallback quando o Supabase falhou - por isso
  // aqui é junção, não "remoto OU local" como nas outras telas.
  const rows: BookingRow[] = useMemo(() => {
    const remoteRows: BookingRow[] = (remoteBookings ?? []).map((b) => ({
      key: b.id,
      isReal: true,
      bookingId: b.id,
      propertyId: b.property_id,
      propertyTitle: b.properties?.title ?? 'Cabana',
      propertyImage: b.properties?.images?.[0] ?? null,
      propertyLocation: b.properties?.location ?? '',
      status: b.status,
      checkInLabel: isoToBR(b.check_in),
      checkOutLabel: isoToBR(b.check_out),
      checkOutDate: new Date(b.check_out),
      nights: b.nights,
      total: b.total,
      payMethod: b.pay_method,
    }));

    const localRows: BookingRow[] = localBookings.map((b, index) => {
      const property = allProperties.find((p) => p.id === b.propertyId);
      return {
        key: `local-${index}-${b.propertyId}`,
        isReal: false,
        propertyId: b.propertyId,
        propertyTitle: property?.title ?? 'Cabana',
        propertyImage: property?.image ?? null,
        propertyLocation: property?.location ?? '',
        status: b.status,
        checkInLabel: b.checkIn ?? b.date,
        checkOutLabel: b.checkOut ?? '',
        nights: b.nights,
        total: b.total,
        payMethod: b.payMethod,
      };
    });

    return [...remoteRows, ...localRows];
  }, [remoteBookings, localBookings, allProperties]);

  const handleCancel = (row: BookingRow) => {
    Alert.alert(
      'Cancelar reserva',
      `Tem certeza que deseja cancelar a reserva de "${row.propertyTitle}"?`,
      [
        { text: 'Não', style: 'cancel' },
        {
          text: 'Sim, cancelar',
          style: 'destructive',
          onPress: async () => {
            if (row.isReal && row.bookingId) {
              const { error } = await cancelBookingRemote(row.bookingId);
              if (error) {
                Alert.alert('Erro', 'Não foi possível cancelar agora. Tente novamente.');
                return;
              }
              loadRemote();
            } else {
              cancelLocalBooking(row.propertyId);
            }
          },
        },
      ]
    );
  };

  const goToReview = (row: BookingRow) => {
    router.push({
      pathname: '/review',
      params: { bookingId: row.bookingId, propertyId: row.propertyId, propertyTitle: row.propertyTitle },
    });
  };

  const renderBookingItem = ({ item }: { item: BookingRow }) => {
    const isActive = item.status === 'reservada';
    const canReview =
      item.isReal && item.status !== 'cancelada' && !!item.checkOutDate && item.checkOutDate < new Date();

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() =>
          router.push({
            pathname: '/details',
            params: { id: item.propertyId, title: item.propertyTitle, location: item.propertyLocation, image: item.propertyImage },
          })
        }
      >
        <Image source={{ uri: item.propertyImage ?? undefined }} style={styles.cardImage} />
        <View style={styles.cardInfo}>
          <View style={styles.statusContainer}>
            <View style={[styles.statusDot, { backgroundColor: isActive ? '#2D5A27' : '#9CA3AF' }]} />
            <Text style={styles.statusText}>
              {item.status === 'cancelada' ? 'Cancelada' : isActive ? 'Confirmada' : 'Realizada'}
            </Text>
          </View>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.propertyTitle}</Text>
          <View style={styles.detailsRow}>
            <Calendar size={12} color="#6B7280" />
            <Text style={styles.detailText}>
              {item.checkInLabel && item.checkOutLabel
                ? `${item.checkInLabel} → ${item.checkOutLabel}${item.nights ? ` · ${item.nights} noite${item.nights > 1 ? 's' : ''}` : ''}`
                : item.checkInLabel}
            </Text>
          </View>
          <View style={styles.detailsRow}>
            <MapPin size={12} color="#6B7280" />
            <Text style={styles.detailText} numberOfLines={1}>{item.propertyLocation}</Text>
          </View>
          {item.total != null && (
            <View style={styles.detailsRow}>
              <CreditCard size={12} color="#6B7280" />
              <Text style={styles.detailText}>
                {item.payMethod === 'pix' ? 'PIX' : 'Cartão'} · {formatCurrency(Number(item.total))}
              </Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {isActive && (
              <TouchableOpacity style={styles.cancelBtn} onPress={() => handleCancel(item)}>
                <X size={12} color="#EF4444" />
                <Text style={styles.cancelBtnText}>Cancelar reserva</Text>
              </TouchableOpacity>
            )}
            {canReview && (
              <TouchableOpacity style={styles.reviewBtn} onPress={() => goToReview(item)}>
                <Star size={12} color="#2D5A27" />
                <Text style={styles.reviewBtnText}>Avaliar</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        <ChevronRight size={20} color="#E5E7EB" style={{ alignSelf: 'center' }} />
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Minhas Viagens</Text>
      </View>
      {loading ? (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color="#2D5A27" />
        </View>
      ) : rows.length > 0 ? (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.key}
          renderItem={renderBookingItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconCircle}>
            <Calendar size={40} color="#2D5A27" />
          </View>
          <Text style={styles.emptyTitle}>Ainda não tens reservas</Text>
          <Text style={styles.emptySub}>
            As tuas próximas aventuras aparecerão aqui assim que clicares em reservar.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  title: { fontSize: 26, fontWeight: 'bold', color: '#1F2937' },
  list: { padding: 20, paddingBottom: 100 },
  card: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: '#F3F4F6', overflow: 'hidden', elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5 },
  cardImage: { width: 100, height: '100%', minHeight: 130 },
  cardInfo: { padding: 12, flex: 1, justifyContent: 'center' },
  statusContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  statusText: { fontSize: 11, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase' },
  cardTitle: { fontSize: 15, fontWeight: 'bold', color: '#1F2937', marginBottom: 4 },
  detailsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  detailText: { fontSize: 13, color: '#6B7280', marginLeft: 5 },
  cancelBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, paddingVertical: 5, paddingHorizontal: 8, backgroundColor: '#FEF2F2', borderRadius: 8, alignSelf: 'flex-start' },
  cancelBtnText: { fontSize: 12, color: '#EF4444', fontWeight: '600' },
  reviewBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, paddingVertical: 5, paddingHorizontal: 8, backgroundColor: '#F0F7F0', borderRadius: 8, alignSelf: 'flex-start' },
  reviewBtnText: { fontSize: 12, color: '#2D5A27', fontWeight: '600' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyIconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#F0F7F0', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  emptyTitle: { fontSize: 20, fontWeight: 'bold', color: '#1F2937' },
  emptySub: { fontSize: 15, color: '#6B7280', textAlign: 'center', marginTop: 10, lineHeight: 22 },
});
