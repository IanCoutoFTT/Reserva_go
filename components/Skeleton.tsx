import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, ViewStyle } from 'react-native';

/** Bloco cinza que pulsa de leve: ocupa o lugar do conteúdo enquanto ele carrega. */
export function Skeleton({ style }: { style?: ViewStyle }) {
  const opacity = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.55, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return <Animated.View style={[styles.block, style, { opacity }]} />;
}

type ListProps = { count?: number; testID?: string };

/** Lista de cartões (foto + linhas de texto), no formato das cabanas e das reservas. */
export function SkeletonCardList({ count = 3, testID = 'skeleton-cards' }: ListProps) {
  return (
    <View style={styles.list} testID={testID} accessible accessibilityRole="progressbar" accessibilityLabel="Carregando">
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.card}>
          <Skeleton style={styles.cardImage} />
          <Skeleton style={styles.lineWide} />
          <Skeleton style={styles.lineShort} />
          <Skeleton style={styles.linePrice} />
        </View>
      ))}
    </View>
  );
}

/** Lista de linhas (avatar + duas linhas), no formato das conversas. */
export function SkeletonRowList({ count = 5, testID = 'skeleton-rows' }: ListProps) {
  return (
    <View style={styles.list} testID={testID} accessible accessibilityRole="progressbar" accessibilityLabel="Carregando">
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.row}>
          <Skeleton style={styles.avatar} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton style={styles.rowLineWide} />
            <Skeleton style={styles.rowLineShort} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: '#E5E7EB', borderRadius: 8 },
  list: { padding: 20, gap: 18 },
  card: { gap: 10 },
  cardImage: { height: 170, borderRadius: 16 },
  lineWide: { height: 16, width: '70%' },
  lineShort: { height: 12, width: '45%' },
  linePrice: { height: 14, width: '30%' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  rowLineWide: { height: 14, width: '60%' },
  rowLineShort: { height: 11, width: '85%' },
});
