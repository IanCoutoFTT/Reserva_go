import { Droplets, TreePine, Waves } from 'lucide-react-native';

export const CATEGORIES = [
  { id: '1', name: 'Praia Privativa', icon: Waves },
  { id: '2', name: 'Campo', icon: TreePine },
  { id: '3', name: 'Cachoeira', icon: Droplets },
];

export const ISOLATION_OPTIONS = [
  { id: 'todos', label: 'Todos', emoji: '🗺️' },
  { id: 'urbano', label: 'Vizinhos próximos', emoji: '🏘️' },
  { id: 'semi', label: 'Alguma privacidade', emoji: '🌲' },
  { id: 'isolado', label: 'Bem isolado', emoji: '🏕️' },
  { id: 'extremo', label: 'Isolamento total', emoji: '🌄' },
];

export const PRICE_RANGES = [
  { id: 'todos', label: 'Qualquer preço', min: 0, max: Infinity },
  { id: 'ate500', label: 'Até R$ 500', min: 0, max: 500 },
  { id: '500a800', label: 'R$ 500 – R$ 800', min: 500, max: 800 },
  { id: 'acima800', label: 'Acima de R$ 800', min: 800, max: Infinity },
];

export const SECTIONS: Record<string, { title: string; subCategory: string }[]> = {
  'Praia Privativa': [
    { title: '🔥 Populares', subCategory: 'Populares' },
    { title: '☀️ Praias do Nordeste', subCategory: 'Nordeste' },
    { title: '🌊 Praias do Sul', subCategory: 'Sul' },
  ],
  Campo: [
    { title: '🔥 Populares', subCategory: 'Populares' },
    { title: '🏔️ Nas Montanhas', subCategory: 'Montanhas' },
    { title: '🌾 Nas Planícies', subCategory: 'Planícies' },
  ],
  Cachoeira: [
    { title: '🔥 Populares', subCategory: 'Populares' },
    { title: '🌿 Centro-Oeste', subCategory: 'Centro-Oeste' },
    { title: '💦 Sudeste', subCategory: 'Sudeste' },
  ],
};

export type PriceRange = (typeof PRICE_RANGES)[number];
export type IsolationOption = (typeof ISOLATION_OPTIONS)[number];
