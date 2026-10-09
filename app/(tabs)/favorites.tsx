import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { PropertyCard } from '../../components/PropertyCard';
import { mapPropertyToListing } from '../../components/explorer/mapPropertyToListing';
import { useAuth } from '../../context/AuthContext';
import { useFavorites } from '../../context/FavoritesContext';
import { Listing, useListings } from '../../context/ListingContext';
import { getPropertiesByIds } from '../../services/propertyService';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function FavoritesScreen() {
  const { favorites } = useFavorites();
  const { user } = useAuth();
  const { allProperties = [] } = useListings() || {};
  const router = useRouter();

  // Antes esta tela filtrava só `allProperties` (as cabanas de exemplo do
  // ListingContext) - favoritar uma cabana REAL do Supabase nunca aparecia
  // aqui. Agora as cabanas reais favoritadas são buscadas no banco; as de
  // exemplo (ids "p1", "c2"...) continuam vindo do contexto local.
  const isStaticUser = !!user?.id && user.id.startsWith('static-');
  const [remoteItems, setRemoteItems] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);

  const remoteIds = useMemo(
    () => (isStaticUser ? [] : favorites.filter((id) => UUID_RE.test(id))),
    [favorites, isStaticUser]
  );
  const remoteKey = remoteIds.join(',');

  useFocusEffect(
    useCallback(() => {
      if (remoteIds.length === 0) {
        setRemoteItems([]);
        return;
      }
      let cancelled = false;
      setLoading(true);
      getPropertiesByIds(remoteIds).then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.log('[favorites] getPropertiesByIds falhou ->', error);
        setRemoteItems((data ?? []).map(mapPropertyToListing));
        setLoading(false);
      });
      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [remoteKey])
  );

  const favoriteItems = useMemo(() => {
    const local = allProperties.filter((item) => favorites.includes(item.id));
    const remote = remoteItems.filter((item) => favorites.includes(item.id));
    return [...remote, ...local];
  }, [allProperties, remoteItems, favorites]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Meus Favoritos</Text>
      </View>
      {loading && favoriteItems.length === 0 ? (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color="#2D5A27" />
        </View>
      ) : favoriteItems.length > 0 ? (
        <FlatList
          data={favoriteItems}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.cardWrapper}
              activeOpacity={0.9}
              onPress={() =>
                router.push({
                  pathname: '/details',
                  params: {
                    id: item.id,
                    title: item.title,
                    price: String(item.price),
                    location: item.location,
                    description: item.description,
                    image: item.image,
                    isolationLevel: item.isolationLevel,
                    hostId: item.hostId,
                  },
                })
              }
            >
              <PropertyCard {...item} />
            </TouchableOpacity>
          )}
        />
      ) : (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>❤️</Text>
          <Text style={styles.emptyText}>Nenhum favorito ainda</Text>
          <Text style={styles.emptySub}>
            Clique no coração nas cabanas para salvá-las aqui e planejar sua próxima viagem.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  title: { fontSize: 26, fontWeight: 'bold', color: '#1F2937' },
  list: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 100 },
  cardWrapper: { marginBottom: 10 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyIcon: { fontSize: 50, marginBottom: 20, opacity: 0.2 },
  emptyText: { fontSize: 20, fontWeight: 'bold', color: '#374151', textAlign: 'center' },
  emptySub: { fontSize: 15, color: '#6B7280', textAlign: 'center', marginTop: 10, lineHeight: 22 },
});
