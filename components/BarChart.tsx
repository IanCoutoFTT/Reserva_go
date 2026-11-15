import { StyleSheet, Text, View } from 'react-native';
import type { DayPoint } from '../lib/charts';

type Props = {
  data: DayPoint[];
  /** Como mostrar o valor acima da barra e no resumo (padrão: número inteiro). */
  formatValue?: (v: number) => string;
  height?: number;
  color?: string;
  /** Texto lido pelo leitor de tela, antes dos valores. */
  title: string;
};

/**
 * Gráfico de barras simples, feito só com View (sem biblioteca). Uma barra por dia, com o valor
 * em cima e a data embaixo. Sem nenhum valor, mostra um aviso em vez de barras vazias.
 */
export function BarChart({ data, formatValue = (v) => String(v), height = 120, color = '#2D5A27', title }: Props) {
  const max = Math.max(...data.map((d) => d.value), 0);
  const summary = `${title}: ${data.map((d) => `${d.label} ${formatValue(d.value)}`).join(', ')}`;

  if (max <= 0) {
    return (
      <View style={styles.empty} accessibilityLabel={`${title}: sem movimento nos últimos ${data.length} dias`} testID="bar-chart-empty">
        <Text style={styles.emptyText}>Sem movimento nos últimos {data.length} dias.</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap} accessible accessibilityLabel={summary} testID="bar-chart">
      <View style={[styles.bars, { height: height + 18 }]}>
        {data.map((d) => {
          const h = d.value > 0 ? Math.max(4, Math.round((d.value / max) * height)) : 2;
          return (
            <View key={d.key} style={styles.col} testID="bar-chart-col">
              <Text style={styles.value} numberOfLines={1}>{d.value > 0 ? formatValue(d.value) : ''}</Text>
              <View style={[styles.bar, { height: h, backgroundColor: d.value > 0 ? color : '#E5E7EB' }]} />
            </View>
          );
        })}
      </View>
      <View style={styles.labels}>
        {data.map((d) => (
          <Text key={d.key} style={styles.label} numberOfLines={1}>{d.label}</Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: '#fff', borderRadius: 15, borderWidth: 1, borderColor: '#F3F4F6', padding: 14 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  col: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  bar: { width: '70%', borderRadius: 5 },
  value: { fontSize: 9, color: '#6B7280', marginBottom: 3 },
  labels: { flexDirection: 'row', gap: 6, marginTop: 6 },
  label: { flex: 1, textAlign: 'center', fontSize: 10, color: '#9CA3AF' },
  empty: { backgroundColor: '#fff', borderRadius: 15, borderWidth: 1, borderColor: '#F3F4F6', padding: 18, alignItems: 'center' },
  emptyText: { color: '#9CA3AF', fontSize: 13 },
});
