import { ImageOff, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getChatImageUrl } from '../services/chatImageService';

type Props = { path: string };

/**
 * Foto de uma mensagem do chat. O arquivo fica num bucket privado, então busca um link temporário;
 * toque para ver em tela cheia. Falha de carregamento mostra um aviso em vez de um quadrado vazio.
 */
export function ChatImage({ path }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setFailed(false);
    getChatImageUrl(path).then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data) setFailed(true);
      else setUrl(data);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (failed) {
    return (
      <View style={[styles.thumb, styles.center]} testID="chat-image-failed" accessibilityLabel="Foto indisponível">
        <ImageOff size={22} color="#9CA3AF" />
        <Text style={styles.failedText}>Foto indisponível</Text>
      </View>
    );
  }

  if (!url) {
    return (
      <View style={[styles.thumb, styles.center]} testID="chat-image-loading" accessibilityLabel="Carregando foto">
        <ActivityIndicator color="#2D5A27" />
      </View>
    );
  }

  return (
    <>
      <TouchableOpacity onPress={() => setOpen(true)} accessibilityRole="imagebutton" accessibilityLabel="Foto enviada no chat. Toque para ampliar." testID="chat-image">
        <Image source={{ uri: url }} style={styles.thumb} resizeMode="cover" />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.viewer}>
          <TouchableOpacity style={styles.close} onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel="Fechar foto" testID="chat-image-close" hitSlop={12}>
            <X size={28} color="#fff" />
          </TouchableOpacity>
          <Image source={{ uri: url }} style={styles.full} resizeMode="contain" />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  thumb: { width: 210, height: 210, borderRadius: 12, backgroundColor: '#E5E7EB' },
  center: { alignItems: 'center', justifyContent: 'center', gap: 6 },
  failedText: { fontSize: 12, color: '#6B7280' },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' },
  close: { position: 'absolute', top: 48, right: 20, zIndex: 2, padding: 6 },
  full: { width: '100%', height: '85%' },
});
