import { useLocalSearchParams, useRouter } from 'expo-router';
import {
    Check,
    ChevronLeft,
    ChevronRight,
    Flame,
    Footprints,
    Heart,
    MapPin,
    Star,
    Trees,
    Wifi,
    X,
} from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    Linking,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useBookings } from '../context/BookingContext';
import { useFavorites } from '../context/FavoritesContext';
import { formatCurrency } from '../lib/format';
import { checkAvailability, createBooking } from '../services/bookingService';
import { getOrCreateConversation } from '../services/messageService';
import { getProfile } from '../services/profileService';
import { getPropertyById } from '../services/propertyService';
import { createReport } from '../services/reportService';
import { getReviewsByProperty } from '../services/reviewService';
import type { Profile, Property as DbProperty, ReviewWithAuthor } from '../services/types';

const REPORT_REASONS = [
  'Anúncio enganoso ou informação falsa',
  'Conteúdo impróprio ou ofensivo',
  'Suspeita de golpe ou fraude',
  'Cabana não existe ou já foi removida',
  'Outro motivo',
];

const ISOLATION_MAP: Record<string, { emoji: string; title: string; sub: string }> = {
  urbano: {
    emoji: '🏘️',
    title: 'Vizinhos próximos',
    sub: 'Área residencial ou vila. Vizinhos a menos de 500m de distância.',
  },
  semi: {
    emoji: '🌲',
    title: 'Alguma privacidade',
    sub: 'Área rural tranquila, vizinhos a mais de 1km. Boa para descanso.',
  },
  isolado: {
    emoji: '🏕️',
    title: 'Você é a única alma aqui',
    sub: 'Vizinho mais próximo a mais de 3km, dentro de uma reserva particular.',
  },
  extremo: {
    emoji: '🌄',
    title: 'Você é a única alma aqui',
    sub: 'O vizinho mais próximo fica a 4.5 km de distância, dentro de uma reserva particular de 20 hectares.',
  },
};

const DEFAULT_ISOLATION = {
  emoji: '🏕️',
  title: 'Informação não disponível',
  sub: 'O anfitrião não informou o nível de isolamento desta cabana.',
};

// Usadas só quando a busca de reviews reais falha (query com erro) - não
// quando a propriedade genuinamente não tem nenhuma review ainda (nesse
// caso mostramos um estado vazio de verdade, não isso).
const FALLBACK_REVIEWS = [
  { id: '1', author: 'Fernanda M.', avatar: 'https://i.pravatar.cc/100?img=1', rating: 5, date: 'Mar 2025', comment: 'Lugar incrível, silêncio total e natureza por todos os lados. Voltaremos com certeza!' },
  { id: '2', author: 'Rafael S.', avatar: 'https://i.pravatar.cc/100?img=3', rating: 5, date: 'Fev 2025', comment: 'Estrutura impecável, trilha privativa sensacional. Superou todas as expectativas.' },
];

function toISODateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const AMENITIES = [
  { icon: Wifi, label: 'Wi-Fi de alta velocidade' },
  { icon: Flame, label: 'Lareira a lenha' },
  { icon: Footprints, label: 'Trilha privativa' },
  { icon: Trees, label: 'Reserva particular' },
];

export default function DetailsScreen() {
  const router = useRouter();
  const { addBooking } = useBookings();
  const { user } = useAuth();
  const { favorites, toggleFavorite } = useFavorites();

  const { id, title, price, location, description, image, isolationLevel } = useLocalSearchParams();
  const isFav = favorites.includes(id as string);

  // Usuário estático (__DEV__) não existe em profiles/auth - nesse caso (e
  // se a busca no banco falhar) o app continua no modo "só com os params",
  // igual funcionava antes desta tarefa.
  const isStaticUser = !!user?.id && user.id.startsWith('static-');

  const [property, setProperty] = useState<DbProperty | null>(null);
  const [loadingProperty, setLoadingProperty] = useState(true);
  const [reviews, setReviews] = useState<ReviewWithAuthor[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [reviewsFailed, setReviewsFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Anfitrião real (antes era 100% hardcoded: "Carlos Mendes" + foto fixa,
  // pra qualquer cabana). null enquanto carrega ou se o dono foi excluído.
  const [hostProfile, setHostProfile] = useState<Profile | null>(null);
  const [contacting, setContacting] = useState(false);

  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportReason, setReportReason] = useState<string | null>(null);
  const [reportDetails, setReportDetails] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);

  useEffect(() => {
    if (!id) {
      setLoadingProperty(false);
      setLoadingReviews(false);
      return;
    }

    let cancelled = false;

    getPropertyById(id as string).then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data) {
        console.log('[details] getPropertyById falhou, mantendo dados dos params ->', error);
        setProperty(null);
      } else {
        setProperty(data);
      }
      setLoadingProperty(false);
    });

    getReviewsByProperty(id as string).then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        console.log('[details] getReviewsByProperty falhou, usando fallback ->', error);
        setReviewsFailed(true);
        setReviews([]);
      } else {
        setReviews(data ?? []);
      }
      setLoadingReviews(false);
    });

    return () => {
      cancelled = true;
    };
  }, [id]);

  // Carrega o anfitrião de verdade assim que sabemos o dono (property.owner_id).
  // Antes disso resolver, ou se getProfile falhar (ex.: dono excluiu a
  // conta), o card mostra "Anfitrião"/"Usuário removido" - nunca mais um
  // nome inventado.
  useEffect(() => {
    if (!property?.owner_id) {
      setHostProfile(null);
      return;
    }

    let cancelled = false;

    getProfile(property.owner_id).then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data) {
        console.log('[details] getProfile (anfitrião) falhou ->', error);
        setHostProfile(null);
      } else {
        setHostProfile(data);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [property?.owner_id]);

  // Enquanto a busca real não termina (ou se ela falhar), os params da
  // navegação seguem valendo - é o que já dava o carregamento instantâneo
  // antes desta tarefa, então preservamos exatamente esse comportamento.
  const displayTitle = property?.title ?? (title as string);
  const displayLocation = property?.location ?? (location as string);
  const displayDescription = property?.description ?? (description as string);
  const displayImage = property?.images?.[0] ?? (image as string);
  const displayIsolationLevel = property?.isolation_level ?? (isolationLevel as string);

  const [modalVisible, setModalVisible] = useState(false);
  const [step, setStep] = useState<'dates' | 'payment'>('dates');
  const [checkInDate, setCheckInDate] = useState<Date | null>(null);
  const [checkOutDate, setCheckOutDate] = useState<Date | null>(null);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [selectingDate, setSelectingDate] = useState<'checkIn' | 'checkOut'>('checkIn');
  const [payMethod, setPayMethod] = useState<'pix' | 'card'>('pix');

  const priceNum = property?.price ?? (Number(price) || 0);

  // Só dá pra reservar de verdade (checkAvailability + createBooking) se a
  // propriedade veio mesmo do banco (id real, existe em properties) e o
  // usuário não é o de dev. Fora isso, cai no addBooking local de sempre.
  const canBookOnline = !!property && !isStaticUser;

  const nightCount = useMemo(() => {
    if (checkInDate && checkOutDate) {
      const start = new Date(checkInDate.getFullYear(), checkInDate.getMonth(), checkInDate.getDate());
      const end = new Date(checkOutDate.getFullYear(), checkOutDate.getMonth(), checkOutDate.getDate());
      const diffTime = end.getTime() - start.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
      return diffDays > 0 ? diffDays : 1;
    }
    return 1;
  }, [checkInDate, checkOutDate]);

  const datesAreValid = checkInDate !== null && checkOutDate !== null && checkOutDate > checkInDate;
  const subtotal = priceNum * nightCount;
  const serviceFee = subtotal * 0.1;
  const total = subtotal + serviceFee;

  const openReserveFlow = () => {
    if (!user) {
      Alert.alert('Perfil necessário', 'Você precisa estar logado para fazer uma reserva.', [
        { text: 'Depois' },
        { text: 'Login', onPress: () => router.push('../login') },
      ]);
      return;
    }
    setStep('dates');
    setModalVisible(true);
  };

  const finishBookingLocally = () => {
    addBooking(id as string, {
      checkIn: checkInDate,
      checkOut: checkOutDate,
      nights: nightCount,
      payMethod,
      total: payMethod === 'pix' ? total * 0.95 : total,
    });
    setModalVisible(false);
    Alert.alert('Reserva Confirmada! 🌿', 'Sua viagem foi registrada com sucesso.', [
      { text: 'Ver viagens', onPress: () => router.replace('/(tabs)/bookings') },
    ]);
  };

  const confirmBooking = async () => {
    if (!canBookOnline || !checkInDate || !checkOutDate) {
      // usuário estático, ou propriedade não veio do banco (id local tipo
      // "p1") - mesmo comportamento de sempre, via BookingContext/AsyncStorage.
      finishBookingLocally();
      return;
    }

    setConfirming(true);
    const checkInStr = toISODateString(checkInDate);
    const checkOutStr = toISODateString(checkOutDate);

    const { data: available, error: availError } = await checkAvailability(
      property!.id,
      checkInStr,
      checkOutStr
    );

    if (availError) {
      setConfirming(false);
      Alert.alert('Erro', 'Não foi possível verificar a disponibilidade agora. Tente novamente.');
      return;
    }

    if (!available) {
      setConfirming(false);
      Alert.alert(
        'Datas indisponíveis',
        'Essa cabana já está reservada nesse período. Escolha outras datas.'
      );
      return;
    }

    const finalTotal = payMethod === 'pix' ? total * 0.95 : total;

    const { data: booking, error: createError } = await createBooking({
      property_id: property!.id,
      guest_id: user!.id,
      check_in: checkInStr,
      check_out: checkOutStr,
      pay_method: payMethod,
      price_per_night: priceNum,
      total: finalTotal,
      pix_discount: payMethod === 'pix',
    });

    setConfirming(false);

    if (createError || !booking) {
      Alert.alert('Erro ao reservar', createError ?? 'Tente novamente.');
      return;
    }

    setModalVisible(false);
    Alert.alert('Reserva Confirmada! 🌿', 'Sua viagem foi registrada com sucesso.', [
      { text: 'Ver viagens', onPress: () => router.replace('/(tabs)/bookings') },
    ]);
  };

  const formatDate = (date: Date | null) => {
    if (!date) return 'Selecionar';
    return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}`;
  };

  const openMap = () => {
    const query = encodeURIComponent(displayLocation);
    const url = Platform.OS === 'ios'
      ? `maps://?q=${query}`
      : `geo:0,0?q=${query}`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://maps.google.com/?q=${query}`);
    });
  };

  // "Contato" no card do anfitrião - antes não tinha nenhum onPress. Cria
  // (ou acha) a conversa com getOrCreateConversation e navega direto pra
  // ela em app/(tabs)/messages.tsx via param.
  const handleContact = async () => {
    if (!user) {
      Alert.alert('Login necessário', 'Você precisa estar logado para falar com o anfitrião.', [
        { text: 'Depois' },
        { text: 'Login', onPress: () => router.push('../login') },
      ]);
      return;
    }
    if (isStaticUser) {
      Alert.alert(
        'Login de desenvolvimento',
        'Esse login fake (__DEV__) não tem perfil real no banco - não dá pra abrir uma conversa. Entre com o Google pra testar de verdade.'
      );
      return;
    }
    if (!property) {
      Alert.alert('Indisponível', 'Não foi possível abrir a conversa agora. Tente novamente mais tarde.');
      return;
    }
    if (property.owner_id === user.id) {
      Alert.alert('Essa é a sua cabana', 'Você é o anfitrião deste anúncio.');
      return;
    }

    setContacting(true);
    const { data: conversationId, error } = await getOrCreateConversation(user.id, property.owner_id, property.id);
    setContacting(false);

    if (error || !conversationId) {
      console.log('[details] getOrCreateConversation falhou ->', error);
      Alert.alert('Erro', 'Não foi possível abrir a conversa agora. Tente novamente.');
      return;
    }

    router.push({ pathname: '/(tabs)/messages', params: { conversationId } });
  };

  // "🚩 Denunciar este anúncio" - antes não tinha nenhum onPress, e não
  // existia NENHUMA função em services/ pra criar uma denúncia.
  const openReportModal = () => {
    if (!user) {
      Alert.alert('Login necessário', 'Você precisa estar logado para denunciar um anúncio.', [
        { text: 'Depois' },
        { text: 'Login', onPress: () => router.push('../login') },
      ]);
      return;
    }
    if (isStaticUser) {
      Alert.alert(
        'Login de desenvolvimento',
        'Esse login fake (__DEV__) não tem perfil real no banco - não dá pra enviar uma denúncia. Entre com o Google pra testar de verdade.'
      );
      return;
    }
    setReportReason(null);
    setReportDetails('');
    setReportModalVisible(true);
  };

  const submitReport = async () => {
    if (!user || !reportReason || !property) return;

    setSubmittingReport(true);
    const { error } = await createReport({
      reporter_id: user.id,
      property_id: property.id,
      reported_user_id: property.owner_id,
      reason: reportReason,
      details: reportDetails.trim() || null,
    });
    setSubmittingReport(false);

    if (error) {
      console.log('[details] createReport falhou ->', error);
      Alert.alert('Erro', 'Não foi possível enviar a denúncia agora. Tente novamente.');
      return;
    }

    setReportModalVisible(false);
    Alert.alert('Denúncia enviada', 'Obrigado por avisar - nossa equipe vai analisar.');
  };

  const renderCalendarDays = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = [];
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const firstWeekDay = new Date(currentYear, currentMonth, 1).getDay();

    for (let i = 0; i < firstWeekDay; i++) {
      days.push(<View key={`empty-${i}`} style={{ width: 35, height: 35 }} />);
    }

    for (let i = 1; i <= daysInMonth; i++) {
      const dateObj = new Date(currentYear, currentMonth, i);
      const isPast = dateObj < today;
      const isCheckIn = checkInDate?.getDate() === i && checkInDate?.getMonth() === currentMonth;
      const isCheckOut = checkOutDate?.getDate() === i && checkOutDate?.getMonth() === currentMonth;
      const isSelected = isCheckIn || isCheckOut;
      const isInRange =
        checkInDate && checkOutDate &&
        dateObj > checkInDate && dateObj < checkOutDate &&
        dateObj.getMonth() === currentMonth;

      days.push(
        <TouchableOpacity
          key={i}
          disabled={isPast}
          style={[
            styles.calDay,
            isSelected && styles.calDaySelected,
            isInRange && styles.calDayInRange,
            isPast && { opacity: 0.2 },
          ]}
          onPress={() => {
            if (selectingDate === 'checkIn') {
              setCheckInDate(dateObj);
              setCheckOutDate(null);
              setSelectingDate('checkOut');
            } else {
              if (checkInDate && dateObj <= checkInDate) {
                Alert.alert('Erro', 'O Check-out deve ser depois do Check-in.');
                return;
              }
              setCheckOutDate(dateObj);
              setCalendarVisible(false);
            }
          }}
        >
          <Text style={[
            styles.calDayText,
            isSelected && styles.calDayTextSelected,
            isInRange && styles.calDayTextInRange,
          ]}>
            {i}
          </Text>
        </TouchableOpacity>
      );
    }
    return days;
  };

  const isolationInfo = ISOLATION_MAP[String(displayIsolationLevel).toLowerCase()] ?? DEFAULT_ISOLATION;
  const amenitiesFromDb = property?.amenities ?? [];
  const reviewsCountLabel = loadingReviews
    ? '···'
    : reviewsFailed
      ? FALLBACK_REVIEWS.length
      : reviews.length;

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={styles.imageHeader}>
          <Image source={{ uri: displayImage }} style={styles.mainImage} />
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <ChevronLeft color="#000" size={24} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.heartButton} onPress={() => toggleFavorite(id as string)}>
            <Heart size={24} color={isFav ? '#FF385C' : '#fff'} fill={isFav ? '#FF385C' : 'rgba(0,0,0,0.3)'} />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          {loadingProperty && <ActivityIndicator color="#2D5A27" style={{ marginBottom: 10 }} />}
          <Text style={styles.title}>{displayTitle}</Text>
          <View style={styles.row}>
            <MapPin size={14} color="#6B7280" />
            <Text style={styles.locationText}> {displayLocation}</Text>
          </View>
          <TouchableOpacity style={styles.ratingRow}>
            <Star size={16} color="#F59E0B" fill="#F59E0B" />
            <Text style={styles.ratingValue}> {(property?.rating ?? 0).toFixed(2).replace('.', ',')}</Text>
            <Text style={styles.ratingCount}> · {reviewsCountLabel} avaliações</Text>
            <ChevronRight size={14} color="#9CA3AF" style={{ marginLeft: 4 }} />
          </TouchableOpacity>

          <View style={styles.divider} />
          <Text style={styles.sectionTitle}>Sobre o lugar</Text>
          <Text style={styles.bodyText}>{displayDescription || 'Um refúgio único rodeado pela natureza.'}</Text>

          <View style={styles.divider} />
          <Text style={styles.sectionTitle}>🌿 Nível de isolamento</Text>
          <View style={styles.isolationCard}>
            <Text style={styles.isolationEmoji}>{isolationInfo.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.isolationTitle}>{isolationInfo.title}</Text>
              <Text style={styles.isolationSub}>{isolationInfo.sub}</Text>
            </View>
          </View>

          <View style={styles.divider} />
          <Text style={styles.sectionTitle}>Comodidades</Text>
          <View style={styles.amenitiesGrid}>
            {amenitiesFromDb.length > 0
              ? amenitiesFromDb.map((label, i) => (
                  <View key={i} style={styles.amenityItem}>
                    <Check size={22} color="#2D5A27" />
                    <Text style={styles.amenityLabel}>{label}</Text>
                  </View>
                ))
              : AMENITIES.map((a, i) => (
                  <View key={i} style={styles.amenityItem}>
                    <a.icon size={22} color="#2D5A27" />
                    <Text style={styles.amenityLabel}>{a.label}</Text>
                  </View>
                ))}
          </View>

          <View style={styles.divider} />
          <Text style={styles.sectionTitle}>Localização</Text>
          <TouchableOpacity style={styles.mapPlaceholder} onPress={openMap} activeOpacity={0.8}>
            <View style={styles.mapOverlay}>
              <MapPin size={20} color="#fff" />
              <Text style={styles.mapText}>Ver no mapa · {displayLocation}</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.divider} />
          <Text style={styles.sectionTitle}>Avaliações</Text>
          {loadingReviews ? (
            <ActivityIndicator color="#2D5A27" />
          ) : !reviewsFailed && reviews.length === 0 ? (
            <Text style={styles.bodyText}>Ainda não há avaliações para esta cabana.</Text>
          ) : reviewsFailed ? (
            FALLBACK_REVIEWS.map((r) => (
              <View key={r.id} style={styles.reviewCard}>
                <Image source={{ uri: r.avatar }} style={styles.reviewAvatar} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={styles.reviewAuthor}>{r.author}</Text>
                    <Text style={styles.reviewDate}>{r.date}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', marginVertical: 4 }}>
                    {[...Array(r.rating)].map((_, i) => (
                      <Star key={i} size={12} color="#F59E0B" fill="#F59E0B" />
                    ))}
                  </View>
                  <Text style={styles.reviewComment}>{r.comment}</Text>
                </View>
              </View>
            ))
          ) : (
            reviews.map((r) => (
              <View key={r.id} style={styles.reviewCard}>
                <Image
                  source={{ uri: r.profiles?.avatar_url ?? 'https://i.pravatar.cc/100' }}
                  style={styles.reviewAvatar}
                />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={styles.reviewAuthor}>{r.profiles?.name || 'Usuário removido'}</Text>
                    <Text style={styles.reviewDate}>
                      {new Date(r.created_at).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', marginVertical: 4 }}>
                    {[...Array(r.rating)].map((_, i) => (
                      <Star key={i} size={12} color="#F59E0B" fill="#F59E0B" />
                    ))}
                  </View>
                  <Text style={styles.reviewComment}>{r.comment}</Text>
                </View>
              </View>
            ))
          )}

          <View style={styles.divider} />
          <Text style={styles.sectionTitle}>Anfitrião</Text>
          <View style={styles.hostCard}>
            <Image
              source={{ uri: hostProfile?.avatar_url || 'https://i.pravatar.cc/100?img=8' }}
              style={styles.hostAvatar}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.hostName}>{hostProfile?.name || 'Usuário removido'}</Text>
              <Text style={styles.hostSub}>
                {hostProfile?.created_at
                  ? `No ReservaGO desde ${new Date(hostProfile.created_at).getFullYear()}`
                  : 'Anfitrião'}
              </Text>
            </View>
            <TouchableOpacity style={styles.contactBtn} onPress={handleContact} disabled={contacting}>
              {contacting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.contactBtnText}>Contato</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />
          <Text style={styles.sectionTitle}>Diretrizes da Hospedagem</Text>
          {[
            '👥 Máximo de 4 hóspedes',
            '🕑 Check-in: 14h · Check-out: 11h',
            '🚭 Não é permitido fumar dentro',
            '🧯 Extintor e kit de primeiros socorros',
            '✅ Cancelamento gratuito até 7 dias',
          ].map((rule, i) => (
            <Text key={i} style={styles.ruleText}>{rule}</Text>
          ))}

          <TouchableOpacity style={styles.reportBtn} onPress={openReportModal}>
            <Text style={styles.reportText}>🚩 Denunciar este anúncio</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <View>
          <Text style={styles.footerPrice}>{formatCurrency(priceNum)}</Text>
          <Text style={styles.footerNight}>por noite</Text>
        </View>
        <TouchableOpacity style={styles.reserveButton} onPress={openReserveFlow}>
          <Text style={styles.reserveText}>Reservar</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Confirmar sua viagem</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X size={24} color="#000" />
              </TouchableOpacity>
            </View>

            {step === 'dates' && (
              <ScrollView style={{ padding: 20 }}>
                <View style={styles.dateRow}>
                  <TouchableOpacity style={styles.dateField} onPress={() => { setSelectingDate('checkIn'); setCalendarVisible(true); }}>
                    <Text style={styles.dateLabel}>CHECK-IN</Text>
                    <Text style={styles.dateInput}>{formatDate(checkInDate)}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.dateField} onPress={() => { setSelectingDate('checkOut'); setCalendarVisible(true); }}>
                    <Text style={styles.dateLabel}>CHECK-OUT</Text>
                    <Text style={styles.dateInput}>{formatDate(checkOutDate)}</Text>
                  </TouchableOpacity>
                </View>

                {calendarVisible && (
                  <View style={styles.calendarContainer}>
                    <View style={styles.calWeekRow}>
                      {['D','S','T','Q','Q','S','S'].map((d, idx) => (
                        <Text key={idx} style={styles.calWeekLabel}>{d}</Text>
                      ))}
                    </View>
                    <View style={styles.calendarGrid}>
                      {renderCalendarDays()}
                    </View>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.advanceBtn, !datesAreValid && { backgroundColor: '#CCC' }]}
                  disabled={!datesAreValid}
                  onPress={() => setStep('payment')}
                >
                  <Text style={styles.advanceBtnText}>Continuar</Text>
                </TouchableOpacity>
              </ScrollView>
            )}

            {step === 'payment' && (
              <View style={{ padding: 20 }}>
                <View style={styles.priceSummary}>
                  <Text style={styles.priceSummaryTitle}>Resumo</Text>
                  <View style={styles.priceSummaryRow}>
                    <Text style={styles.priceSummaryLabel}>{formatCurrency(priceNum)} × {nightCount} noite(s)</Text>
                    <Text style={styles.priceSummaryValue}>{formatCurrency(subtotal)}</Text>
                  </View>
                  <View style={styles.priceSummaryRow}>
                    <Text style={styles.priceSummaryLabel}>Taxa de serviço (10%)</Text>
                    <Text style={styles.priceSummaryValue}>{formatCurrency(serviceFee)}</Text>
                  </View>
                  {payMethod === 'pix' && (
                    <View style={styles.priceSummaryRow}>
                      <Text style={[styles.priceSummaryLabel, { color: '#2D5A27' }]}>Desconto PIX (5%)</Text>
                      <Text style={[styles.priceSummaryValue, { color: '#2D5A27' }]}>- {formatCurrency(total * 0.05)}</Text>
                    </View>
                  )}
                  <View style={[styles.priceSummaryRow, { marginTop: 8, borderTopWidth: 1, borderColor: '#EEE', paddingTop: 8 }]}>
                    <Text style={{ fontWeight: 'bold', fontSize: 16 }}>Total</Text>
                    <Text style={{ fontWeight: 'bold', fontSize: 16 }}>
                      {formatCurrency(payMethod === 'pix' ? total * 0.95 : total)}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.payOption, payMethod === 'pix' && styles.payOptionActive]}
                  onPress={() => setPayMethod('pix')}
                >
                  <Text style={{ fontWeight: 'bold' }}>Pagar com PIX (5% OFF)</Text>
                  {payMethod === 'pix' && <Check size={20} color="#2D5A27" />}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.payOption, payMethod === 'card' && styles.payOptionActive]}
                  onPress={() => setPayMethod('card')}
                >
                  <Text style={{ fontWeight: 'bold' }}>Cartão de Crédito</Text>
                  {payMethod === 'card' && <Check size={20} color="#2D5A27" />}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.advanceBtn, confirming && { opacity: 0.6 }]}
                  onPress={confirmBooking}
                  disabled={confirming}
                >
                  {confirming ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.advanceBtnText}>Confirmar Pagamento</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={reportModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Denunciar anúncio</Text>
              <TouchableOpacity onPress={() => setReportModalVisible(false)}>
                <X size={24} color="#000" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ padding: 20 }}>
              <Text style={styles.sectionTitle}>Qual o motivo?</Text>
              {REPORT_REASONS.map((reason) => (
                <TouchableOpacity
                  key={reason}
                  style={[styles.reportReasonOption, reportReason === reason && styles.reportReasonOptionActive]}
                  onPress={() => setReportReason(reason)}
                >
                  <Text
                    style={[styles.reportReasonText, reportReason === reason && styles.reportReasonTextActive]}
                  >
                    {reason}
                  </Text>
                  {reportReason === reason && <Check size={18} color="#fff" />}
                </TouchableOpacity>
              ))}

              <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Detalhes (opcional)</Text>
              <TextInput
                style={styles.reportDetailsInput}
                placeholder="Conte mais sobre o que aconteceu..."
                placeholderTextColor="#9CA3AF"
                value={reportDetails}
                onChangeText={setReportDetails}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />

              <TouchableOpacity
                style={[styles.advanceBtn, (!reportReason || submittingReport) && { opacity: 0.6 }]}
                onPress={submitReport}
                disabled={!reportReason || submittingReport}
              >
                {submittingReport ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.advanceBtnText}>Enviar denúncia</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  imageHeader: { height: 350 },
  mainImage: { width: '100%', height: '100%' },
  backButton: { position: 'absolute', top: 50, left: 20, backgroundColor: '#fff', padding: 8, borderRadius: 25 },
  heartButton: { position: 'absolute', top: 50, right: 20, backgroundColor: 'rgba(0,0,0,0.3)', padding: 8, borderRadius: 25 },
  content: { padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold' },
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  locationText: { color: '#6B7280' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  ratingValue: { fontWeight: 'bold' },
  ratingCount: { color: '#6B7280' },
  divider: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 20 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
  bodyText: { color: '#4B5563', lineHeight: 22 },
  isolationCard: { flexDirection: 'row', backgroundColor: '#F0F7F0', padding: 16, borderRadius: 14, gap: 12, alignItems: 'flex-start' },
  isolationEmoji: { fontSize: 28 },
  isolationTitle: { fontSize: 15, fontWeight: '700' },
  isolationSub: { fontSize: 13, color: '#4B5563', marginTop: 4, lineHeight: 18 },
  amenitiesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 15 },
  amenityItem: { flexDirection: 'row', alignItems: 'center', width: '45%', gap: 8 },
  amenityLabel: { fontSize: 14 },
  mapPlaceholder: { height: 100, borderRadius: 14, overflow: 'hidden', backgroundColor: '#D1E8CF', justifyContent: 'center', alignItems: 'center' },
  mapOverlay: { width: '100%', backgroundColor: 'rgba(0,0,0,0.4)', padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14 },
  mapText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  reviewCard: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  reviewAvatar: { width: 44, height: 44, borderRadius: 22 },
  reviewAuthor: { fontWeight: 'bold', fontSize: 14 },
  reviewDate: { fontSize: 12, color: '#9CA3AF' },
  reviewComment: { fontSize: 13, color: '#4B5563', lineHeight: 18, marginTop: 2 },
  hostCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: '#F9FAFB', borderRadius: 14 },
  hostAvatar: { width: 50, height: 50, borderRadius: 25 },
  hostName: { fontWeight: 'bold', fontSize: 15 },
  hostSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  contactBtn: { backgroundColor: '#2D5A27', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  contactBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  ruleText: { fontSize: 14, color: '#4B5563', marginBottom: 8, lineHeight: 20 },
  reportBtn: { marginTop: 20, alignItems: 'center' },
  reportText: { color: '#EF4444', fontSize: 14 },
  footer: { position: 'absolute', bottom: 0, width: '100%', backgroundColor: '#fff', padding: 20, borderTopWidth: 1, borderColor: '#EEE', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerPrice: { fontSize: 20, fontWeight: 'bold' },
  footerNight: { color: '#6B7280' },
  reserveButton: { backgroundColor: '#2D5A27', paddingVertical: 15, paddingHorizontal: 30, borderRadius: 12 },
  reserveText: { color: '#fff', fontWeight: 'bold' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 30, borderTopRightRadius: 30, height: '85%' },
  modalHandle: { width: 40, height: 4, backgroundColor: '#DDD', alignSelf: 'center', marginVertical: 10 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, alignItems: 'center' },
  modalTitle: { fontSize: 20, fontWeight: 'bold' },
  dateRow: { flexDirection: 'row', borderWidth: 1, borderColor: '#DDD', borderRadius: 12, marginBottom: 20 },
  dateField: { flex: 1, padding: 15, alignItems: 'center' },
  dateLabel: { fontSize: 10, fontWeight: 'bold', color: '#999' },
  dateInput: { fontSize: 16, fontWeight: 'bold', marginTop: 4 },
  calendarContainer: { padding: 15, backgroundColor: '#F9F9F9', borderRadius: 12, marginBottom: 20 },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, justifyContent: 'center' },
  calDay: { width: 35, height: 35, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: '#EEE' },
  calDayInRange: { backgroundColor: '#D1E8CF', borderColor: '#D1E8CF' },
  calDaySelected: { backgroundColor: '#2D5A27', borderColor: '#2D5A27' },
  calDayTextSelected: { color: '#fff', fontWeight: 'bold' },
  calDayTextInRange: { color: '#2D5A27', fontWeight: '600' },
  calWeekRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 6, gap: 5 },
  calWeekLabel: { width: 35, textAlign: 'center', fontSize: 11, fontWeight: '700', color: '#9CA3AF' },
  calDayText: { fontSize: 12 },
  advanceBtn: { backgroundColor: '#2D5A27', padding: 18, borderRadius: 15, alignItems: 'center', marginTop: 20 },
  advanceBtnText: { color: '#fff', fontWeight: 'bold' },
  priceSummary: { backgroundColor: '#F9FAFB', borderRadius: 14, padding: 16, marginBottom: 20 },
  priceSummaryTitle: { fontWeight: 'bold', fontSize: 16, marginBottom: 12 },
  priceSummaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  priceSummaryLabel: { color: '#4B5563', fontSize: 14 },
  priceSummaryValue: { fontWeight: '600', fontSize: 14 },
  payOption: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, borderWidth: 1, borderColor: '#DDD', borderRadius: 12, marginBottom: 10 },
  payOptionActive: { borderColor: '#2D5A27', backgroundColor: '#F0F7F0' },
  reportReasonOption: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 15, borderWidth: 1, borderColor: '#DDD', borderRadius: 12, marginBottom: 10,
  },
  reportReasonOptionActive: { borderColor: '#2D5A27', backgroundColor: '#2D5A27' },
  reportReasonText: { color: '#1F2937', fontSize: 14, flex: 1 },
  reportReasonTextActive: { color: '#fff', fontWeight: '600' },
  reportDetailsInput: {
    borderWidth: 1, borderColor: '#DDD', borderRadius: 12, padding: 14,
    fontSize: 14, color: '#1F2937', minHeight: 90, marginBottom: 10,
  },
});