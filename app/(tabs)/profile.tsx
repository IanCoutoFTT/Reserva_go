import React, { useEffect, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  View, Text, StyleSheet, Image, TouchableOpacity,
  ScrollView, Alert,
} from 'react-native';
import {
  User, Settings, Bell, ShieldCheck, LogOut,
  LogIn, LayoutDashboard, Home, FileText, Trash2,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { MenuItem } from '../../components/profile/MenuItem';
import { InfoModal } from '../../components/profile/InfoModal';
import { EditProfileModal } from '../../components/profile/EditProfileModal';
import { GuestDashboard, PastTrip } from '../../components/profile/GuestDashboard';
import { PRIVACY_SECTIONS, TERMS_SECTIONS } from '../../components/profile/profileContent';
import { updateProfile, uploadAvatar } from '../../services/profileService';
import { getBookingsByGuest } from '../../services/bookingService';
import { getReviewCountByAuthor } from '../../services/reviewService';

const DEFAULT_AVATAR = 'https://i.pravatar.cc/150?img=11';

const TRIP_MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
function formatTripDate(checkIn: string): string {
  const d = new Date(checkIn);
  if (Number.isNaN(d.getTime())) return '';
  return `${TRIP_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout, deleteAccount, refreshUser } = useAuth();
  const { unreadCount: UNREAD_NOTIFICATIONS } = useNotifications();

  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [isPrivacyVisible, setPrivacyVisible] = useState(false);
  const [isTermsVisible, setTermsVisible] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  // Estado "confirmado" (o que está de fato salvo) vem direto de `user` -
  // sem cópia local duplicada, pra nunca mostrar um dado editado que não foi
  // salvo de verdade (era o bug do RF-008: saveProfile só mudava esse estado
  // local, nunca persistia). tempX aqui é só o rascunho enquanto o modal de
  // edição está aberto.
  const [tempName, setTempName] = useState(user?.name ?? '');
  const [tempAvatar, setTempAvatar] = useState(user?.avatar ?? DEFAULT_AVATAR);
  const [tempBio, setTempBio] = useState(user?.bio ?? '');
  const [tempInterests, setTempInterests] = useState<string[]>(user?.interests ?? []);
  const [avatarChanged, setAvatarChanged] = useState(false);

  const [guestReviewsCount, setGuestReviewsCount] = useState(0);
  const [guestTripsCount, setGuestTripsCount] = useState(0);
  const [guestPastTrips, setGuestPastTrips] = useState<PastTrip[]>([]);

  const isStaticUser = !!user?.id.startsWith('static-');

  // Estatísticas reais do hóspede (RF-008 / item 4 do backlog perfil+admin) -
  // não roda pro usuário estático de dev (não tem bookings/reviews de
  // verdade) nem pra quem não é hóspede (GuestDashboard nem aparece).
  useEffect(() => {
    if (!user || user.role !== 'hospede' || isStaticUser) {
      setGuestReviewsCount(0);
      setGuestTripsCount(0);
      setGuestPastTrips([]);
      return;
    }

    let cancelled = false;
    Promise.all([getBookingsByGuest(user.id), getReviewCountByAuthor(user.id)]).then(
      ([bookingsRes, reviewsRes]) => {
        if (cancelled) return;
        if (bookingsRes.error) console.log('[profile] getBookingsByGuest falhou ->', bookingsRes.error);
        if (reviewsRes.error) console.log('[profile] getReviewCountByAuthor falhou ->', reviewsRes.error);

        // getBookingsByGuest já vem ordenado por check_in desc (bookingService.ts)
        // - as 10 primeiras concluídas do carrossel já são as mais recentes.
        const completed = (bookingsRes.data ?? []).filter((b) => b.status === 'realizada');
        setGuestTripsCount(completed.length);
        setGuestPastTrips(
          completed.slice(0, 10).map((b) => ({
            id: b.id,
            title: b.properties?.title ?? 'Cabana',
            date: formatTripDate(b.check_in),
            image: b.properties?.images?.[0] ?? null,
          }))
        );
        setGuestReviewsCount(reviewsRes.data ?? 0);
      }
    );

    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.role, isStaticUser]);

  const pickProfileImage = async () => {
    try {
      const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!granted) {
        Alert.alert('Permissão Necessária', 'Você precisa permitir o acesso à galeria para alterar a foto!');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled) {
        setTempAvatar(result.assets[0].uri);
        setAvatarChanged(true);
      }
    } catch {
      Alert.alert('Erro', 'Ocorreu um problema ao tentar abrir a galeria.');
    }
  };

  const openEditModal = () => {
    if (!user) return;
    setTempName(user.name);
    setTempAvatar(user.avatar);
    setTempBio(user.bio);
    setTempInterests(user.interests);
    setAvatarChanged(false);
    setEditModalVisible(true);
  };

  const saveProfile = async () => {
    if (!user) return;

    // Login fake de __DEV__ (STATIC_USERS em AuthContext.tsx) não tem linha
    // em `profiles` - não existe onde persistir isso, mesma ressalva já
    // aplicada a updateRole/deleteAccount nesse mesmo contexto.
    if (isStaticUser) {
      Alert.alert(
        'Login de desenvolvimento',
        'Esse login fake (__DEV__) não tem perfil real no banco - a edição não pode ser salva. Entre com o Google pra testar de verdade.'
      );
      setEditModalVisible(false);
      return;
    }

    setSavingProfile(true);
    try {
      let avatarUrl = user.avatar;

      if (avatarChanged) {
        const { data: uploadedUrl, error: uploadError } = await uploadAvatar(tempAvatar, user.id);
        if (uploadError || !uploadedUrl) {
          Alert.alert('Erro ao enviar foto', uploadError ?? 'Tente novamente.');
          return;
        }
        avatarUrl = uploadedUrl;
      }

      const { error } = await updateProfile(user.id, {
        name: tempName.trim() || user.name,
        bio: tempBio,
        interests: tempInterests,
        avatar_url: avatarUrl,
      });

      if (error) {
        Alert.alert('Erro ao salvar perfil', error);
        return;
      }

      await refreshUser();
      setAvatarChanged(false);
      setEditModalVisible(false);
    } finally {
      setSavingProfile(false);
    }
  };

  const toggleInterest = (interest: string) => {
    setTempInterests((prev) =>
      prev.includes(interest) ? prev.filter((i) => i !== interest) : [...prev, interest]
    );
  };

  if (!user) {
    return (
      <View style={styles.containerCenter}>
        <View style={styles.guestContent}>
          <View style={styles.iconCircle}>
            <User size={40} color="#2D5A27" />
          </View>
          <Text style={styles.headerTitle}>Seu Perfil</Text>
          <Text style={styles.guestSubtitle}>
            Faça login para planejar sua próxima viagem, gerenciar suas cabanas e ver suas mensagens.
          </Text>
          <TouchableOpacity style={styles.loginButton} onPress={() => router.push('../login')}>
            <LogIn size={20} color="#fff" style={{ marginRight: 10 }} />
            <Text style={styles.loginButtonText}>Entrar ou Cadastrar-se</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Perfil</Text>
          <View style={styles.userCard}>
            <Image source={{ uri: user.avatar }} style={styles.avatar} />
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{user.name}</Text>
              <Text style={styles.userEmail}>{user.email}</Text>
              <View style={styles.roleBadge}>
                <Text style={styles.roleText}>{user.role.toUpperCase()}</Text>
              </View>
            </View>
          </View>
        </View>

        {user.role === 'hospede' && (
          <GuestDashboard
            bio={user.bio}
            interests={user.interests}
            reviewsCount={guestReviewsCount}
            tripsCount={guestTripsCount}
            memberSinceYear={user.memberSince ? new Date(user.memberSince).getFullYear() : null}
            pastTrips={guestPastTrips}
          />
        )}

        {(user.role === 'anfitriao' || user.role === 'admin') && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Hospedagem</Text>
            <MenuItem
              icon={Settings}
              title="Anunciar nova cabana"
              subtitle="Cadastre um novo imóvel no sistema"
              onPress={() => router.push('../create-listing')}
            />
            <MenuItem
              icon={ShieldCheck}
              title="Painel de Gerenciamento"
              subtitle="Ver reservas e editar anúncios"
              onPress={() => router.push('../my-cabins')}
            />
          </View>
        )}

        {user.role === 'hospede' && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Ganhe dinheiro com seu espaço</Text>
            <MenuItem
              icon={Home}
              title="Torne-se um anfitrião"
              subtitle="Anuncie sua cabana e comece a lucrar"
              onPress={() => router.push('../select-role')}
            />
          </View>
        )}

        {user.role === 'admin' && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Administração</Text>
            <MenuItem
              icon={LayoutDashboard}
              title="Painel de Controle"
              subtitle="Gerenciar cabanas e ver estatísticas"
              onPress={() => router.push('../admin-dashboard')}
            />
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Configurações da Conta</Text>
          <MenuItem
            icon={User}
            title="Editar Perfil"
            subtitle="Informações pessoais e interesses"
            onPress={openEditModal}
          />
          <MenuItem
            icon={Bell}
            title="Notificações"
            subtitle={`${UNREAD_NOTIFICATIONS} não lidas · Toque para ver`}
            onPress={() => router.push('../notifications')}
            showBadge={UNREAD_NOTIFICATIONS > 0}
          />
          <MenuItem
            icon={ShieldCheck}
            title="Privacidade"
            subtitle="Coleta de dados e visibilidade"
            onPress={() => setPrivacyVisible(true)}
          />
          <MenuItem
            icon={FileText}
            title="Termos de Serviço"
            subtitle="Regras e políticas do ReservaGO"
            onPress={() => setTermsVisible(true)}
          />
        </View>

        <View style={styles.dangerZone}>
          <TouchableOpacity style={styles.logoutButton} onPress={logout}>
            <LogOut size={20} color="#EF4444" />
            <Text style={styles.logoutText}>Sair da conta</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.deleteButton} onPress={deleteAccount}>
            <Trash2 size={20} color="#EF4444" />
            <Text style={styles.deleteText}>Excluir conta</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.versionText}>Versão 1.0.0 Beta</Text>
      </ScrollView>

      <EditProfileModal
        visible={isEditModalVisible}
        onClose={() => setEditModalVisible(false)}
        avatar={tempAvatar}
        onPickImage={pickProfileImage}
        name={tempName}
        onChangeName={setTempName}
        bio={tempBio}
        onChangeBio={setTempBio}
        interests={tempInterests}
        onToggleInterest={toggleInterest}
        onSave={saveProfile}
        saving={savingProfile}
      />

      <InfoModal
        visible={isPrivacyVisible}
        onClose={() => setPrivacyVisible(false)}
        title="Privacidade"
        subtitle="Como protegemos seus dados"
        sections={PRIVACY_SECTIONS}
        footerText="Última atualização: Janeiro de 2025 · Em conformidade com a LGPD (Lei nº 13.709/2018)"
      />
      <InfoModal
        visible={isTermsVisible}
        onClose={() => setTermsVisible(false)}
        title="Termos de Serviço"
        subtitle="Regras e políticas do ReservaGO"
        sections={TERMS_SECTIONS}
        footerText="Ao usar o ReservaGO, você concorda com estes termos. Dúvidas? contato@reservago.com.br"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  containerCenter: { flex: 1, backgroundColor: '#fff', justifyContent: 'center', padding: 30 },
  guestContent: { alignItems: 'center' },
  iconCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#F0F7F0', justifyContent: 'center', alignItems: 'center', marginBottom: 20,
  },
  guestSubtitle: { fontSize: 16, color: '#6B7280', textAlign: 'center', marginBottom: 30, lineHeight: 22 },
  loginButton: {
    flexDirection: 'row', backgroundColor: '#2D5A27', width: '100%',
    padding: 16, borderRadius: 12, justifyContent: 'center', alignItems: 'center',
  },
  loginButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  header: { paddingTop: 60, paddingHorizontal: 20, marginBottom: 15 },
  headerTitle: { fontSize: 28, fontWeight: 'bold', color: '#1F2937', marginBottom: 20 },
  userCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB',
    padding: 15, borderRadius: 20, borderWidth: 1, borderColor: '#F3F4F6',
  },
  avatar: { width: 60, height: 60, borderRadius: 30, marginRight: 15 },
  userInfo: { flex: 1 },
  userName: { fontSize: 18, fontWeight: 'bold', color: '#1F2937' },
  userEmail: { fontSize: 14, color: '#6B7280' },
  roleBadge: {
    backgroundColor: '#E8F5E9', paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 6, alignSelf: 'flex-start', marginTop: 4,
  },
  roleText: { fontSize: 10, color: '#2D5A27', fontWeight: 'bold' },
  section: { paddingHorizontal: 20, marginBottom: 25 },
  sectionLabel: {
    fontSize: 14, fontWeight: '700', color: '#9CA3AF',
    marginBottom: 15, textTransform: 'uppercase', letterSpacing: 1,
  },
  dangerZone: { marginTop: 10, marginBottom: 20 },
  logoutButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginHorizontal: 20, marginBottom: 12, padding: 15, borderRadius: 15, backgroundColor: '#FEF2F2',
  },
  logoutText: { marginLeft: 10, color: '#EF4444', fontWeight: 'bold', fontSize: 16 },
  deleteButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginHorizontal: 20, padding: 15, borderRadius: 15,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#FEE2E2',
  },
  deleteText: { marginLeft: 10, color: '#EF4444', fontWeight: 'bold', fontSize: 16 },
  versionText: { textAlign: 'center', color: '#9CA3AF', fontSize: 12, marginVertical: 20 },
});
