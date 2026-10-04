// Tipos compartilhados pela camada services/. Espelham exatamente as colunas
// de supabase/schema.sql - nenhuma tabela/coluna aqui foi inventada, todas
// conferidas linha a linha no schema antes de escrever este arquivo.

// ── Enums (supabase/schema.sql, CREATE TYPE ...) ────────────────────────
export type UserRole = 'hospede' | 'anfitriao' | 'admin';
export type BookingStatus = 'reservada' | 'realizada' | 'cancelada';
export type PayMethod = 'pix' | 'card';
export type NotificationType = 'reserva' | 'mensagem' | 'promocao' | 'aviso';
export type IsolationLevel = 'urbano' | 'semi' | 'isolado' | 'extremo';
export type ReportStatus = 'pendente' | 'em_analise' | 'resolvido' | 'arquivado';
export type CabinStatus = 'ativo' | 'pendente' | 'suspenso' | 'inativo';

// ── Retorno uniforme de toda função de service ──────────────────────────
export interface ServiceResult<T> {
  data: T | null;
  error: string | null;
}

// ── profiles ─────────────────────────────────────────────────────────
export interface Profile {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  role: UserRole;
  phone: string | null;
  bio: string | null;
  interests: string[];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// ── properties ───────────────────────────────────────────────────────
export interface Property {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  location: string;
  price: number;
  isolation_level: IsolationLevel | null;
  category: string;
  sub_category: string | null;
  images: string[];
  amenities: string[];
  rating: number;
  reviews_count: number;
  status: CabinStatus;
  featured: boolean;
  bookings_count: number;
  created_at: string;
  updated_at: string;
}

export interface PropertyFilters {
  category?: string;
  subCategory?: string;
  isolationLevel?: IsolationLevel;
  search?: string;
  maxPrice?: number;
  minPrice?: number;
  /** Default do service é 'ativo' (o que profiles_public_read/properties_public_read deixam ver publicamente). */
  status?: CabinStatus;
}

export type NewProperty = Omit<
  Property,
  'id' | 'rating' | 'reviews_count' | 'bookings_count' | 'created_at' | 'updated_at' | 'featured' | 'status'
> & {
  status?: CabinStatus; // default 'pendente' no banco
};

// ── bookings ─────────────────────────────────────────────────────────
export interface Booking {
  id: string;
  property_id: string;
  guest_id: string;
  check_in: string; // DATE (YYYY-MM-DD)
  check_out: string; // DATE (YYYY-MM-DD)
  nights: number; // gerado pelo banco (check_out - check_in)
  pay_method: PayMethod;
  price_per_night: number;
  total: number;
  pix_discount: boolean;
  status: BookingStatus;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
}

export type NewBooking = Pick<
  Booking,
  'property_id' | 'guest_id' | 'check_in' | 'check_out' | 'pay_method' | 'price_per_night' | 'total' | 'pix_discount'
>;

/**
 * Booking + dados básicos da propriedade, via embed properties(...) no select
 * do bookingService. `owner_id` foi adicionado ao embed (branch
 * feature/mensagens) pra dar pra saber com qual anfitrião iniciar conversa a
 * partir do histórico de reservas do hóspede, sem precisar de uma query
 * separada por reserva.
 */
export interface BookingWithProperty extends Booking {
  properties: { title: string; location: string; images: string[]; owner_id: string } | null;
}

// ── favorites ────────────────────────────────────────────────────────
export interface Favorite {
  id: string;
  user_id: string;
  property_id: string;
  created_at: string;
}

// ── reviews ──────────────────────────────────────────────────────────
export interface Review {
  id: string;
  property_id: string;
  booking_id: string | null;
  author_id: string;
  rating: number; // 1-5
  comment: string;
  created_at: string;
}

export type NewReview = Pick<Review, 'property_id' | 'booking_id' | 'author_id' | 'rating' | 'comment'>;

/** Review + nome/avatar do autor, via embed de profiles(author_id -> id) no select do reviewService. */
export interface ReviewWithAuthor extends Review {
  profiles: { name: string; avatar_url: string | null } | null;
}

// ── conversations & messages ────────────────────────────────────────
export interface Conversation {
  id: string;
  property_id: string | null;
  guest_id: string;
  host_id: string;
  last_message: string | null;
  last_message_at: string | null;
  guest_unread: number;
  host_unread: number;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  read_at: string | null;
  created_at: string;
}

export type NewMessage = Pick<Message, 'conversation_id' | 'sender_id' | 'content'>;

/**
 * Conversation + nome/avatar dos dois participantes, via embed duplo de
 * profiles no select do messageService (conversations tem DUAS FKs pra
 * profiles - guest_id e host_id - por isso precisa do hint !fkey explícito
 * pra cada uma, senão o PostgREST não sabe qual usar). Nomes de constraint
 * assumidos pela convenção padrão do Postgres (<tabela>_<coluna>_fkey), já
 * que schema.sql não nomeia essas FKs explicitamente - não pude confirmar
 * contra o banco real nesta sessão.
 */
export interface ConversationWithParticipants extends Conversation {
  guest: { name: string; avatar_url: string | null } | null;
  host: { name: string; avatar_url: string | null } | null;
}

// ── notifications ────────────────────────────────────────────────────
export interface AppNotification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  property_id: string | null;
  booking_id: string | null;
  message_id: string | null;
  created_at: string;
}

// ── reports ──────────────────────────────────────────────────────────
export interface Report {
  id: string;
  reporter_id: string;
  property_id: string | null;
  reported_user_id: string | null;
  reason: string;
  details: string | null;
  status: ReportStatus;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution: string | null;
  created_at: string;
}

export type NewReport = Pick<Report, 'reporter_id' | 'property_id' | 'reported_user_id' | 'reason' | 'details'>;

// ── helper interno pra normalizar o retorno do supabase-js ────────────
export function toResult<T>(data: T | null, error: { message: string } | null): ServiceResult<T> {
  if (error) {
    return { data: null, error: error.message };
  }
  return { data, error: null };
}
