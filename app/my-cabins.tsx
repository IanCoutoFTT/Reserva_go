import { useRouter } from 'expo-router';
import { CalendarDays, ChevronLeft, Edit, MapPin, Plus, Trash2, TrendingUp } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { Listing, useListings } from '../context/ListingContext';
import { deleteProperty, getPropertiesByHost } from '../services/propertyService';
import type { CabinStatus, Property as DbProperty } from '../services/types';

type CabinRow = Listing & { status?: CabinStatus };

function mapPropertyToCabinRow(p: DbProperty): CabinRow {
  return {
    id: p.id,
    title: p.title,
    location: p.location,
    price: p.price,
    description: p.description,
    image: p.images?.[0] ?? null,
    isolationLevel: p.isolation_level,
    createdAt: p.created_at,
    bookingsCount: p.bookings_count,
    rating: p.rating,
    category: p.category,
    subCategory: p.sub_category ?? undefined,
    hostId: p.owner_id,
    status: p.status,
  };
}

const STATUS_LABELS: Record<CabinStatus, { label: string; color: string; bg: string }> = {
  ativo: { label: 'Aprovado', color: '#166534', bg: '#DCFCE7' },
  pendente: { label: 'Em análise', color: '#92400E', bg: '#FEF3C7' },
  suspenso: { label: 'Suspenso', color: '#991B1B', bg: '#FEE2E2' },
  inativo: { label: 'Reprovado', color: '#374151', bg: '#F3F4F6' },
};

export default function MyCabinsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { listings: localListings, removeListing } = useListings();

  // Usuário estático (__DEV__) não existe em profiles/auth - cai pras
  // cabanas locais do ListingContext, igual antes desta tarefa.
  const isStaticUser = !!user?.id && user.id.startsWith('static-');
  const [remoteCabins, setRemoteCabins] = useState<CabinRow[] | null>(null);
  const [loading, setLoading] = useState(!isStaticUser);

  const loadCabins = () => {
    if (isStaticUser || !user?.id) {
      setRemoteCabins(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    getPropertiesByHost(user.id).then(({ data, error }) => {
      if (error || !data) {
        console.log('[my-cabins] getPropertiesByHost falhou, usando fallback local ->', error);
        setRemoteCabins(null);
      } else {
        setRemoteCabins(data.map(mapPropertyToCabinRow));
      }
      setLoading(false);
    });
  };

  useEffect(() => {
    loadCabins();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStaticUser, user?.id]);

  const usingRemote = remoteCabins !== null;
  const listings: CabinRow[] = usingRemote ? remoteCabins! : localListings;

  const totalEarnings = listings.reduce((acc, c) => acc + (Number(c.price) * (c.bookingsCount || 0)), 0);
  const totalBookings = listings.reduce((acc, c) => acc + (c.bookingsCount || 0), 0);

  const handleDelete = (id: string, title: string) => {
    Alert.alert('Excluir Anúncio', `Tem certeza que deseja remover "${title}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          if (usingRemote) {
            // Soft delete (status='inativo') - ver comentário em
            // services/propertyService.ts (deleteProperty) sobre o porquê
            // de não ser um DELETE de verdade.
            const { error } = await deleteProperty(id);
            if (error) {
              Alert.alert('Erro', 'Não foi possível excluir agora. Tente novamente.');
              return;
            }
            loadCabins();
          } else {
            removeListing(id);
          }
        },
      },
    ]);
  };

  const handleEdit = (cabin: CabinRow) => {
    router.push({
      pathname: '/create-listing',
      params: {
        editId: cabin.id,
        editIsRemote: usingRemote ? '1' : '0',
        title: cabin.title,
        location: cabin.location,
        price: String(cabin.price ?? ''),
        description: cabin.description,
        image: cabin.image ?? '',
        isolationLevel: cabin.isolationLevel ?? '',
        category: cabin.category ?? '',
        subCategory: cabin.subCategory ?? '',
      },
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Painel do Anfitrião</Text>
        <View style={{ width: 24 }} />
      </View>
      
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20 }}>
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <TrendingUp size={24} color="#2D5A27" />
            <Text style={styles.statValue}>R$ {totalEarnings.toLocaleString('pt-BR')}</Text>
            <Text style={styles.statLabel}>Ganhos estimados</Text>
          </View>
          <View style={styles.statCard}>
            <CalendarDays size={24} color="#F59E0B" />
            <Text style={styles.statValue}>{totalBookings}</Text>
            <Text style={styles.statLabel}>Reservas ativas</Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Minhas Cabanas ({listings.length})</Text>
        </View>

        {loading && (
          <View style={styles.emptyState}>
            <ActivityIndicator size="large" color="#2D5A27" />
          </View>
        )}

        {!loading && listings.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>Você ainda não tem cabanas anunciadas.</Text>
            <Text style={styles.emptyStateText}>Clique em "Novo Anúncio" para começar!</Text>
          </View>
        )}

        {!loading && listings.map((cabin) => (          <View key={cabin.id} style={styles.cabinCard}>
            <Image
              source={{ uri: cabin.image || 'https://images.unsplash.com/photo-1542718610-a1d656d1884c?w=400&q=80' }}
              style={styles.cabinImage}
            />

            <View style={styles.cabinInfo}>
              <Text style={styles.cabinTitle} numberOfLines={1}>{cabin.title}</Text>

              <View style={styles.cabinLocationRow}>
                <MapPin size={14} color="#6B7280" />
                <Text style={styles.cabinLocation}>{cabin.location || 'Localização não informada'}</Text>
              </View>

              <Text style={styles.cabinPrice}>
                {cabin.price ? `R$ ${cabin.price}` : 'Preço não informado'}
                {cabin.price ? <Text style={styles.perNight}> / noite</Text> : null}
              </Text>

              {cabin.status && (
                <View style={[styles.statusBadge, { backgroundColor: STATUS_LABELS[cabin.status].bg }]}>
                  <Text style={[styles.statusBadgeText, { color: STATUS_LABELS[cabin.status].color }]}>
                    {STATUS_LABELS[cabin.status].label}
                  </Text>
                </View>
              )}

              {(cabin.bookingsCount || 0) > 0 && (                <View style={styles.bookingBadge}>
                  <Text style={styles.bookingBadgeText}>{cabin.bookingsCount} reserva(s) em breve</Text>
                </View>
              )}
            </View>

            <View style={styles.actionButtons}>
              <TouchableOpacity style={styles.actionBtn} onPress={() => handleEdit(cabin)}>
                <Edit size={18} color="#4B5563" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={() => handleDelete(cabin.id, cabin.title)}>
                <Trash2 size={18} color="#EF4444" />
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

      <TouchableOpacity 
        style={styles.fab} 
        activeOpacity={0.8}
        onPress={() => router.push('/create-listing')}
      >
        <Plus size={24} color="#fff" />
        <Text style={styles.fabText}>Novo Anúncio</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 60, paddingHorizontal: 20, paddingBottom: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  backButton: { padding: 8, marginLeft: -8 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#1F2937' },
  statsContainer: { flexDirection: 'row', gap: 15, marginBottom: 30 },
  statCard: { flex: 1, backgroundColor: '#F9FAFB', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB' },
  statValue: { fontSize: 20, fontWeight: 'bold', color: '#1F2937', marginTop: 8 },
  statLabel: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#1F2937' },
  cabinCard: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 16, overflow: 'hidden' },
  cabinImage: { width: 100, height: '100%', resizeMode: 'cover' },
  cabinInfo: { flex: 1, padding: 12 },
  cabinTitle: { fontSize: 16, fontWeight: 'bold', color: '#1F2937', marginBottom: 4 },
  cabinLocationRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  cabinLocation: { fontSize: 12, color: '#6B7280', marginLeft: 4 },
  cabinPrice: { fontSize: 15, fontWeight: 'bold', color: '#2D5A27', marginBottom: 8 },
  perNight: { fontSize: 12, color: '#6B7280', fontWeight: 'normal' },
  bookingBadge: { backgroundColor: '#FEF3C7', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  bookingBadgeText: { fontSize: 10, color: '#D97706', fontWeight: 'bold' },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginBottom: 8 },
  statusBadgeText: { fontSize: 10, fontWeight: 'bold' },
  actionButtons: { justifyContent: 'center', padding: 10, borderLeftWidth: 1, borderLeftColor: '#F3F4F6', backgroundColor: '#F9FAFB' },
  actionBtn: { padding: 10, marginVertical: 4, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  fab: { position: 'absolute', bottom: 30, right: 20, backgroundColor: '#2D5A27', flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 20, borderRadius: 30, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 5, elevation: 5 },
  fabText: { color: '#fff', fontWeight: 'bold', fontSize: 16, marginLeft: 8 },
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyStateText: { color: '#9CA3AF', fontSize: 14, textAlign: 'center', lineHeight: 22 },
});