import { useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { reportError } from '../services/errorService';

type Props = { error: Error; retry: () => void };

/**
 * Tela mostrada quando uma tela do app quebra (substitui a tela padrão do expo-router): registra o
 * erro no Supabase (migração 022) e oferece tentar de novo, em vez de deixar a pessoa sem saída.
 */
export function AppErrorBoundary({ error, retry }: Props) {
  useEffect(() => {
    reportError(error, 'tela quebrada');
  }, [error]);

  return (
    <View style={styles.container} accessibilityRole="alert">
      <Text style={styles.title}>Algo deu errado</Text>
      <Text style={styles.text}>
        Tivemos um problema nesta tela. O erro já foi registrado para a equipe. Você pode tentar de novo.
      </Text>
      <TouchableOpacity style={styles.button} onPress={retry} accessibilityRole="button" accessibilityLabel="Tentar de novo" testID="error-retry">
        <Text style={styles.buttonText}>Tentar de novo</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#fff', gap: 14 },
  title: { fontSize: 22, fontWeight: '800', color: '#1F2937', textAlign: 'center' },
  text: { fontSize: 15, color: '#6B7280', textAlign: 'center', lineHeight: 22 },
  button: { backgroundColor: '#2D5A27', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 28, marginTop: 6 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
