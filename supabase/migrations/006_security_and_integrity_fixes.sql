-- ============================================================
-- Migração 006: correções de segurança e integridade (achados do QA de 09/10/2026)
-- STATUS: PROPOSTO - ainda NÃO aplicado no banco. Rode no SQL Editor do Supabase
-- (Dashboard -> SQL Editor -> New query -> colar tudo -> Run). É idempotente
-- (pode rodar mais de uma vez). Depois de aplicar, troque esta linha por "JÁ APLICADO".
-- ============================================================
-- O que isto corrige (cada item foi encontrado lendo supabase/schema.sql):
--  1. Anfitrião se auto-aprovava (status/featured/rating/contadores editáveis).
--  2. Hóspede alterava a própria reserva (total, datas, status) e mandava total = 0;
--     sem trava contra reservas sobrepostas.
--  3. Funções SECURITY DEFINER chamáveis por qualquer pessoa (notificação falsa
--     pra qualquer usuário, marcar como lidas as de outros).
--  4. Mensagem podia ser inserida em conversa alheia.
--  5. Avaliações sem reserva (e ilimitadas com booking_id nulo).
--  6. Triggers rodando com o privilégio de quem dispara (RLS bloqueava o UPDATE):
--     bookings_count, rating, reviews_count e conversations.last_message nunca
--     atualizavam para usuários comuns.
--  7. messages sem policy de UPDATE: "marcar como lida" não gravava nada.
--  8. Bucket "properties" sem policies de Storage (upload de foto de cabana falhava).
--  9. Estado 'removido' para cabana excluída pelo dono (antes igual a 'inativo' = reprovada).
-- 10. Notificação de "denúncia analisada" ia pro dono da cabana em vez de quem denunciou.
--
-- NÃO coberto aqui (decisão de produto, mexe no app): profiles_public_read expõe
-- e-mail e telefone de todos a qualquer um (inclusive sem login). Corrigir exige
-- trocar `select('*')` por colunas explícitas em services/profileService.ts e
-- usar uma view pública - fica como próximo passo.
-- ============================================================

-- ── 0. Enum: novo estado de cabana ──────────────────────────
ALTER TYPE cabin_status ADD VALUE IF NOT EXISTS 'removido';

-- ── 1. Helper: o usuário atual é admin? ─────────────────────
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin' AND deleted_at IS NULL
  );
$$;

-- ── 2. properties: dono não mexe em moderação/contadores ────
-- pg_trigger_depth() > 1 = o UPDATE veio de OUTRO trigger (ex.: recalcular
-- rating), que precisa poder mexer nesses campos. auth.uid() nulo = SQL Editor /
-- service role (sem usuário logado).
CREATE OR REPLACE FUNCTION public.protect_property_moderation_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF pg_trigger_depth() > 1 OR auth.uid() IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status := 'pendente';
    NEW.featured := FALSE;
    NEW.rating := 0;
    NEW.reviews_count := 0;
    NEW.bookings_count := 0;
  ELSE
    -- O dono só pode mudar o status para 'removido' (excluir o próprio anúncio).
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status::text <> 'removido' THEN
      NEW.status := OLD.status;
    END IF;
    NEW.owner_id := OLD.owner_id;
    NEW.featured := OLD.featured;
    NEW.rating := OLD.rating;
    NEW.reviews_count := OLD.reviews_count;
    NEW.bookings_count := OLD.bookings_count;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS properties_protect_moderation ON properties;
CREATE TRIGGER properties_protect_moderation
  BEFORE INSERT OR UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION public.protect_property_moderation_fields();

-- ── 3. bookings: preço/validação no servidor + hóspede só cancela ──
CREATE OR REPLACE FUNCTION public.prepare_booking_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prop RECORD;
  v_nights INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- SQL Editor / service role
  END IF;

  SELECT id, owner_id, price, status INTO prop FROM properties WHERE id = NEW.property_id;

  IF NOT FOUND OR prop.status::text <> 'ativo' THEN
    RAISE EXCEPTION 'Esta cabana não está disponível para reserva.';
  END IF;
  IF prop.owner_id = auth.uid() THEN
    RAISE EXCEPTION 'Você não pode reservar o seu próprio anúncio.';
  END IF;
  IF NEW.check_in < CURRENT_DATE THEN
    RAISE EXCEPTION 'A data de check-in não pode estar no passado.';
  END IF;

  v_nights := NEW.check_out - NEW.check_in;
  IF v_nights < 1 THEN
    RAISE EXCEPTION 'O check-out precisa ser depois do check-in.';
  END IF;

  -- Preço calculado aqui, nunca confiado ao cliente (taxa de serviço 10%, PIX -5%).
  NEW.status := 'reservada';
  NEW.cancelled_at := NULL;
  NEW.cancel_reason := NULL;
  NEW.pix_discount := (NEW.pay_method = 'pix');
  NEW.price_per_night := prop.price;
  NEW.total := ROUND(v_nights * prop.price * 1.10 * CASE WHEN NEW.pay_method = 'pix' THEN 0.95 ELSE 1 END, 2);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_prepare_insert ON bookings;
CREATE TRIGGER bookings_prepare_insert
  BEFORE INSERT ON bookings
  FOR EACH ROW EXECUTE FUNCTION public.prepare_booking_insert();

CREATE OR REPLACE FUNCTION public.protect_booking_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF pg_trigger_depth() > 1 OR auth.uid() IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- Fora um cancelamento (reservada -> cancelada), nada da reserva muda.
  IF OLD.status::text = 'reservada' AND NEW.status::text = 'cancelada' THEN
    NEW.cancelled_at := COALESCE(NEW.cancelled_at, NOW());
  ELSE
    NEW.status := OLD.status;
    NEW.cancelled_at := OLD.cancelled_at;
    NEW.cancel_reason := OLD.cancel_reason;
  END IF;

  NEW.property_id := OLD.property_id;
  NEW.guest_id := OLD.guest_id;
  NEW.check_in := OLD.check_in;
  NEW.check_out := OLD.check_out;
  NEW.pay_method := OLD.pay_method;
  NEW.price_per_night := OLD.price_per_night;
  NEW.total := OLD.total;
  NEW.pix_discount := OLD.pix_discount;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_protect_update ON bookings;
CREATE TRIGGER bookings_protect_update
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION public.protect_booking_update();

-- Duas reservas ativas não podem se sobrepor na mesma cabana (trava de verdade
-- no banco - a checagem do app é um passo separado do INSERT e perde a corrida).
-- Em bloco com tratamento de erro: se já existir sobreposição nos dados atuais,
-- avisa em vez de derrubar a migração inteira.
CREATE EXTENSION IF NOT EXISTS btree_gist;
DO $$
BEGIN
  ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_no_overlap;
  ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlap
    EXCLUDE USING gist (property_id WITH =, daterange(check_in, check_out) WITH &&)
    WHERE (status <> 'cancelada');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'bookings_no_overlap NÃO criada (%): resolva as reservas sobrepostas e rode de novo.', SQLERRM;
END $$;

-- ── 4. Funções SECURITY DEFINER: fechar acesso e fixar search_path ──
REVOKE EXECUTE ON FUNCTION public.create_notification(UUID, notification_type, TEXT, TEXT, UUID, UUID, UUID)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_unread_notifications_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- p_user_id é mantido só por compatibilidade com o app; vale sempre o usuário logado.
  RETURN (SELECT COUNT(*) FROM notifications WHERE user_id = auth.uid() AND read = FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE notifications SET read = TRUE WHERE user_id = auth.uid() AND read = FALSE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_unread_notifications_count(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_all_notifications_read(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_unread_notifications_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read(UUID) TO authenticated;

ALTER FUNCTION public.is_property_available(UUID, DATE, DATE, UUID) SET search_path = public;

-- ── 5. Triggers precisam rodar com privilégio próprio (RLS bloqueava o UPDATE) ──
ALTER FUNCTION public.update_property_bookings_count() SECURITY DEFINER SET search_path = public;
ALTER FUNCTION public.update_property_rating()         SECURITY DEFINER SET search_path = public;
ALTER FUNCTION public.update_conversation_last_message() SECURITY DEFINER SET search_path = public;
ALTER FUNCTION public.notify_host_on_booking()         SECURITY DEFINER SET search_path = public;
ALTER FUNCTION public.notify_on_message()              SECURITY DEFINER SET search_path = public;
ALTER FUNCTION public.notify_admins_on_report()        SECURITY DEFINER SET search_path = public;

-- Denúncia analisada: avisa quem DENUNCIOU (antes avisava o dono da cabana com o
-- texto "Sua denúncia foi analisada").
CREATE OR REPLACE FUNCTION public.handle_report_resolution()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status::text = 'resolvido' AND OLD.status::text <> 'resolvido' THEN
    PERFORM create_notification(
      NEW.reporter_id,
      'aviso',
      'Sua denúncia foi analisada',
      'A equipe do ReservaGO analisou a denúncia que você enviou. Obrigado por ajudar a manter a plataforma segura.',
      NEW.property_id
    );
  END IF;
  RETURN NEW;
END;
$$;

-- ── 6. messages: só participantes enviam; destinatário marca como lida ──
DROP POLICY IF EXISTS "messages_participant_insert" ON messages;
CREATE POLICY "messages_participant_insert" ON messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_id AND (c.guest_id = auth.uid() OR c.host_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "messages_recipient_mark_read" ON messages;
CREATE POLICY "messages_recipient_mark_read" ON messages
  FOR UPDATE
  USING (
    sender_id <> auth.uid()
    AND EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_id AND (c.guest_id = auth.uid() OR c.host_id = auth.uid())
    )
  )
  WITH CHECK (sender_id <> auth.uid());

-- Mesmo com a policy, só read_at pode mudar.
CREATE OR REPLACE FUNCTION public.protect_message_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF pg_trigger_depth() > 1 OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  NEW.content := OLD.content;
  NEW.sender_id := OLD.sender_id;
  NEW.conversation_id := OLD.conversation_id;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_protect_update ON messages;
CREATE TRIGGER messages_protect_update
  BEFORE UPDATE ON messages
  FOR EACH ROW EXECUTE FUNCTION public.protect_message_update();

-- Uma conversa de suporte (property_id nulo) por par hóspede/anfitrião - o UNIQUE
-- original não vale com NULL. Em bloco: se já houver duplicadas, só avisa.
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS conversations_unique_no_property
    ON conversations (guest_id, host_id) WHERE property_id IS NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'conversations_unique_no_property NÃO criado (%): há conversas duplicadas.', SQLERRM;
END $$;

-- ── 7. notifications: o usuário só altera "read" ────────────
CREATE OR REPLACE FUNCTION public.protect_notification_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_read BOOLEAN := NEW.read;
BEGIN
  IF pg_trigger_depth() > 1 OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  NEW := OLD;
  NEW.read := v_read;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_protect_update ON notifications;
CREATE TRIGGER notifications_protect_update
  BEFORE UPDATE ON notifications
  FOR EACH ROW EXECUTE FUNCTION public.protect_notification_update();

-- ── 8. reviews: só quem se hospedou (reserva própria, já encerrada) ──
DROP POLICY IF EXISTS "reviews_guest_insert" ON reviews;
CREATE POLICY "reviews_guest_insert" ON reviews
  FOR INSERT WITH CHECK (
    author_id = auth.uid()
    AND booking_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.id = booking_id
        AND b.guest_id = auth.uid()
        AND b.property_id = reviews.property_id
        AND b.status::text <> 'cancelada'
        AND b.check_out <= CURRENT_DATE
    )
  );

-- ── 9. Storage: fotos das cabanas (mesmo padrão do bucket avatars, migração 003) ──
DROP POLICY IF EXISTS "properties_public_read" ON storage.objects;
CREATE POLICY "properties_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'properties');

DROP POLICY IF EXISTS "properties_owner_insert" ON storage.objects;
CREATE POLICY "properties_owner_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'properties'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "properties_owner_update" ON storage.objects;
CREATE POLICY "properties_owner_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'properties'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ── Conferência pós-aplicação ───────────────────────────────
-- SELECT tgname FROM pg_trigger WHERE tgname IN
--   ('properties_protect_moderation','bookings_prepare_insert','bookings_protect_update',
--    'messages_protect_update','notifications_protect_update');           -- 5 linhas
-- SELECT conname FROM pg_constraint WHERE conname = 'bookings_no_overlap';  -- 1 linha
-- SELECT policyname FROM pg_policies WHERE tablename = 'messages';          -- inclui messages_recipient_mark_read
