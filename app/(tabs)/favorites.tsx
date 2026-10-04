import { StyleSheet, Text, View, FlatList, TouchableOpacity } from 'react-native';
import { PropertyCard } from '../../components/PropertyCard';
import { useListings } from '../../context/ListingContext';
import { useFavorites } from '../../context/FavoritesContext';
import { useRouter } from 'expo-router';

export default function FavoritesScreen() {
  const { favorites } = useFavorites();
  const { allProperties = [] } = useListings() || {};
  const router = useRouter();

  const favoriteItems = allProperties.filter((item) => favorites.includes(item.id));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Meus Favoritos</Text>
      </View>
      {favoriteItems.length > 0 ? (
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