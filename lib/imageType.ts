// Content-type de upload a partir da extensão do arquivo escolhido no
// expo-image-picker. Antes era `image/${extensão}` direto: "jpg" virava
// "image/jpg" (não é um MIME padrão) e qualquer extensão estranha virava um
// content-type inventado. Os buckets só aceitam imagens (migração 008), então
// mapeamos para os tipos reais e caímos em JPEG quando não reconhece.
const TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
};

export function imageTypeFromUri(uri: string): { ext: string; contentType: string } {
  const raw = uri.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  const ext = raw in TYPES ? (raw === 'jpeg' ? 'jpg' : raw) : 'jpg';
  return { ext, contentType: TYPES[ext] };
}
