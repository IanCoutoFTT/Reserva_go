import { Platform } from 'react-native';

// Identidade visual "Refúgio" das telas de acesso (login, criar conta e
// recuperação de senha). Paleta tirada do protótipo do Stitch; as fontes são
// as do sistema (serifada para títulos) para não adicionar dependência nova.

export const BRAND = {
  name: 'ReservaGO',
  tagline: 'Refúgios na natureza',
};

export const RF = {
  pine: '#16281F',
  moss: '#233F31',
  darkmoss: '#1B2E24',
  sage: '#4A6B5B',
  leaf: '#7A9A88',
  gold: '#C5A880',
  sand: '#E9E4DC',
  cream: '#F8F6F0',
  paper: '#FAF8F5',
  warmgray: '#8C8A84',
  border: '#DDD6CB',
  divider: '#E2DBD1',
  text: '#1E2822',
  muted: '#57534E',
  error: '#B42318',
  errorBg: '#FEF3F2',
  success: '#1F6F43',
  successBg: '#EAF3EC',
  white: '#FFFFFF',
};

export const SERIF = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  default: 'Georgia, "Times New Roman", serif',
});

// Fotos do painel de imagem (mesmas fontes do Unsplash já usadas no app).
// Se a imagem não carregar, o fundo verde-pinho continua legível.
export const HERO_IMAGES = {
  login: 'https://images.unsplash.com/photo-1510798831971-661eb04b3739?w=1200&q=80',
  register: 'https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?w=1200&q=80',
  recovery: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1200&q=80',
  verify: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&q=80',
  reset: 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=1200&q=80',
};

/** Largura a partir da qual a tela vira duas colunas (web/tablet). */
export const WIDE_BREAKPOINT = 900;
