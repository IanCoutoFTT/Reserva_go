// Comodidades que o anfitrião marca ao anunciar e que o hóspede pode usar como filtro.
// Os textos são gravados do jeito que estão em properties.amenities: não renomeie sem migrar os dados.
export const AMENITY_OPTIONS = [
  'Wi-Fi',
  'Piscina',
  'Churrasqueira',
  'Lareira',
  'Ar-condicionado',
  'Cozinha completa',
  'Estacionamento',
  'Vista panorâmica',
  'Trilha privativa',
  'Aceita pets',
] as const;

export type Amenity = (typeof AMENITY_OPTIONS)[number];
