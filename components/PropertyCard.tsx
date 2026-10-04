import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native'; 
import { Star, MapPin, Heart } from 'lucide-react-native'; 
import { useRouter } from 'expo-router';
import { useFavorites } from '../context/FavoritesContext';

interface PropertyProps {
  id: string;
  title: string;
  location: string;
  price: number;
  rating: number;
  description: string;
  image?: string | null;
  category?: string;
}

export function PropertyCard({ id, title, location, price, rating, description, image, category }: PropertyProps) {
  const router = useRouter();
  const { favorites, toggleFavorite } = useFavorites();
  
  // Verifica se este ID está na lista de favoritos
  const isFavorite = favorites.includes(id);

  return (
    <TouchableOpacity 
      style={styles.card} 
      activeOpacity={0.9}
      onPress={() => router.push({ 
        pathname: "/details", 
        params: { id, title, price, location, description, image } 
      })}
    >
      <View>
        <Image
          source={{ uri: image ?? undefined }}
          style={styles.cardImage}
        />
        
        {/* BOTÃO DE CORAÇÃO SOBRE A IMAGEM */}
        <TouchableOpacity
          style={styles.heartButton}
          onPress={() => toggleFavorite(id)}
          testID="favorite-button"
        >
          <Heart 
            size={24} 
            color={isFavorite ? "#FF385C" : "#FFF"} 
            fill={isFavorite ? "#FF385C" : "rgba(0,0,0,0.3)"} 
          />
        </TouchableOpacity>
      </View>

      <View style={styles.cardInfo}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{title}</Text>
          <View style={styles.rating}>
            <Star size={14} color="#f1c40f" fill="#f1c40f" />
            <Text style={styles.ratingText}>{rating}</Text>
          </View>
        </View>
        <Text style={styles.cardLocation}>
          <MapPin size={12} color="#6B7280" /> {location}
        </Text>
        <Text style={styles.cardPrice}>
          R$ {price} <Text style={styles.perNight}>/ noite</Text>
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { 
    backgroundColor: '#fff', 
    borderRadius: 15, 
    overflow: 'hidden', 
    marginBottom: 20, 
    elevation: 3, 
    shadowColor: '#000', 
    shadowOpacity: 0.1, 
    shadowRadius: 4 
  },
  cardImage: { 
    width: '100%',
    height: 200, 
    backgroundColor: '#F3F4F6' 
  },
  // ESTILO DO BOTÃO DE FAVORITOS
  heartButton: { 
    position: 'absolute', 
    top: 15, 
    right: 15, 
    zIndex: 10,
    // Sombra leve no ícone para aparecer bem em fotos claras
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5
  },
  cardInfo: { padding: 15 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  rating: { flexDirection: 'row', alignItems: 'center' },
  ratingText: { marginLeft: 4, fontSize: 14, fontWeight: 'bold' },
  cardLocation: { color: '#6B7280', fontSize: 13, marginVertical: 5, flexDirection: 'row', alignItems: 'center' },
  cardPrice: { fontSize: 15, fontWeight: 'bold', color: '#2D5A27' },
  perNight: { fontWeight: 'normal', color: '#6B7280' },
});