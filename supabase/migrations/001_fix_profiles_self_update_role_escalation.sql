-- ============================================================
-- FIX: auto-promoção pra admin via profiles_self_update
-- STATUS: JÁ APLICADO no banco (SQL Editor do Supabase) — este arquivo é
-- o registro do que está rodando de verdade, não uma proposta.
-- ============================================================
-- Achado: a policy "profiles_self_update" original (supabase/schema.sql,
-- linha 541) só checava `auth.uid() = id` (o usuário está editando a
-- própria linha), sem nenhum WITH CHECK. Isso permitia que QUALQUER usuário
-- autenticado gravasse role='admin' na própria linha via um UPDATE comum
-- (ex.: chamando a REST API do Supabase direto com a anon key + o próprio
-- JWT, sem precisar nem passar pelo app) — uma escalação de privilégio real.
--
-- Isso não era explorável na prática até a Tarefa 6 da sessão anterior,
-- porque nada no app gravava profiles.role de verdade. Depois que
-- AuthContext.updateRole passou a gravar, a brecha virou real.
--
-- Esta versão (a que foi de fato aplicada) é mais restritiva do que a
-- primeira proposta desta sessão: em vez de só bloquear o valor 'admin'
-- (WITH CHECK role <> 'admin'), o WITH CHECK abaixo compara a role nova
-- com a role atual via subquery — ou seja, UPDATE direto na tabela NUNCA
-- muda profiles.role, pra nenhum valor, nem entre 'hospede'/'anfitriao'.
-- A única forma de um usuário trocar a PRÓPRIA role passou a ser a function
-- set_own_role() abaixo, que é SECURITY DEFINER (bypassa RLS internamente)
-- e recusa 'admin' com uma exceção. Promover alguém a admin continua sendo
-- só manual no banco (não existe function equivalente pra isso, de
-- propósito).
-- ============================================================

DROP POLICY IF EXISTS "profiles_self_update" ON profiles;

CREATE POLICY "profiles_self_update" ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT role FROM profiles WHERE id = auth.uid())
  );

-- Única forma sancionada de um usuário trocar a própria role. Chamada por
-- services/profileService.ts (updateRole) via supabase.rpc('set_own_role', ...).
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
