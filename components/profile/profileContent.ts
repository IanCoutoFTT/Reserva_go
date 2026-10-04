import {
  Home, AlertCircle, Calendar, ShieldCheck,
  Database, Eye, EyeOff, Lock,
} from 'lucide-react-native';

export type InfoSection = { icon: React.ComponentType<any>; title: string; body: string };

// PAST_TRIPS (mock de "Refúgio das Pedras"/"Cabana Suíça") removido - o
// GuestDashboard agora recebe as viagens concluídas de verdade via prop
// `pastTrips`, montada em app/(tabs)/profile.tsx a partir de
// bookingService.getBookingsByGuest (RF-008).

export const ALL_INTERESTS = [
  'Atividades ao ar livre', 'Esportes aquáticos', 'Gastronomia',
  'Vinho', 'Trilhas', 'Neve', 'Praia', 'Isolamento',
];

export const PRIVACY_SECTIONS: InfoSection[] = [
  {
    icon: Database,
    title: 'Dados que coletamos',
    body: 'Coletamos informações básicas de cadastro (nome, e-mail), histórico de reservas e preferências de uso para personalizar sua experiência. Nunca vendemos seus dados a terceiros.',
  },
  {
    icon: Eye,
    title: 'Visibilidade do perfil',
    body: 'Seu perfil é visível apenas para anfitriões com quem você tem uma reserva ativa ou concluída. Outros usuários não conseguem encontrar seu perfil na plataforma.',
  },
  {
    icon: EyeOff,
    title: 'Recibos de leitura',
    body: 'Por padrão, os recibos de leitura de mensagens estão ativados. Você pode desativá-los nas configurações de notificação, mas isso também impedirá que você veja os recibos dos outros.',
  },
  {
    icon: Lock,
    title: 'Segurança dos dados',
    body: 'Todas as informações são armazenadas com criptografia de ponta a ponta. Senhas nunca são salvas em texto simples. Utilizamos autenticação segura via Google OAuth.',
  },
];

export const TERMS_SECTIONS: InfoSection[] = [
  {
    icon: Home,
    title: 'Uso da plataforma',
    body: 'O ReservaGO é uma plataforma de conexão entre hóspedes e anfitriões. Ao usar o app, você concorda em fornecer informações verdadeiras e utilizar o serviço de forma ética e legal.',
  },
  {
    icon: AlertCircle,
    title: 'Responsabilidades',
    body: 'O ReservaGO não se responsabiliza por danos materiais ocorridos durante hospedagens. Anfitriões são responsáveis pela manutenção e segurança dos imóveis anunciados.',
  },
  {
    icon: Calendar,
    title: 'Cancelamentos e reembolsos',
    body: 'Cancelamentos feitos com mais de 7 dias de antecedência recebem reembolso integral. Entre 3 e 7 dias, 50% do valor. Menos de 3 dias, sem reembolso — salvo casos de força maior.',
  },
  {
    icon: ShieldCheck,
    title: 'Política de privacidade',
    body: 'Ao usar o ReservaGO, você concorda com nossa Política de Privacidade, que descreve como coletamos, usamos e protegemos seus dados pessoais conforme a LGPD.',
  },
];
