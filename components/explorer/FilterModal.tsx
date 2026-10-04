import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { X } from 'lucide-react-native';
import { PRICE_RANGES, ISOLATION_OPTIONS, PriceRange, IsolationOption } from './exploreConstants';

export type FilterModalProps = {
  visible: boolean;
  onClose: () => void;
  tempPriceRange: PriceRange;
  onChangePriceRange: (range: PriceRange) => void;
  tempIsolation: IsolationOption;
  onChangeIsolation: (opt: IsolationOption) => void;
  onClear: () => void;
  onApply: () => void;
};

export function FilterModal({
  visible, onClose, tempPriceRange, onChangePriceRange,
  tempIsolation, onChangeIsolation, onClear, onApply,
}: FilterModalProps) {
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Filtros</Text>
            <TouchableOpacity onPress={onClose}>
              <X size={24} color="#1F2937" />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <Text style={styles.filterSectionLabel}>Faixa de Preço</Text>
            <View style={styles.filterOptionsGrid}>
              {PRICE_RANGES.map((range) => (
                <TouchableOpacity
                  key={range.id}
                  style={[styles.filterOptionChip, tempPriceRange.id === range.id && styles.filterOptionChipActive]}
                  onPress={() => onChangePriceRange(range)}
                >
                  <Text style={[styles.filterOptionText, tempPriceRange.id === range.id && styles.filterOptionTextActive]}>
                    {range.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.filterDivider} />
            <Text style={styles.filterSectionLabel}>Nível de Isolamento</Text>
            <View style={styles.filterIsolationList}>
              {ISOLATION_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.id}
                  style={[styles.filterIsolationItem, tempIsolation.id === opt.id && styles.filterIsolationItemActive]}
                  onPress={() => onChangeIsolation(opt)}
                >
                  <Text style={styles.filterIsolationEmoji}>{opt.emoji}</Text>
                  <Text style={[styles.filterIsolationLabel, tempIsolation.id === opt.id && styles.filterIsolationLabelActive]}>
                    {opt.label}
                  </Text>
                  {tempIsolation.id === opt.id && <View style={styles.filterCheckDot} />}
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.clearBtn} onPress={onClear}>
              <Text style={styles.clearBtnText}>Limpar filtros</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.applyBtn} onPress={onApply}>
              <Text style={styles.applyBtnText}>Aplicar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '80%' },
  modalHandle: { width: 40, height: 4, backgroundColor: '#DDD', alignSelf: 'center', marginVertical: 12, borderRadius: 2 },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1F2937' },
  modalBody: { padding: 20, paddingBottom: 10 },
  filterSectionLabel: {
    fontSize: 14, fontWeight: '700', color: '#374151',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 14,
  },
  filterOptionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  filterOptionChip: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
    borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB',
  },
  filterOptionChipActive: { borderColor: '#2D5A27', backgroundColor: '#F0F7F0' },
  filterOptionText: { fontSize: 13, color: '#4B5563', fontWeight: '500' },
  filterOptionTextActive: { color: '#2D5A27', fontWeight: '700' },
  filterDivider: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 20 },
  filterIsolationList: { gap: 10 },
  filterIsolationItem: {
    flexDirection: 'row', alignItems: 'center', padding: 14,
    borderRadius: 14, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB',
  },
  filterIsolationItemActive: { borderColor: '#2D5A27', backgroundColor: '#F0F7F0' },
  filterIsolationEmoji: { fontSize: 20, marginRight: 12 },
  filterIsolationLabel: { flex: 1, fontSize: 14, color: '#4B5563', fontWeight: '500' },
  filterIsolationLabelActive: { color: '#2D5A27', fontWeight: '700' },
  filterCheckDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#2D5A27' },
  modalFooter: {
    flexDirection: 'row', gap: 12, padding: 20,
    paddingBottom: 34, borderTopWidth: 1, borderTopColor: '#F3F4F6',
  },
  clearBtn: { flex: 1, padding: 15, borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center' },
  clearBtnText: { fontWeight: '600', color: '#374151', fontSize: 15 },
  applyBtn: { flex: 2, padding: 15, borderRadius: 14, backgroundColor: '#2D5A27', alignItems: 'center' },
  applyBtnText: { fontWeight: 'bold', color: '#fff', fontSize: 15 },
});
