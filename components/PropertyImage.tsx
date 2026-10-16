import { Home } from 'lucide-react-native';
import { Image, ImageStyle, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

type Props = {
  uri?: string | null;
  style?: StyleProp<ImageStyle>;
  iconSize?: number;
};

/**
 * Foto da cabana com um placeholder visível quando não há imagem. Antes, cabana
 * sem foto aparecia como um bloco cinza/branco vazio, sem nenhuma indicação.
 */
export function PropertyImage({ uri, style, iconSize = 32 }: Props) {
  if (uri) return <Image source={{ uri }} style={style} />;

  return (
    <View style={[styles.placeholder, style as StyleProp<ViewStyle>]} testID="property-image-placeholder">
      <Home size={iconSize} color="#9CA3AF" />
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: { backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
});
