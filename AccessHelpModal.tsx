import { KeyRound, Mail, ShieldCheck, X } from 'lucide-react-native';
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { RF, SERIF } from '../../constants/Refugio';
import { LEGAL_CONTACT } from '../profile/profileContent';

/** "Problemas com o acesso?" - orientações reais, sem prometer canal que não existe. */
export function AccessHelpModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <TouchableOpacity style={styles.close} onPress={onClose} accessibilityLabel="Fechar">
            <X size={18} color={RF.pine} />
          </TouchableOpacity>

          <Text style={styles.title}>Ajuda com o acesso</Text>
          <Text style={styles.subtitle}>O que costuma resolver</Text>

          <Item
            icon={<ShieldCheck size={18} color={RF.moss} />}
            title="Criou a conta com o Google?"
            text='Ela não tem senha própria. Volte e toque em "Entrar com Google" - ou use "Esqueceu sua senha?" para criar uma.'
          />
          <Item
            icon={<Mail size={18} color={RF.moss} />}
            title="O código não chegou?"
            text="Confira a caixa de spam e lixo eletrônico. Você pode pedir um novo código depois de 1 minuto."
          />
          <Item
            icon={<KeyRound size={18} color={RF.moss} />}
            title="Não tem mais acesso ao e-mail?"
            text={`Por segurança não trocamos o e-mail da conta pelo app. Fale com ${LEGAL_CONTACT}.`}
          />

          <TouchableOpacity style={styles.button} onPress={onClose}>
            <Text style={styles.buttonText}>ENTENDI</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Item({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <View style={styles.item}>
      <View style={styles.itemIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.itemTitle}>{title}</Text>
        <Text style={styles.itemText}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(22,40,31,0.8)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 480, backgroundColor: RF.cream, borderRadius: 26, padding: 24 },
  close: {
    position: 'absolute', top: 18, right: 18, width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(22,40,31,0.08)', alignItems: 'center', justifyContent: 'center', zIndex: 1,
  },
  title: { fontFamily: SERIF, fontSize: 21, fontWeight: '700', color: RF.pine, paddingRight: 40 },
  subtitle: { fontSize: 11, letterSpacing: 1.6, color: RF.warmgray, textTransform: 'uppercase', marginTop: 4, marginBottom: 16 },
  item: {
    flexDirection: 'row', gap: 12, padding: 14, borderRadius: 14, marginBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.85)', borderWidth: 1, borderColor: 'rgba(22,40,31,0.08)',
  },
  itemIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(35,63,49,0.08)', alignItems: 'center', justifyContent: 'center' },
  itemTitle: { fontSize: 13, fontWeight: '700', color: RF.pine },
  itemText: { fontSize: 12, lineHeight: 18, color: RF.muted, marginTop: 2 },
  button: { marginTop: 8, minHeight: 50, borderRadius: 999, backgroundColor: RF.pine, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: RF.cream, fontSize: 12, fontWeight: '700', letterSpacing: 1.6 },
});
