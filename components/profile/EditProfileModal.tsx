import React from 'react';
import {
  View, Text, StyleSheet, Image, TouchableOpacity,
  Modal, ScrollView, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { X, Camera, Check } from 'lucide-react-native';
import { ALL_INTERESTS } from './profileContent';

export type EditProfileModalProps = {
  visible: boolean;
  onClose: () => void;
  avatar: string;
  onPickImage: () => void;
  name: string;
  onChangeName: (value: string) => void;
  bio: string;
  onChangeBio: (value: string) => void;
  interests: string[];
  onToggleInterest: (interest: string) => void;
  onSave: () => void;
  /** true enquanto o upload da foto + o update em profiles estão em andamento (RF-008) - desabilita o botão pra evitar salvar 2x. */
  saving?: boolean;
};

export function EditProfileModal({
  visible, onClose, avatar, onPickImage, name, onChangeName,
  bio, onChangeBio, interests, onToggleInterest, onSave, saving = false,
}: EditProfileModalProps) {
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalContent}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Editar Perfil</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeModalBtn}>
              <X size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20 }}>
            <View style={styles.editAvatarContainer}>
              <Image source={{ uri: avatar }} style={styles.editAvatarImage} />
              <TouchableOpacity style={styles.editAvatarBtn} onPress={onPickImage}>
                <Camera size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Nome completo</Text>
            <TextInput style={styles.input} value={name} onChangeText={onChangeName} />

            <Text style={styles.inputLabel}>Sobre mim</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={bio}
              onChangeText={onChangeBio}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            <Text style={styles.inputLabel}>Seus Interesses</Text>
            <View style={styles.interestsEditGrid}>
              {ALL_INTERESTS.map((interest) => {
                const isSelected = interests.includes(interest);
                return (
                  <TouchableOpacity
                    key={interest}
                    style={[styles.interestEditChip, isSelected && styles.interestEditChipActive]}
                    onPress={() => onToggleInterest(interest)}
                  >
                    <Text style={[styles.interestEditChipText, isSelected && styles.interestEditChipTextActive]}>
                      {interest}
                    </Text>
                    {isSelected && <Check size={14} color="#fff" style={{ marginLeft: 6 }} />}
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={onSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>Salvar Alterações</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, height: '85%' },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: 20, borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1F2937' },
  closeModalBtn: { padding: 5 },
  editAvatarContainer: { alignItems: 'center', marginBottom: 20, position: 'relative' },
  editAvatarImage: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#E5E7EB' },
  editAvatarBtn: {
    position: 'absolute', bottom: 0, right: '35%', backgroundColor: '#2D5A27',
    width: 36, height: 36, borderRadius: 18, alignItems: 'center',
    justifyContent: 'center', borderWidth: 3, borderColor: '#fff',
  },
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8, marginTop: 10 },
  input: {
    backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB',
    borderRadius: 12, padding: 14, fontSize: 16, color: '#1F2937', marginBottom: 10,
  },
  textArea: { height: 100 },
  interestsEditGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 30 },
  interestEditChip: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#fff',
  },
  interestEditChipActive: { backgroundColor: '#2D5A27', borderColor: '#2D5A27' },
  interestEditChipText: { fontSize: 14, color: '#4B5563', fontWeight: '500' },
  interestEditChipTextActive: { color: '#fff', fontWeight: 'bold' },
  saveBtn: { backgroundColor: '#2D5A27', padding: 18, borderRadius: 14, alignItems: 'center', marginTop: 10, marginBottom: 30 },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
