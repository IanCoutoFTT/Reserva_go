import { ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatBR, isInRanges, MONTH_NAMES, monthCells, nightsBetween, parseISO, pickDay, Range, toISO } from '../lib/dateRange';

type Props = {
  visible: boolean;
  title: string;
  onClose: () => void;
  onConfirm: (range: Range) => void;
  /** Primeiro dia que pode ser escolhido (padrão: hoje). */
  minDate?: string;
  /** Períodos [início, fim) que não podem ser escolhidos (já reservados ou bloqueados). */
  unavailable?: readonly Range[];
  initial?: { start: string | null; end: string | null };
  /** Máximo de noites do período (padrão: sem limite). */
  maxNights?: number;
  confirmLabel?: string;
  startLabel?: string;
  endLabel?: string;
};

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

/**
 * Seletor de período (entrada e saída) feito só com View: dois toques escolhem o intervalo. Dias
 * passados e os períodos indisponíveis ficam apagados e não respondem ao toque. Usado no filtro
 * por data da Explorar e no calendário de bloqueio do anfitrião.
 */
export function DateRangePicker({
  visible, title, onClose, onConfirm, minDate, unavailable = [], initial, maxNights,
  confirmLabel = 'Confirmar', startLabel = 'Entrada', endLabel = 'Saída',
}: Props) {
  const insets = useSafeAreaInsets();
  const min = minDate ?? toISO(new Date());
  const [sel, setSel] = useState<{ start: string | null; end: string | null }>(initial ?? { start: null, end: null });
  const [month, setMonth] = useState(() => {
    const p = parseISO(initial?.start ?? min) ?? { year: new Date().getFullYear(), month0: new Date().getMonth(), day: 1 };
    return { year: p.year, month0: p.month0 };
  });

  // Ao reabrir, volta ao que estava escolhido.
  useEffect(() => {
    if (visible) setSel(initial ?? { start: null, end: null });
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const cells = useMemo(() => monthCells(month.year, month.month0), [month]);
  const nights = sel.start && sel.end ? nightsBetween(sel.start, sel.end) : 0;
  const tooLong = !!maxNights && nights > maxNights;

  const shift = (delta: number) => {
    const d = new Date(month.year, month.month0 + delta, 1);
    setMonth({ year: d.getFullYear(), month0: d.getMonth() });
  };

  const disabled = (iso: string) => iso < min || isInRanges(iso, unavailable);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Fechar" hitSlop={8}>
              <X size={24} color="#1F2937" />
            </TouchableOpacity>
          </View>

          <View style={styles.monthRow}>
            <TouchableOpacity onPress={() => shift(-1)} accessibilityRole="button" accessibilityLabel="Mês anterior" hitSlop={8} style={styles.arrow}>
              <ChevronLeft size={22} color="#2D5A27" />
            </TouchableOpacity>
            <Text style={styles.monthTitle} testID="drp-month">{MONTH_NAMES[month.month0]} {month.year}</Text>
            <TouchableOpacity onPress={() => shift(1)} accessibilityRole="button" accessibilityLabel="Próximo mês" hitSlop={8} style={styles.arrow}>
              <ChevronRight size={22} color="#2D5A27" />
            </TouchableOpacity>
          </View>

          <View style={styles.weekRow}>
            {WEEKDAYS.map((w, i) => (
              <Text key={i} style={styles.weekday}>{w}</Text>
            ))}
          </View>

          <View style={styles.grid}>
            {cells.map((iso, i) => {
              if (!iso) return <View key={`e${i}`} style={styles.cell} />;
              const p = parseISO(iso)!;
              const off = disabled(iso);
              const isStart = iso === sel.start;
              const isEnd = iso === sel.end;
              const inside = !!sel.start && !!sel.end && iso > sel.start && iso < sel.end;
              return (
                <TouchableOpacity
                  key={iso}
                  style={styles.cell}
                  disabled={off}
                  onPress={() => setSel((cur) => pickDay(cur, iso, unavailable))}
                  accessibilityRole="button"
                  accessibilityLabel={`${p.day} de ${MONTH_NAMES[p.month0]}${off ? ', indisponível' : ''}${isStart ? ', entrada' : ''}${isEnd ? ', saída' : ''}`}
                  accessibilityState={{ disabled: off, selected: isStart || isEnd }}
                  testID={`drp-day-${iso}`}
                >
                  <View style={[styles.dayBox, inside && styles.dayInside, (isStart || isEnd) && styles.dayEdge]}>
                    <Text style={[styles.dayText, off && styles.dayOff, (isStart || isEnd) && styles.dayEdgeText]}>{p.day}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.summary}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>{startLabel}</Text>
              <Text style={styles.summaryValue} testID="drp-start">{sel.start ? formatBR(sel.start) : 'Escolha'}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>{endLabel}</Text>
              <Text style={styles.summaryValue} testID="drp-end">{sel.end ? formatBR(sel.end) : 'Escolha'}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Noites</Text>
              <Text style={styles.summaryValue}>{nights || '—'}</Text>
            </View>
          </View>
          {tooLong && <Text style={styles.error}>Escolha no máximo {maxNights} noites.</Text>}

          <TouchableOpacity
            style={[styles.confirm, (!sel.start || !sel.end || tooLong) && styles.confirmOff]}
            disabled={!sel.start || !sel.end || tooLong}
            onPress={() => sel.start && sel.end && onConfirm({ start: sel.start, end: sel.end })}
            accessibilityRole="button"
            accessibilityLabel={confirmLabel}
            testID="drp-confirm"
          >
            <Text style={styles.confirmText}>{confirmLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  title: { fontSize: 18, fontWeight: 'bold', color: '#1F2937' },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 8 },
  arrow: { padding: 6 },
  monthTitle: { fontSize: 16, fontWeight: '700', color: '#1F2937' },
  weekRow: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontSize: 12, color: '#9CA3AF', fontWeight: '600', paddingVertical: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: 44, alignItems: 'center', justifyContent: 'center' },
  dayBox: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  dayInside: { backgroundColor: '#E4F0E3', borderRadius: 8 },
  dayEdge: { backgroundColor: '#2D5A27' },
  dayText: { fontSize: 14, color: '#1F2937', fontWeight: '500' },
  dayOff: { color: '#D1D5DB', textDecorationLine: 'line-through' },
  dayEdgeText: { color: '#fff', fontWeight: '700' },
  summary: { flexDirection: 'row', gap: 10, marginTop: 14 },
  summaryItem: { flex: 1, backgroundColor: '#F9FAFB', borderRadius: 12, padding: 10 },
  summaryLabel: { fontSize: 11, color: '#6B7280' },
  summaryValue: { fontSize: 14, fontWeight: '700', color: '#1F2937', marginTop: 2 },
  error: { color: '#DC2626', fontSize: 13, marginTop: 8 },
  confirm: { backgroundColor: '#2D5A27', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  confirmOff: { opacity: 0.4 },
  confirmText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
