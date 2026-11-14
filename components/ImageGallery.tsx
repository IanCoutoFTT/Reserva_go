import { useCallback, useState } from 'react';
import { FlatList, NativeScrollEvent, NativeSyntheticEvent, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { PropertyImage } from './PropertyImage';

type Props = {
  /** Fotos da cabana, na ordem em que devem aparecer (a primeira é a capa). */
  images: string[];
  height?: number;
};

/**
 * Galeria que desliza de lado, uma foto por tela, com contador "1/3" quando há
 * mais de uma. Sem nenhuma foto, mostra o placeholder de sempre.
 */
export function ImageGallery({ images, height = 350 }: Props) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const photos: (string | null)[] = images.length > 0 ? images : [null];

  const onEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.round(e.nativeEvent.contentOffset.x / width);
      setIndex(Math.min(Math.max(next, 0), photos.length - 1));
    },
    [width, photos.length]
  );

  return (
    <View style={{ height }}>
      <FlatList
        data={photos}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item, i) => `${i}-${item ?? 'vazio'}`}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onMomentumScrollEnd={onEnd}
        renderItem={({ item }) => <PropertyImage uri={item} style={{ width, height }} iconSize={64} />}
      />
      {photos.length > 1 && (
        <View style={styles.counter} pointerEvents="none">
          <Text style={styles.counterText} testID="gallery-counter">
            {index + 1}/{photos.length}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  counter: { position: 'absolute', right: 16, bottom: 16, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  counterText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
});
