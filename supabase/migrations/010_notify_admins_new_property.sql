-- ============================================================
-- Migração 010: avisar os admins quando chega um anúncio novo para aprovar
-- ============================================================
--
-- Hoje o admin só descobre um anúncio pendente se abrir Painel de Controle ->
-- Aprovações. O banco já avisava sobre denúncias, mensagens e reservas, mas não
-- sobre anúncios novos. Esta migração cria o aviso, no mesmo molde do aviso de
-- denúncias (notify_admins_on_report): um gatilho que gera uma notificação do
-- tipo "aviso" para cada admin ativo.
--
-- Detalhes:
--  * AFTER INSERT: roda depois do gatilho de moderação (006), então o status que
--    vale é o final. Só avisa quando o anúncio nasce 'pendente' (um admin que
--    publica já com status próprio não gera aviso).
--  * O próprio autor não é avisado, caso um admin publique o seu anúncio.
--  * SECURITY DEFINER com search_path fixo, como os demais gatilhos de aviso:
--    create_notification não é executável pelo app (migração 006).
--  * Idempotente: pode rodar mais de uma vez.
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_admins_on_new_property()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin UUID;
BEGIN
  IF NEW.status::text <> 'pendente' THEN
    RETURN NEW;
  END IF;

  FOR v_admin IN
    SELECT id FROM public.profiles
     WHERE role = 'admin' AND deleted_at IS NULL AND id <> NEW.owner_id
  LOOP
    PERFORM public.create_notification(
      v_admin,
      'aviso',
      '🏡 Novo anúncio aguardando aprovação',
      '"' || NEW.title || '" (' || NEW.location || ') foi enviado para análise.',
      NEW.id
    );
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_admins_on_new_property() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS properties_notify_admins ON public.properties;
CREATE TRIGGER properties_notify_admins
  AFTER INSERT ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.notify_admins_on_new_property();

-- ── Conferência pós-aplicação (SQL Editor) ──────────────────
-- SELECT tgname FROM pg_trigger WHERE tgname = 'properties_notify_admins';   -- 1 linha
-- Depois, cadastre um anúncio pelo app com uma conta de anfitrião: o admin deve
-- receber "Novo anúncio aguardando aprovação" em Perfil -> Notificações.
