-- ============================================================
-- Migração 012: mínimos do anúncio passam a ser regra do banco
-- ============================================================
--
-- Os MÁXIMOS do anúncio já eram impostos pelo banco (008, constraint
-- properties_campos_validos): título até 120, local até 200, descrição até 5000,
-- diária até R$ 100.000. Os MÍNIMOS (título e local com 3 letras, diária de pelo
-- menos R$ 10) só existiam no app (lib/listingValidation.ts). Quem chamasse a API
-- do Supabase direto, sem passar pela tela, conseguia criar um anúncio "A" de
-- R$ 0,01. Princípio: o app só avisa o usuário antes; quem decide é o servidor.
--
-- Detalhes:
--  * BEFORE INSERT OR UPDATE. No UPDATE só confere o campo que realmente mudou:
--    anúncios antigos fora da regra (ex.: um título de 1 letra) continuam podendo
--    ser aprovados, reprovados ou removidos pelo admin, sem erro.
--  * Espaços nas pontas não contam (btrim), igual ao app (trim).
--  * Falha com o código 23514 (check_violation) e mensagem em português.
--  * Os valores precisam ficar iguais a LISTING_LIMITS em lib/listingValidation.ts.
--  * Idempotente: pode rodar mais de uma vez.
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_property_minimums()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  c_title_min    CONSTANT INT     := 3;
  c_location_min CONSTANT INT     := 3;
  c_price_min    CONSTANT NUMERIC := 10;
BEGIN
  IF TG_OP = 'INSERT' OR NEW.title IS DISTINCT FROM OLD.title THEN
    IF char_length(btrim(NEW.title)) < c_title_min THEN
      RAISE EXCEPTION 'O título do anúncio precisa ter pelo menos % letras.', c_title_min
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' OR NEW.location IS DISTINCT FROM OLD.location THEN
    IF char_length(btrim(NEW.location)) < c_location_min THEN
      RAISE EXCEPTION 'A localização do anúncio precisa ter pelo menos % letras.', c_location_min
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' OR NEW.price IS DISTINCT FROM OLD.price THEN
    IF NEW.price < c_price_min THEN
      RAISE EXCEPTION 'O valor por noite precisa ser de pelo menos R$ %.', c_price_min
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_property_minimums() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS properties_enforce_minimums ON public.properties;
CREATE TRIGGER properties_enforce_minimums
  BEFORE INSERT OR UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.enforce_property_minimums();

-- ── Conferência pós-aplicação (SQL Editor) ──────────────────
-- SELECT tgname FROM pg_trigger WHERE tgname = 'properties_enforce_minimums';   -- 1 linha
