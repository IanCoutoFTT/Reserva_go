import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { User, Home } from 'lucide-react-native';

export default function SelectRoleScreen() {
  const router = useRouter();
  const { updateRole, user } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleSelection = async (role: 'hospede' | 'anfitriao') => {
    setLoading(true);
    await updateRole(role);
    setLoading(false);
    router.replace('/(tabs)');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Como você prefere usar o app?</Text>
      <Text style={styles.subtitle}>
        Olá{user?.name ? `, ${user.name.split(' ')[0]}` : ''}! Escolha seu perfil para começar.
      </Text>

      <TouchableOpacity style={styles.card} onPress={() => handleSelection('hospede')} disabled={loading}>
        <User size={32} color="#2D5A27" />
        <View style={styles.cardText}>
          <Text style={styles.cardTitle}>Sou Hóspede</Text>
          <Text style={styles.cardSub}>Quero buscar e reservar cabanas.</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={styles.card} onPress={() => handleSelection('anfitriao')} disabled={loading}>
        <Home size={32} color="#2D5A27" />
        <View style={styles.cardText}>
          <Text style={styles.cardTitle}>Sou Anfitrião</Text>
          <Text style={styles.cardSub}>Quero anunciar meu imóvel e ganhar dinheiro.</Text>
        </View>
      </TouchableOpacity>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#2D5A27" />
          <Text style={styles.loadingText}>Configurando seu perfil...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 25, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 15, color: '#6B7280', textAlign: 'center', marginBottom: 30 },
  card: { flexDirection: 'row', alignItems: 'center', padding: 20, borderRadius: 15, backgroundColor: '#F9FAFB', marginBottom: 15, borderWidth: 1, borderColor: '#F3F4F6' },
  cardText: { marginLeft: 15 },
  cardTitle: { fontSize: 18, fontWeight: 'bold' },
  cardSub: { fontSize: 14, color: '#6B7280' },
  loadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.85)', justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: '#2D5A27', fontWeight: '600', fontSize: 15 }
});
