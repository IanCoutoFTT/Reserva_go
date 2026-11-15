import { CalendarDays, Trash2, X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatBR, nightsBetween, Range } from '../lib/dateRange';
import { addBlock, listBlocks, PropertyBlock, removeBlock } from '../services/availabilityService';
import { DateRangePicker } from './DateRangePicker';

type Props = {
  visible: boolean;
  propertyId: string;
  propertyTitle: string;
  userId: string;
  onClose: () => void;
};

/**
 * Calendário de bloqueio do anfitrião (migração 021): períodos em que a cabana NÃO aceita
 * reservas (manutenção, uso próprio, feriado). O banco recusa bloqueio sobre reserva ativa e
 * reserva em cima de bloqueio; aqui só se escolhe, lista e remove.
 */
export function BlockDatesModal({ visible, propertyId, propertyTitle, userId, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [blocks, setBlocks] = useState<PropertyBlock[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    setBlocks(null);
    setLoadFailed(false);
    const { data, error } = await listBlocks(propertyId);
    if (error || !data) {
      setLoadFailed(true);
      setBlocks([]);
    } else {
      setBlocks(data);
    }
  }, [propertyId]);

  useEffect(() => {
    if (visible) {
      setReason('');
      load();
    }
  }, [visible, load]);

  const unavailable: Range[] = (blocks ?? []).map((b) => ({ start: b.start_date, end: b.end_date }));

  const confirmRange = async (range: Range) => {
    setPicking(false);
    setSaving(true);
    const { error } = await addBlock({ propertyId, userId, start: range.start, end: range.end, reason });
    setSaving(false);
    if (error) {
      Alert.alert('Bloqueio não salvo', error);
      return;
    }
    setReason('');
    load();
  };

  const remove = (b: PropertyBlock) => {
    Alert.alert('Remover bloqueio?', `As datas de ${formatBR(b.start_date)} a ${formatBR(b.end_date)} voltam a aceitar reservas.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          setRemovingId(b.id);
          const { error } = await removeBlock(b.id);
          setRemovingId(null);
          if (error) {
            Alert.alert('Não foi possível remover', error);
            return;
          }
          load();
        },
      },
    ]);
  };

  return (
    <>
      <Modal visible={visible && !picking} animationType="slide" transparent onRequestClose={onClose}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]}>
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Bloquear datas</Text>
                <Text style={styles.subtitle} numberOfLines={1}>{propertyTitle}</Text>
              </View>
              <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Fechar" hitSlop={8}>
                <X size={24} color="#1F2937" />
              </TouchableOpacity>
            </View>

            <Text style={styles.help}>Nessas datas a cabana não aceita reservas. Reservas já feitas não são afetadas: cancele-as antes de bloquear o período.</Text>

            <ScrollView style={{ maxHeight: 280 }} contentContainerStyle={{ gap: 10 }}>
              {blocks === null ? (
                <ActivityIndicator color="#2D5A27" style={{ marginVertical: 16 }} testID="blocks-loading" />
              ) : blocks.length === 0 ? (
                <Text style={styles.empty} testID="blocks-empty">
                  {loadFailed ? 'Não foi possível carregar os bloqueios agora.' : 'Nenhum período bloqueado.'}
                </Text>
              ) : (
                blocks.map((b) => (
                  <View key={b.id} style={styles.row} testID="block-row">
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowDates}>{formatBR(b.start_date)} → {formatBR(b.end_date)}</Text>
                      <Text style={styles.rowMeta}>
                        {nightsBetween(b.start_date, b.end_date)} noite{nightsBetween(b.start_date, b.end_date) === 1 ? '' : 's'}
                        {b.reason ? ` · ${b.reason}` : ''}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => remove(b)}
                      disabled={removingId === b.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Remover bloqueio de ${formatBR(b.start_date)} a ${formatBR(b.end_date)}`}
                      hitSlop={8}
                      testID="block-remove"
                    >
                      {removingId === b.id ? <ActivityIndicator size="small" color="#EF4444" /> : <Trash2 size={20} color="#EF4444" />}
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>

            <TextInput
              style={styles.input}
              value={reason}
              onChangeText={setReason}
              placeholder="Motivo (opcional): manutenção, uso próprio..."
              placeholderTextColor="#9CA3AF"
              maxLength={200}
              accessibilityLabel="Motivo do bloqueio"
            />

            <TouchableOpacity
              style={[styles.add, saving && styles.addOff]}
              onPress={() => setPicking(true)}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="Bloquear um novo período"
              testID="block-add"
            >
              {saving ? <ActivityIndicator color="#fff" /> : (
                <>
                  <CalendarDays size={18} color="#fff" />
                  <Text style={styles.addText}>Bloquear novo período</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <DateRangePicker
        visible={visible && picking}
        title="Quais datas bloquear?"
        onClose={() => setPicking(false)}
        onConfirm={confirmRange}
        unavailable={unavailable}
        maxNights={365}
        startLabel="Início"
        endLabel="Fim"
        confirmLabel="Bloquear estas datas"
      />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  title: { fontSize: 18, fontWeight: 'bold', color: '#1F2937' },
  subtitle: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  help: { fontSize: 12.5, color: '#6B7280', lineHeight: 18 },
  empty: { textAlign: 'center', color: '#9CA3AF', paddingVertical: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#F9FAFB', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#F3F4F6' },
  rowDates: { fontSize: 14, fontWeight: '700', color: '#1F2937' },
  rowMeta: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  input: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 12, padding: 12, fontSize: 14, color: '#1F2937' },
  add: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2D5A27', borderRadius: 14, paddingVertical: 14 },
  addOff: { opacity: 0.6 },
  addText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
