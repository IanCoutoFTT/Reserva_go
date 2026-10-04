import { Text, TextProps } from './Themed';

// Texto com a fonte SpaceMono (carregada em app/_layout.tsx via useFonts).
export function MonoText(props: TextProps) {
  return <Text {...props} style={[props.style, { fontFamily: 'SpaceMono' }]} />;
}
