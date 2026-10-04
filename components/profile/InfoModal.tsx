import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { X } from 'lucide-react-native';
import type { InfoSection } from './profileContent';

export type InfoModalProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  sections: InfoSection[];
  footerText: string;
};

export function InfoModal({ visible, onClose, title, subtitle, sections, footerText }: InfoModalProps) {
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.infoModalContent}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>{title}</Text>
              <Text style={styles.modalSubtitle}>{subtitle}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeModalBtn}>
              <X size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20 }}>
            {sections.map((section, index) => {
              const Icon = section.icon;
              return (
                <View key={index} style={styles.infoSection}>
                  <View style={styles.infoSectionHeader}>
                    <View style={styles.infoIconCircle}>
                      <Icon size={18} color="#2D5A27" />
                    </View>
                    <Text style={styles.infoSectionTitle}>{section.title}</Text>
                  </View>
                  <Text style={styles.infoSectionBody}>{section.body}</Text>
                  {index < sections.length - 1 && <View style={styles.infoSectionDivider} />}
                </View>
              );
            })}
            <View style={styles.infoFooter}>
              <Text style={styles.infoFooterText}>{footerText}</Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  infoModalContent: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, height: '80%' },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: 20, borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1F2937' },
  modalSubtitle: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  closeModalBtn: { padding: 5 },
  infoSection: { marginBottom: 20 },
  infoSectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  infoIconCircle: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#F0F7F0',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  infoSectionTitle: { fontSize: 15, fontWeight: '700', color: '#1F2937', flex: 1 },
  infoSectionBody: { fontSize: 14, color: '#4B5563', lineHeight: 22, paddingLeft: 48 },
  infoSectionDivider: { height: 1, backgroundColor: '#F3F4F6', marginTop: 20, marginBottom: 4 },
  infoFooter: { marginTop: 24, padding: 16, backgroundColor: '#F9FAFB', borderRadius: 12, marginBottom: 20 },
  infoFooterText: { fontSize: 12, color: '#9CA3AF', textAlign: 'center', lineHeight: 18 },
});
