-- ============================================================
-- Migração 020: resposta do anfitrião às avaliações (RNE-004)
-- ============================================================
--
-- Hoje a avaliação é um monólogo: o hóspede escreve e o anfitrião não tem como responder
-- (nem agradecer, nem dar a sua versão). Esta migração acrescenta UMA resposta por avaliação:
--
--  * reviews.host_reply / host_replied_at: o texto (1 a 500 caracteres) e quando foi escrito.
--  * reply_to_review(avaliação, texto): só o DONO da cabana responde. Dá para corrigir a
--    resposta por até 24 horas; depois disso ela fica como está. O autor da avaliação é
--    avisado. Quem não é dono recebe "não encontrada", sem saber se a avaliação existe.
--  * Ninguém grava host_reply direto pelo app: as avaliações não têm política de UPDATE e o
--    gatilho abaixo zera os dois campos na criação (o hóspede não escreve a "resposta do
--    anfitrião" na própria avaliação).
--  * A leitura continua pública, como a da avaliação (reviews_public_read).
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================

ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS host_reply TEXT;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS host_replied_at TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE public.reviews
    ADD CONSTRAINT reviews_host_reply_tamanho
    CHECK (host_reply IS NULL OR char_length(host_reply) BETWEEN 1 AND 500);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── O hóspede não cria a avaliação já com "resposta do anfitrião" ──
CREATE OR REPLACE FUNCTION public.protect_review_reply()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_app_request() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.host_reply := NULL;
    NEW.host_replied_at := NULL;
  ELSE
    NEW.host_reply := OLD.host_reply;
    NEW.host_replied_at := OLD.host_replied_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reviews_protect_reply ON public.reviews;
CREATE TRIGGER reviews_protect_reply
  BEFORE INSERT OR UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.protect_review_reply();

-- ── Responder (ou corrigir em até 24 horas) ─────────────────
CREATE OR REPLACE FUNCTION public.reply_to_review(p_review_id UUID, p_reply TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_reply  TEXT := btrim(COALESCE(p_reply, ''));
  r        public.reviews%ROWTYPE;
  prop     public.properties%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'É preciso estar logado.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO r FROM public.reviews WHERE id = p_review_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Avaliação não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO prop FROM public.properties WHERE id = r.property_id;

  -- Só o dono da cabana (mesma resposta para quem é de fora).
  IF prop.owner_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Avaliação não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  IF char_length(v_reply) < 1 THEN
    RAISE EXCEPTION 'Escreva a resposta.' USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(v_reply) > 500 THEN
    RAISE EXCEPTION 'A resposta pode ter no máximo 500 caracteres.' USING ERRCODE = 'check_violation';
  END IF;
  IF r.host_reply IS NOT NULL AND r.host_replied_at < NOW() - INTERVAL '24 hours' THEN
    RAISE EXCEPTION 'O prazo de 24 horas para corrigir a resposta acabou.' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.reviews SET host_reply = v_reply, host_replied_at = NOW() WHERE id = r.id;

  -- Avisa o autor só na primeira resposta (corrigir um erro de digitação não gera outro aviso).
  IF r.host_reply IS NULL THEN
    PERFORM public.create_notification(
      r.author_id, 'aviso', 'O anfitrião respondeu sua avaliação',
      'O anfitrião de "' || prop.title || '" respondeu à sua avaliação. Veja na página da cabana.',
      prop.id, r.booking_id
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reply_to_review(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reply_to_review(UUID, TEXT) TO authenticated;

-- ── Conferência pós-aplicação (SQL Editor) ──────────────────
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'reviews' AND column_name IN ('host_reply','host_replied_at');  -- 2 linhas
-- SELECT proname FROM pg_proc WHERE proname = 'reply_to_review';                                                                      -- 1 linha
-- SELECT tgname FROM pg_trigger WHERE tgname = 'reviews_protect_reply';                                                               -- 1 linha
