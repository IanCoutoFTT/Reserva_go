-- ============================================================
-- Migração 023: fotos no chat
-- ============================================================
--
--  * messages.image_path: caminho da foto dentro do bucket "chat-images". A mensagem de foto
--    leva também um texto (a legenda, ou "📷 Foto"), então as notificações e a prévia da
--    conversa continuam funcionando sem mudança.
--  * Bucket "chat-images" PRIVADO (diferente das fotos de cabana e de perfil, que são públicas):
--    só os dois participantes da conversa enviam e enxergam. O app mostra a foto por um link
--    temporário (URL assinada). Limite de 3 MB e só imagem.
--  * O caminho do arquivo é "<id da conversa>/<arquivo>": a política confere que quem envia
--    pertence à conversa daquela pasta.
--  * A mensagem só pode apontar para uma foto da PRÓPRIA conversa (não dá para reaproveitar o
--    caminho de uma foto de outra conversa), e image_path não muda depois de criada (o
--    destinatário pode atualizar a mensagem para marcar como lida, mas não trocar a foto).
--  * O limite de mensagens repetidas (migração 017) não vale para fotos: mandar 5 fotos seguidas
--    com o texto "📷 Foto" é normal. O limite por minuto e por hora continua valendo.
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS image_path TEXT;

DO $$ BEGIN
  ALTER TABLE public.messages
    ADD CONSTRAINT messages_image_path_tamanho CHECK (image_path IS NULL OR char_length(image_path) BETWEEN 3 AND 200);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Bucket privado, 3 MB, só imagem ─────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('chat-images', 'chat-images', FALSE, 3145728,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
ON CONFLICT (id) DO UPDATE
  SET public = FALSE,
      file_size_limit = 3145728,
      allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

DROP POLICY IF EXISTS "chat_images_participant_insert" ON storage.objects;
CREATE POLICY "chat_images_participant_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-images'
    AND EXISTS (
      SELECT 1 FROM public.conversations c
       WHERE c.id::text = (storage.foldername(name))[1]
         AND (c.guest_id = auth.uid() OR c.host_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "chat_images_participant_read" ON storage.objects;
CREATE POLICY "chat_images_participant_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-images'
    AND EXISTS (
      SELECT 1 FROM public.conversations c
       WHERE c.id::text = (storage.foldername(name))[1]
         AND (c.guest_id = auth.uid() OR c.host_id = auth.uid())
    )
  );

-- ── A mensagem só aponta para foto da própria conversa ──────
CREATE OR REPLACE FUNCTION public.validate_message_image()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.image_path IS NOT NULL AND left(NEW.image_path, length(NEW.conversation_id::text) + 1) <> NEW.conversation_id::text || '/' THEN
    RAISE EXCEPTION 'Foto inválida para essa conversa.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_validate_image ON public.messages;
CREATE TRIGGER messages_validate_image
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.validate_message_image();

-- ── A foto não muda depois de enviada ───────────────────────
CREATE OR REPLACE FUNCTION public.protect_message_image()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF public.is_app_request() THEN
    NEW.image_path := OLD.image_path;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_protect_image ON public.messages;
CREATE TRIGGER messages_protect_image
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.protect_message_image();

-- ── Limite de mensagens (017): repetição não vale para foto ──
CREATE OR REPLACE FUNCTION public.enforce_message_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  c_per_minute CONSTANT INTEGER := 15;
  c_per_hour   CONSTANT INTEGER := 200;
  c_repeats    CONSTANT INTEGER := 4;
  v_minute INTEGER;
  v_hour   INTEGER;
  v_same   INTEGER;
BEGIN
  IF NOT public.is_app_request() THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 minute'),
         COUNT(*)
    INTO v_minute, v_hour
    FROM public.messages
   WHERE sender_id = NEW.sender_id AND created_at > NOW() - INTERVAL '1 hour';

  IF v_minute >= c_per_minute THEN
    RAISE EXCEPTION 'Limite de envio: você mandou mensagens demais em pouco tempo. Aguarde um minuto e tente de novo.';
  END IF;
  IF v_hour >= c_per_hour THEN
    RAISE EXCEPTION 'Limite de envio: você atingiu o máximo de mensagens por hora. Tente de novo mais tarde.';
  END IF;

  IF NEW.image_path IS NULL THEN
    SELECT COUNT(*) INTO v_same
      FROM public.messages
     WHERE sender_id = NEW.sender_id
       AND image_path IS NULL
       AND content = NEW.content
       AND created_at > NOW() - INTERVAL '5 minutes';
    IF v_same >= c_repeats THEN
      RAISE EXCEPTION 'Limite de envio: essa mesma mensagem já foi enviada várias vezes. Evite repetir o texto.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ── Conferência pós-aplicação (SQL Editor) ──────────────────
-- SELECT id, public, file_size_limit FROM storage.buckets WHERE id = 'chat-images';   -- public = false, 3145728
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'image_path';  -- 1 linha
-- SELECT tgname FROM pg_trigger WHERE tgname IN ('messages_validate_image','messages_protect_image');                -- 2 linhas
