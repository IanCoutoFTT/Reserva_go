-- ============================================================
-- RESERVAGO — Schema Supabase Completo
-- Gerado a partir da análise do código-fonte do app
-- Execute este arquivo no SQL Editor do Supabase
-- ============================================================

-- Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- Para busca full-text (nome, localização)

-- ============================================================
-- ENUM TYPES
-- ============================================================

CREATE TYPE user_role AS ENUM ('hospede', 'anfitriao', 'admin');
CREATE TYPE booking_status AS ENUM ('reservada', 'realizada', 'cancelada');
CREATE TYPE pay_method AS ENUM ('pix', 'card');
CREATE TYPE notification_type AS ENUM ('reserva', 'mensagem', 'promocao', 'aviso');
CREATE TYPE isolation_level AS ENUM ('urbano', 'semi', 'isolado', 'extremo');
CREATE TYPE report_status AS ENUM ('pendente', 'em_analise', 'resolvido', 'arquivado');
CREATE TYPE cabin_status AS ENUM ('ativo', 'pendente', 'suspenso', 'inativo');

-- ============================================================
-- TABELA: profiles
-- Extensão da tabela auth.users do Supabase
-- ============================================================

CREATE TABLE profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL DEFAULT '',
  email           TEXT NOT NULL DEFAULT '',
  avatar_url      TEXT,
  role            user_role NOT NULL DEFAULT 'hospede',
  phone           TEXT,
  bio             TEXT,
  interests       TEXT[] DEFAULT '{}',          -- ex: ['Praia','Campo','Cachoeira']
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ                   -- soft delete (excluir conta)
);

-- Trigger para criar perfil automaticamente ao criar usuário
--
-- ATENÇÃO (corrigido em 08/09/2026, ver supabase/migrations/005): a versão
-- rodando no banco real tinha divergido deste arquivo - ganhou `role`,
-- `created_at`, `updated_at`, `ON CONFLICT (id) DO NOTHING` e um bloco
-- EXCEPTION que loga e engole qualquer erro (RAISE LOG + RETURN NEW), sem
-- essas mudanças terem sido documentadas aqui. Esse bloco EXCEPTION mascarou
-- um bug real: a função não fixava `search_path`, então `profiles` (sem
-- prefixo de schema) só resolvia certo quando alguém rodava o INSERT
-- manualmente no SQL Editor (sessão com search_path = public por padrão) -
-- disparada sozinha pela trigger durante um cadastro de verdade, rodava num
-- contexto sem `public` no search_path, o INSERT falhava com "relation
-- profiles does not exist", o EXCEPTION engolia o erro, e o login
-- terminava "funcionando" (auth.users criado) sem nunca criar o profile.
-- Encontrado ao vivo: 2 contas reais (Ian Couto, Thiago Patrick) logaram
-- com sucesso e ficaram sem profile, com o app caindo num fallback local
-- (context/AuthContext.tsx) sem nada persistido no banco.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, avatar_url, role, created_at, updated_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NULL),
    'hospede',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'Error in handle_new_user: %', SQLERRM;
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- TABELA: properties (cabanas)
-- Mapeada de constants/Properties.ts e ListingContext
-- ============================================================

CREATE TABLE properties (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Dados básicos (mapeados de create-listing.tsx)
  title            TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  location         TEXT NOT NULL DEFAULT '',
  price            NUMERIC(10,2) NOT NULL DEFAULT 0,
  isolation_level  isolation_level,

  -- Subcategoria e categoria (mapeados de index.tsx)
  category         TEXT NOT NULL DEFAULT 'Campo', -- 'Praia Privativa' | 'Campo' | 'Cachoeira'
  sub_category     TEXT,                          -- 'Populares' | 'Nordeste' | 'Sul' etc.

  -- Imagens (array para suportar múltiplas fotos futuramente)
  images           TEXT[] DEFAULT '{}',           -- URLs do Supabase Storage

  -- Amenidades (mapeadas de details.tsx — hoje fixas, agora dinâmicas)
  amenities        TEXT[] DEFAULT '{}',           -- ex: ['Wi-Fi','Churrasqueira','Piscina']

  -- Avaliações (calculadas via trigger ou função)
  rating           NUMERIC(2,1) DEFAULT 0,
  reviews_count    INTEGER DEFAULT 0,

  -- Status de moderação (mapeado de admin-dashboard.tsx)
  status           cabin_status NOT NULL DEFAULT 'pendente',
  featured         BOOLEAN DEFAULT FALSE,         -- destaque no admin

  -- Contagens
  bookings_count   INTEGER DEFAULT 0,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_properties_owner ON properties(owner_id);
CREATE INDEX idx_properties_category ON properties(category);
CREATE INDEX idx_properties_status ON properties(status);
CREATE INDEX idx_properties_price ON properties(price);
CREATE INDEX idx_properties_isolation ON properties(isolation_level);
-- Índice para busca por título e localização (index.tsx search)
CREATE INDEX idx_properties_search ON properties
  USING gin(to_tsvector('portuguese', title || ' ' || location));

CREATE TRIGGER properties_updated_at
  BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- TABELA: bookings (reservas)
-- Mapeada de BookingContext.tsx e bookings.tsx
-- ============================================================

CREATE TABLE bookings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id     UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  guest_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Datas (adicionadas nas melhorias do Grupo 1)
  check_in        DATE NOT NULL,
  check_out       DATE NOT NULL,
  nights          INTEGER NOT NULL GENERATED ALWAYS AS
                  (check_out - check_in) STORED,

  -- Pagamento
  pay_method      pay_method NOT NULL DEFAULT 'pix',
  price_per_night NUMERIC(10,2) NOT NULL,
  total           NUMERIC(10,2) NOT NULL,
  pix_discount    BOOLEAN DEFAULT FALSE, -- 5% de desconto no PIX

  -- Status
  status          booking_status NOT NULL DEFAULT 'reservada',
  cancelled_at    TIMESTAMPTZ,
  cancel_reason   TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Garante que check_out > check_in
  CONSTRAINT valid_dates CHECK (check_out > check_in)
);

CREATE INDEX idx_bookings_guest ON bookings(guest_id);
CREATE INDEX idx_bookings_property ON bookings(property_id);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_dates ON bookings(check_in, check_out);

CREATE TRIGGER bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Trigger: atualiza bookings_count na propriedade
CREATE OR REPLACE FUNCTION update_property_bookings_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE properties
  SET bookings_count = (
    SELECT COUNT(*) FROM bookings
    WHERE property_id = COALESCE(NEW.property_id, OLD.property_id)
    AND status != 'cancelada'
  )
  WHERE id = COALESCE(NEW.property_id, OLD.property_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bookings_count_trigger
  AFTER INSERT OR UPDATE OR DELETE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_property_bookings_count();

-- ============================================================
-- TABELA: favorites (favoritos)
-- Mapeada de FavoritesContext.tsx
-- ============================================================

CREATE TABLE favorites (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, property_id)
);

CREATE INDEX idx_favorites_user ON favorites(user_id);

-- ============================================================
-- TABELA: reviews (avaliações)
-- Referenciadas em details.tsx mas ainda hardcoded
-- ============================================================

CREATE TABLE reviews (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  booking_id  UUID REFERENCES bookings(id) ON DELETE SET NULL, -- vincula à reserva real
  author_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Garante que o mesmo usuário não avalie a mesma propriedade duas vezes
  UNIQUE(booking_id, author_id)
);

CREATE INDEX idx_reviews_property ON reviews(property_id);
CREATE INDEX idx_reviews_author ON reviews(author_id);

-- Trigger: atualiza rating médio da propriedade ao inserir/excluir review
CREATE OR REPLACE FUNCTION update_property_rating()
RETURNS TRIGGER AS $$
DECLARE
  prop_id UUID;
BEGIN
  prop_id := COALESCE(NEW.property_id, OLD.property_id);
  UPDATE properties
  SET
    rating = (SELECT ROUND(AVG(rating)::NUMERIC, 1) FROM reviews WHERE property_id = prop_id),
    reviews_count = (SELECT COUNT(*) FROM reviews WHERE property_id = prop_id)
  WHERE id = prop_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER reviews_rating_trigger
  AFTER INSERT OR UPDATE OR DELETE ON reviews
  FOR EACH ROW EXECUTE FUNCTION update_property_rating();

-- ============================================================
-- TABELA: messages (mensagens)
-- Mapeada de messages.tsx — chat entre hóspede e anfitrião
-- ============================================================

CREATE TABLE conversations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id     UUID REFERENCES properties(id) ON DELETE SET NULL,
  guest_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  host_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  last_message    TEXT,
  last_message_at TIMESTAMPTZ,
  guest_unread    INTEGER DEFAULT 0,
  host_unread     INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(guest_id, host_id, property_id)
);

CREATE INDEX idx_conversations_guest ON conversations(guest_id);
CREATE INDEX idx_conversations_host ON conversations(host_id);

CREATE TABLE messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content         TEXT NOT NULL,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_sender ON messages(sender_id);

-- Trigger: atualiza last_message na conversa
CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations
  SET
    last_message = NEW.content,
    last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER messages_last_trigger
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION update_conversation_last_message();

-- ============================================================
-- TABELA: notifications (notificações)
-- Mapeada de NotificationContext.tsx e notifications.tsx
-- Conecta: denúncias → admin, reservas → anfitrião, mensagens → usuário
-- ============================================================

CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type        notification_type NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  read        BOOLEAN DEFAULT FALSE,

  -- Referências opcionais para navegar ao item relacionado
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  booking_id  UUID REFERENCES bookings(id) ON DELETE SET NULL,
  message_id  UUID REFERENCES messages(id) ON DELETE SET NULL,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, read) WHERE read = FALSE;

-- Função auxiliar para criar notificação para qualquer usuário
CREATE OR REPLACE FUNCTION create_notification(
  p_user_id     UUID,
  p_type        notification_type,
  p_title       TEXT,
  p_body        TEXT,
  p_property_id UUID DEFAULT NULL,
  p_booking_id  UUID DEFAULT NULL,
  p_message_id  UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  notif_id UUID;
BEGIN
  INSERT INTO notifications (user_id, type, title, body, property_id, booking_id, message_id)
  VALUES (p_user_id, p_type, p_title, p_body, p_property_id, p_booking_id, p_message_id)
  RETURNING id INTO notif_id;
  RETURN notif_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: nova reserva → notifica anfitrião
CREATE OR REPLACE FUNCTION notify_host_on_booking()
RETURNS TRIGGER AS $$
DECLARE
  host_id UUID;
  prop_title TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT p.owner_id, p.title INTO host_id, prop_title
    FROM properties p WHERE p.id = NEW.property_id;

    PERFORM create_notification(
      host_id,
      'reserva',
      '🎉 Nova reserva recebida!',
      'Sua cabana "' || prop_title || '" foi reservada para ' ||
        TO_CHAR(NEW.check_in, 'DD/MM') || ' → ' || TO_CHAR(NEW.check_out, 'DD/MM') || '.',
      NEW.property_id,
      NEW.id
    );
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status = 'cancelada' AND OLD.status != 'cancelada' THEN
    SELECT p.owner_id, p.title INTO host_id, prop_title
    FROM properties p WHERE p.id = NEW.property_id;

    PERFORM create_notification(
      host_id,
      'reserva',
      '❌ Reserva cancelada',
      'A reserva na cabana "' || prop_title || '" foi cancelada pelo hóspede.',
      NEW.property_id,
      NEW.id
    );

    -- Notifica também o hóspede
    PERFORM create_notification(
      NEW.guest_id,
      'reserva',
      'Reserva cancelada',
      'Sua reserva em "' || prop_title || '" foi cancelada com sucesso.',
      NEW.property_id,
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER booking_notification_trigger
  AFTER INSERT OR UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION notify_host_on_booking();

-- Trigger: nova mensagem → notifica destinatário
CREATE OR REPLACE FUNCTION notify_on_message()
RETURNS TRIGGER AS $$
DECLARE
  convo conversations%ROWTYPE;
  recipient_id UUID;
  sender_name TEXT;
BEGIN
  SELECT * INTO convo FROM conversations WHERE id = NEW.conversation_id;

  -- O destinatário é quem NÃO enviou
  IF NEW.sender_id = convo.guest_id THEN
    recipient_id := convo.host_id;
  ELSE
    recipient_id := convo.guest_id;
  END IF;

  SELECT name INTO sender_name FROM profiles WHERE id = NEW.sender_id;

  PERFORM create_notification(
    recipient_id,
    'mensagem',
    sender_name || ' enviou uma mensagem',
    NEW.content,
    convo.property_id,
    NULL,
    NEW.id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER message_notification_trigger
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION notify_on_message();

-- ============================================================
-- TABELA: reports (denúncias)
-- Mapeada de admin-dashboard.tsx
-- Denúncia aprovada → notifica admin via notifications
-- ============================================================

CREATE TABLE reports (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  property_id  UUID REFERENCES properties(id) ON DELETE CASCADE,
  reported_user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  reason       TEXT NOT NULL,
  details      TEXT,
  status       report_status NOT NULL DEFAULT 'pendente',
  resolved_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  resolved_at  TIMESTAMPTZ,
  resolution   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT report_has_target CHECK (
    property_id IS NOT NULL OR reported_user_id IS NOT NULL
  )
);

CREATE INDEX idx_reports_status ON reports(status);
CREATE INDEX idx_reports_property ON reports(property_id);

-- Trigger: nova denúncia → notifica todos os admins
CREATE OR REPLACE FUNCTION notify_admins_on_report()
RETURNS TRIGGER AS $$
DECLARE
  admin_id UUID;
BEGIN
  FOR admin_id IN
    SELECT id FROM profiles WHERE role = 'admin' AND deleted_at IS NULL
  LOOP
    PERFORM create_notification(
      admin_id,
      'aviso',
      '🚨 Nova denúncia recebida',
      'Uma denúncia foi registrada: ' || NEW.reason,
      NEW.property_id
    );
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER report_notification_trigger
  AFTER INSERT ON reports
  FOR EACH ROW EXECUTE FUNCTION notify_admins_on_report();

-- Trigger: denúncia aprovada → suspende propriedade automaticamente (opcional)
CREATE OR REPLACE FUNCTION handle_report_resolution()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'resolvido' AND OLD.status != 'resolvido' AND NEW.property_id IS NOT NULL THEN
    -- Notifica o anfitrião sobre a resolução
    PERFORM create_notification(
      (SELECT owner_id FROM properties WHERE id = NEW.property_id),
      'aviso',
      'Sua denúncia foi analisada',
      'Uma denúncia relacionada à sua propriedade foi resolvida pela equipe.',
      NEW.property_id
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER report_resolution_trigger
  AFTER UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION handle_report_resolution();

-- ============================================================
-- STORAGE BUCKETS (execute no painel do Supabase ou via API)
-- ============================================================

-- Bucket para fotos de perfil
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', TRUE);

-- Bucket para fotos das cabanas
INSERT INTO storage.buckets (id, name, public) VALUES ('properties', 'properties', TRUE);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Políticas de segurança por perfil
-- ============================================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- ── PROFILES ──────────────────────────────────────────────
-- Qualquer usuário autenticado pode ver perfis públicos (nome, avatar)
CREATE POLICY "profiles_public_read" ON profiles
  FOR SELECT USING (deleted_at IS NULL);

-- Usuário só pode editar seu próprio perfil. WITH CHECK compara a role nova
-- com a role atual via subquery: UPDATE direto NUNCA muda profiles.role
-- (nem entre 'hospede'/'anfitriao') - a única forma de trocar a própria
-- role é a function set_own_role() (ver FUNÇÕES AUXILIARES PARA O APP,
-- mais abaixo). Corrigido via supabase/migrations/001_fix_profiles_self_update_role_escalation.sql
-- depois de um achado de escalação de privilégio: sem este WITH CHECK,
-- qualquer usuário autenticado conseguia gravar role='admin' na própria
-- linha via update comum, direto pela REST API.
CREATE POLICY "profiles_self_update" ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT role FROM profiles WHERE id = auth.uid())
  );

-- ── PROPERTIES ────────────────────────────────────────────
-- Qualquer um pode ver cabanas ativas
CREATE POLICY "properties_public_read" ON properties
  FOR SELECT USING (status = 'ativo');

-- Admin pode ver todas
CREATE POLICY "properties_admin_read" ON properties
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Anfitrião pode ver suas próprias cabanas (qualquer status)
CREATE POLICY "properties_owner_read" ON properties
  FOR SELECT USING (owner_id = auth.uid());

-- Anfitrião pode criar e editar suas cabanas
CREATE POLICY "properties_owner_insert" ON properties
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "properties_owner_update" ON properties
  FOR UPDATE USING (owner_id = auth.uid());

-- Admin pode editar qualquer cabana (moderação)
CREATE POLICY "properties_admin_update" ON properties
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── BOOKINGS ──────────────────────────────────────────────
-- Hóspede vê suas próprias reservas
CREATE POLICY "bookings_guest_read" ON bookings
  FOR SELECT USING (guest_id = auth.uid());

-- Anfitrião vê reservas de suas cabanas
CREATE POLICY "bookings_host_read" ON bookings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM properties WHERE id = property_id AND owner_id = auth.uid())
  );

-- Admin vê tudo
CREATE POLICY "bookings_admin_read" ON bookings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Hóspede cria reservas
CREATE POLICY "bookings_guest_insert" ON bookings
  FOR INSERT WITH CHECK (guest_id = auth.uid());

-- Hóspede pode cancelar suas reservas
CREATE POLICY "bookings_guest_cancel" ON bookings
  FOR UPDATE USING (guest_id = auth.uid());

-- ── FAVORITES ─────────────────────────────────────────────
CREATE POLICY "favorites_own" ON favorites
  USING (user_id = auth.uid());

CREATE POLICY "favorites_insert" ON favorites
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "favorites_delete" ON favorites
  FOR DELETE USING (user_id = auth.uid());

-- ── REVIEWS ───────────────────────────────────────────────
-- Qualquer um lê avaliações
CREATE POLICY "reviews_public_read" ON reviews FOR SELECT USING (TRUE);

-- Apenas quem fez a reserva pode avaliar
CREATE POLICY "reviews_guest_insert" ON reviews
  FOR INSERT WITH CHECK (author_id = auth.uid());

-- ── CONVERSATIONS & MESSAGES ──────────────────────────────
CREATE POLICY "conversations_participant_read" ON conversations
  FOR SELECT USING (guest_id = auth.uid() OR host_id = auth.uid());

CREATE POLICY "messages_participant_read" ON messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_id AND (c.guest_id = auth.uid() OR c.host_id = auth.uid())
    )
  );

CREATE POLICY "messages_participant_insert" ON messages
  FOR INSERT WITH CHECK (sender_id = auth.uid());

-- ── NOTIFICATIONS ─────────────────────────────────────────
-- Usuário vê apenas as suas notificações
CREATE POLICY "notifications_own_read" ON notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "notifications_own_update" ON notifications
  FOR UPDATE USING (user_id = auth.uid());

-- ── REPORTS ───────────────────────────────────────────────
-- Usuário vê suas próprias denúncias
CREATE POLICY "reports_own_read" ON reports
  FOR SELECT USING (reporter_id = auth.uid());

-- Admin vê todas as denúncias
CREATE POLICY "reports_admin_read" ON reports
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "reports_insert" ON reports
  FOR INSERT WITH CHECK (reporter_id = auth.uid());

-- Admin pode atualizar status das denúncias
CREATE POLICY "reports_admin_update" ON reports
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- REALTIME (habilita atualizações em tempo real)
-- Execute no painel Supabase > Database > Replication
-- ou via ALTER PUBLICATION
-- ============================================================

-- Habilita realtime para mensagens e notificações
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE bookings;

-- ============================================================
-- FUNÇÕES AUXILIARES PARA O APP
-- ============================================================

-- Retorna contagem de não lidas para um usuário
CREATE OR REPLACE FUNCTION get_unread_notifications_count(p_user_id UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (SELECT COUNT(*) FROM notifications WHERE user_id = p_user_id AND read = FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Marcar todas as notificações de um usuário como lidas
CREATE OR REPLACE FUNCTION mark_all_notifications_read(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE notifications SET read = TRUE WHERE user_id = p_user_id AND read = FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verificar disponibilidade de uma cabana em um período
CREATE OR REPLACE FUNCTION is_property_available(
  p_property_id UUID,
  p_check_in    DATE,
  p_check_out   DATE,
  p_exclude_booking_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1 FROM bookings
    WHERE property_id = p_property_id
      AND status != 'cancelada'
      AND (p_exclude_booking_id IS NULL OR id != p_exclude_booking_id)
      AND NOT (check_out <= p_check_in OR check_in >= p_check_out)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Única forma sancionada de um usuário trocar a PRÓPRIA role (SECURITY
-- DEFINER: bypassa RLS internamente, mas restrito à linha de auth.uid()).
-- Recusa 'admin' com exceção - promover alguém a admin continua sendo só
-- manual no banco, de propósito (não existe function equivalente pra isso).
-- Chamada pelo app via services/profileService.ts -> supabase.rpc('set_own_role', ...).
CREATE OR REPLACE FUNCTION set_own_role(new_role user_role)
RETURNS profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated profiles;
BEGIN
  IF new_role = 'admin' THEN
    RAISE EXCEPTION 'Não é permitido definir a própria role como admin';
  END IF;

  UPDATE profiles SET role = new_role WHERE id = auth.uid()
  RETURNING * INTO updated;

  RETURN updated;
END;
$$;

-- ============================================================
-- DADOS INICIAIS (seed)
-- ============================================================

-- Inserir um usuário admin padrão (altere o email depois de criar o usuário no Auth)
-- Este INSERT deve ser feito APÓS criar o usuário no Supabase Auth
-- INSERT INTO profiles (id, name, email, role)
-- VALUES ('<UUID_DO_USUARIO_ADMIN>', 'Admin ReservaGO', 'admin@reservago.com', 'admin');

-- ============================================================
-- FIM DO SCHEMA
-- ============================================================