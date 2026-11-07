-- ============================================================
-- Migração 011: avisos da moderação de anúncios (decisão e reenvio)
-- ============================================================
--
-- Complementa a 010 (que avisa os admins quando um anúncio NOVO chega). Aqui o
-- fluxo fecha nos dois sentidos:
--
--  * Anfitrião é avisado da decisão do admin:
--      pendente -> ativo    "Seu anúncio foi aprovado"
--      pendente -> inativo  "Seu anúncio não foi aprovado"
--      ativo    -> suspenso "Seu anúncio foi suspenso"
--    Antes, o anfitrião só descobria abrindo o painel dele.
--
--  * Admin é avisado quando um anúncio já aprovado volta para a fila porque o
--    anfitrião editou título, descrição ou fotos (regra T-03 da migração 009):
--      ativo -> pendente    "Anúncio editado aguardando nova aprovação"
--
-- Detalhes:
--  * AFTER UPDATE: roda depois dos gatilhos de proteção (006/009), então o status
--    que vale é o final. A função só age quando o status realmente muda.
--  * Quem fez a mudança não é avisado dela (admin que aprova o próprio anúncio,
--    anfitrião que edita o próprio anúncio): a comparação usa auth.uid().
--  * Admin com conta excluída não recebe.
--  * 'removido' (anfitrião excluiu o anúncio ou a conta) não gera aviso.
--  * SECURITY DEFINER com search_path fixo, como os demais gatilhos de aviso:
--    create_notification não é executável pelo app (migração 006).
--  * Idempotente: pode rodar mais de uma vez.
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_on_property_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin UUID;
  v_actor UUID := auth.uid();
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Decisão do admin -> avisa o anfitrião (dono do anúncio).
  IF NEW.owner_id IS DISTINCT FROM v_actor THEN
    IF OLD.status::text = 'pendente' AND NEW.status::text = 'ativo' THEN
      PERFORM public.create_notification(
        NEW.owner_id, 'aviso',
        '✅ Seu anúncio foi aprovado',
        '"' || NEW.title || '" já aparece para os hóspedes.',
        NEW.id
      );
    ELSIF OLD.status::text = 'pendente' AND NEW.status::text = 'inativo' THEN
      PERFORM public.create_notification(
        NEW.owner_id, 'aviso',
        'Seu anúncio não foi aprovado',
        '"' || NEW.title || '" não passou na análise. Fale com o suporte para saber o motivo.',
        NEW.id
      );
    ELSIF OLD.status::text = 'ativo' AND NEW.status::text = 'suspenso' THEN
      PERFORM public.create_notification(
        NEW.owner_id, 'aviso',
        'Seu anúncio foi suspenso',
        '"' || NEW.title || '" saiu do ar. Fale com o suporte para saber o motivo.',
        NEW.id
      );
    END IF;
  END IF;

  -- Anúncio aprovado voltou para a fila (edição do anfitrião) -> avisa os admins.
  IF OLD.status::text = 'ativo' AND NEW.status::text = 'pendente' THEN
    FOR v_admin IN
      SELECT id FROM public.profiles
       WHERE role = 'admin' AND deleted_at IS NULL AND id IS DISTINCT FROM v_actor
    LOOP
      PERFORM public.create_notification(
        v_admin, 'aviso',
        '✏️ Anúncio editado aguardando nova aprovação',
        '"' || NEW.title || '" (' || NEW.location || ') foi alterado e voltou para a fila de aprovação.',
        NEW.id
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_on_property_status_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS properties_notify_status_change ON public.properties;
-- Sem "OF status" de propósito: o gatilho "UPDATE OF coluna" só dispara quando o
-- comando UPDATE cita a coluna. Quando o anfitrião edita só o título, quem devolve
-- o anúncio para 'pendente' é outro gatilho (009), e o comando nunca cita status.
-- A função já ignora as atualizações em que o status não muda.
CREATE TRIGGER properties_notify_status_change
  AFTER UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_property_status_change();

-- ── Conferência pós-aplicação (SQL Editor) ──────────────────
-- SELECT tgname FROM pg_trigger WHERE tgname = 'properties_notify_status_change';   -- 1 linha
