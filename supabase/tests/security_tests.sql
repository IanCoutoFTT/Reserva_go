-- ============================================================
-- ReservaGO - Testes de segurança do banco (RLS, triggers, funções, storage)
-- ============================================================
-- COMO RODAR NO SUPABASE: Dashboard -> SQL Editor -> New query -> colar o
-- arquivo inteiro -> Run. O resultado final é uma tabela com uma linha por
-- teste (coluna "ok"). Todos devem dar ok = true.
--
-- COMO RODAR LOCAL (Postgres 16 puro, sem Supabase):
--   psql -d <db> -f supabase/tests/local_supabase_shim.sql
--   psql -d <db> -f supabase/schema.sql
--   (aplicar supabase/migrations/*.sql em ordem)
--   psql -d <db> -f supabase/tests/security_tests.sql
--
-- O que o script faz:
--  1. Cria 5 usuários de teste com UUIDs fixos (prefixo 00000000-0000-4000-...)
--     e os dados mínimos (cabanas, reservas, conversas, denúncia, arquivo).
--  2. Para cada teste, "vira" um usuário (SET ROLE authenticated/anon +
--     request.jwt.claims, exatamente como o PostgREST faz com o JWT do app),
--     tenta a ação, volta para o papel de administrador do banco e confere
--     se a ação teve efeito. Cada teste é desfeito logo em seguida (os testes
--     não interferem uns nos outros).
--  3. Apaga os usuários de teste (ON DELETE CASCADE limpa o resto).
--
-- Usuários de teste:
--   A = atacante (hóspede)     B = anfitrião (dono das cabanas)
--   C = vítima (hóspede)       D = admin       E = admin com conta excluída
-- ============================================================

-- ── Limpeza de uma execução anterior interrompida ───────────
DELETE FROM storage.objects WHERE name LIKE '00000000-0000-4000-a000-%';
DELETE FROM auth.users WHERE id::text LIKE '00000000-0000-4000-a000-%';

-- ── Infra dos testes ────────────────────────────────────────
CREATE TEMP TABLE _resultado (
  n         SERIAL,
  area      TEXT,
  teste     TEXT,
  esperado  TEXT,
  obtido    TEXT,
  ok        BOOLEAN,
  detalhe   TEXT
);

-- Executa p_sql como o usuário p_user (NULL = visitante sem login / chave anon),
-- depois avalia p_check como dono do banco. p_check recebe $1 = o que p_sql
-- devolveu (texto) e responde "a ação teve efeito?" (true/false).
-- p_esperado: 'bloqueado' (ataque) ou 'permitido' (uso legítimo do app).
CREATE FUNCTION pg_temp.t(
  p_area TEXT, p_teste TEXT, p_user UUID, p_sql TEXT, p_check TEXT, p_esperado TEXT
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_out TEXT;
  v_err TEXT;
  v_hit BOOLEAN;
BEGIN
  BEGIN
    BEGIN
      IF p_user IS NULL THEN
        PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
        PERFORM set_config('role', 'anon', true);
      ELSE
        PERFORM set_config('request.jwt.claims',
          json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
        PERFORM set_config('role', 'authenticated', true);
      END IF;

      IF p_sql ~* '^\s*(select|with)' THEN
        EXECUTE p_sql INTO v_out;
      ELSE
        EXECUTE p_sql;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
    END;

    PERFORM set_config('role', 'none', true);
    PERFORM set_config('request.jwt.claims', '', true);
    EXECUTE p_check INTO v_hit USING v_out;

    RAISE EXCEPTION 'desfazer_teste';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'desfazer_teste' THEN
      v_err := COALESCE(v_err || ' | ', '') || 'erro na conferência: ' || SQLERRM;
      v_hit := NULL;
    END IF;
  END;

  INSERT INTO _resultado (area, teste, esperado, obtido, ok, detalhe)
  VALUES (
    p_area, p_teste, p_esperado,
    CASE WHEN COALESCE(v_hit, FALSE) THEN 'permitido' ELSE 'bloqueado' END,
    (CASE WHEN COALESCE(v_hit, FALSE) THEN 'permitido' ELSE 'bloqueado' END) = p_esperado,
    v_err
  );
END;
$$;

-- ── Dados de teste (como dono do banco: triggers de proteção não interferem) ──
SELECT set_config('request.jwt.claims', '', false);

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-a000-00000000000a', 'atacante@teste.local', '{"full_name":"Atacante"}'),
  ('00000000-0000-4000-a000-00000000000b', 'anfitriao@teste.local', '{"full_name":"Anfitriao"}'),
  ('00000000-0000-4000-a000-00000000000c', 'vitima@teste.local',   '{"full_name":"Vitima"}'),
  ('00000000-0000-4000-a000-00000000000d', 'admin@teste.local',    '{"full_name":"Admin"}'),
  ('00000000-0000-4000-a000-00000000000e', 'exadmin@teste.local',  '{"full_name":"Ex Admin"}');

UPDATE profiles SET phone = '+55 62 90000-0000' WHERE id::text LIKE '00000000-0000-4000-a000-%';
UPDATE profiles SET role = 'anfitriao' WHERE id = '00000000-0000-4000-a000-00000000000b';
UPDATE profiles SET role = 'admin'     WHERE id = '00000000-0000-4000-a000-00000000000d';
UPDATE profiles SET role = 'admin', deleted_at = NOW() WHERE id = '00000000-0000-4000-a000-00000000000e';

INSERT INTO properties (id, owner_id, title, location, price, status) VALUES
  ('00000000-0000-4000-a000-0000000000f1', '00000000-0000-4000-a000-00000000000b', 'Cabana Teste Ativa',    'GO', 300, 'ativo'),
  ('00000000-0000-4000-a000-0000000000f2', '00000000-0000-4000-a000-00000000000b', 'Cabana Teste Pendente', 'GO', 200, 'pendente');

INSERT INTO bookings (id, property_id, guest_id, check_in, check_out, pay_method, price_per_night, total) VALUES
  -- reserva futura da vítima
  ('00000000-0000-4000-a000-0000000000b1', '00000000-0000-4000-a000-0000000000f1', '00000000-0000-4000-a000-00000000000c',
   CURRENT_DATE + 30, CURRENT_DATE + 33, 'pix', 300, 940.50),
  -- estadia JÁ ENCERRADA do atacante (pode avaliar)
  ('00000000-0000-4000-a000-0000000000b2', '00000000-0000-4000-a000-0000000000f1', '00000000-0000-4000-a000-00000000000a',
   CURRENT_DATE - 10, CURRENT_DATE - 7, 'card', 300, 990),
  -- reserva futura do atacante
  ('00000000-0000-4000-a000-0000000000b3', '00000000-0000-4000-a000-0000000000f1', '00000000-0000-4000-a000-00000000000a',
   CURRENT_DATE + 60, CURRENT_DATE + 62, 'card', 300, 660);

INSERT INTO conversations (id, property_id, guest_id, host_id) VALUES
  ('00000000-0000-4000-a000-0000000000c1', '00000000-0000-4000-a000-0000000000f1', '00000000-0000-4000-a000-00000000000c', '00000000-0000-4000-a000-00000000000b'),
  ('00000000-0000-4000-a000-0000000000c2', '00000000-0000-4000-a000-0000000000f1', '00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000b');

INSERT INTO messages (id, conversation_id, sender_id, content) VALUES
  ('00000000-0000-4000-a000-0000000000e1', '00000000-0000-4000-a000-0000000000c1', '00000000-0000-4000-a000-00000000000b', 'Mensagem privada B->C'),
  ('00000000-0000-4000-a000-0000000000e2', '00000000-0000-4000-a000-0000000000c2', '00000000-0000-4000-a000-00000000000b', 'Mensagem B->A');

INSERT INTO reports (id, reporter_id, property_id, reason) VALUES
  ('00000000-0000-4000-a000-0000000000d1', '00000000-0000-4000-a000-00000000000c', '00000000-0000-4000-a000-0000000000f1', 'Denuncia da vitima');

INSERT INTO storage.objects (bucket_id, name, owner) VALUES
  ('avatars', '00000000-0000-4000-a000-00000000000c/foto.png', '00000000-0000-4000-a000-00000000000c');

-- 3º teste (29/10/2026): contas excluídas que continuam com sessão válida.
--   F = hóspede que excluiu a conta    G = anfitrião que excluiu a conta (cabana f3 ainda "ativa")
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-a000-00000000000f', 'exhospede@teste.local',   '{"full_name":"Ex Hospede"}'),
  ('00000000-0000-4000-a000-000000000010', 'exanfitriao@teste.local', '{"full_name":"Ex Anfitriao"}');
UPDATE profiles SET role = 'anfitriao' WHERE id = '00000000-0000-4000-a000-000000000010';
INSERT INTO properties (id, owner_id, title, location, price, status) VALUES
  ('00000000-0000-4000-a000-0000000000f3', '00000000-0000-4000-a000-000000000010', 'Cabana de Conta Excluida', 'GO', 250, 'ativo');
INSERT INTO conversations (id, property_id, guest_id, host_id) VALUES
  ('00000000-0000-4000-a000-0000000000c3', '00000000-0000-4000-a000-0000000000f1', '00000000-0000-4000-a000-00000000000f', '00000000-0000-4000-a000-00000000000b');
UPDATE profiles SET deleted_at = NOW()
 WHERE id IN ('00000000-0000-4000-a000-00000000000f', '00000000-0000-4000-a000-000000000010');

-- ============================================================
-- PERFIS (profiles)
-- ============================================================
SELECT pg_temp.t('perfis', 'Visitante sem login lê e-mail/telefone de usuários', NULL,
  $q$SELECT count(*) FROM profiles WHERE email <> '' OR phone IS NOT NULL$q$,
  $c$SELECT COALESCE($1::int, 0) > 0$c$, 'bloqueado');

SELECT pg_temp.t('perfis', 'Usuário logado lê telefone de outra pessoa', '00000000-0000-4000-a000-00000000000a',
  $q$SELECT phone FROM profiles WHERE id = '00000000-0000-4000-a000-00000000000c'$q$,
  $c$SELECT $1 IS NOT NULL$c$, 'bloqueado');

SELECT pg_temp.t('perfis', 'Usuário lê o próprio perfil completo via get_my_profile()', '00000000-0000-4000-a000-00000000000a',
  $q$SELECT email FROM get_my_profile()$q$,
  $c$SELECT $1 = 'atacante@teste.local'$c$, 'permitido');

SELECT pg_temp.t('perfis', 'Promover a si mesmo a admin com UPDATE direto', '00000000-0000-4000-a000-00000000000a',
  $q$UPDATE profiles SET role = 'admin' WHERE id = '00000000-0000-4000-a000-00000000000a'$q$,
  $c$SELECT role = 'admin' FROM profiles WHERE id = '00000000-0000-4000-a000-00000000000a'$c$, 'bloqueado');

SELECT pg_temp.t('perfis', 'Promover a si mesmo a admin via set_own_role()', '00000000-0000-4000-a000-00000000000a',
  $q$SELECT role FROM set_own_role('admin')$q$,
  $c$SELECT role = 'admin' FROM profiles WHERE id = '00000000-0000-4000-a000-00000000000a'$c$, 'bloqueado');

SELECT pg_temp.t('perfis', 'Trocar a própria role para anfitrião via set_own_role()', '00000000-0000-4000-a000-00000000000a',
  $q$SELECT role FROM set_own_role('anfitriao')$q$,
  $c$SELECT role = 'anfitriao' FROM profiles WHERE id = '00000000-0000-4000-a000-00000000000a'$c$, 'permitido');

SELECT pg_temp.t('perfis', 'Visitante sem login chama set_own_role()', NULL,
  $q$SELECT role FROM set_own_role('anfitriao')$q$,
  $c$SELECT $1 IS NOT NULL$c$, 'bloqueado');

SELECT pg_temp.t('perfis', 'Editar nome do perfil de outra pessoa', '00000000-0000-4000-a000-00000000000a',
  $q$UPDATE profiles SET name = 'hackeado' WHERE id = '00000000-0000-4000-a000-00000000000c'$q$,
  $c$SELECT name = 'hackeado' FROM profiles WHERE id = '00000000-0000-4000-a000-00000000000c'$c$, 'bloqueado');

SELECT pg_temp.t('perfis', 'Editar o próprio nome/bio (tela Editar Perfil)', '00000000-0000-4000-a000-00000000000a',
  $q$WITH u AS (UPDATE profiles SET name = 'Novo Nome', bio = 'oi' WHERE id = '00000000-0000-4000-a000-00000000000a' RETURNING id) SELECT count(*) FROM u$q$,
  $c$SELECT name = 'Novo Nome' FROM profiles WHERE id = '00000000-0000-4000-a000-00000000000a'$c$, 'permitido');

SELECT pg_temp.t('perfis', 'Trocar o próprio e-mail do perfil (e-mail vem do login Google)', '00000000-0000-4000-a000-00000000000a',
  $q$UPDATE profiles SET email = 'admin@reservago.com' WHERE id = '00000000-0000-4000-a000-00000000000a'$q$,
  $c$SELECT email = 'admin@reservago.com' FROM profiles WHERE id = '00000000-0000-4000-a000-00000000000a'$c$, 'bloqueado');

SELECT pg_temp.t('perfis', 'Gravar avatar_url com esquema perigoso (javascript:/http:)', '00000000-0000-4000-a000-00000000000a',
  $q$UPDATE profiles SET avatar_url = 'javascript:alert(1)' WHERE id = '00000000-0000-4000-a000-00000000000a'$q$,
  $c$SELECT avatar_url = 'javascript:alert(1)' FROM profiles WHERE id = '00000000-0000-4000-a000-00000000000a'$c$, 'bloqueado');

SELECT pg_temp.t('perfis', 'Gravar bio gigante (1 MB) - abuso de armazenamento', '00000000-0000-4000-a000-00000000000a',
  $q$UPDATE profiles SET bio = repeat('x', 1000000) WHERE id = '00000000-0000-4000-a000-00000000000a'$q$,
  $c$SELECT length(bio) = 1000000 FROM profiles WHERE id = '00000000-0000-4000-a000-00000000000a'$c$, 'bloqueado');

SELECT pg_temp.t('perfis', 'Excluir a própria conta (RPC delete_my_account, usada pelo app)', '00000000-0000-4000-a000-00000000000a',
  $q$SELECT delete_my_account()$q$,
  $c$SELECT deleted_at IS NOT NULL AND phone IS NULL FROM profiles WHERE id = '00000000-0000-4000-a000-00000000000a'$c$, 'permitido');

SELECT pg_temp.t('perfis', 'Reativar/forjar deleted_at com UPDATE direto', '00000000-0000-4000-a000-00000000000e',
  $q$UPDATE profiles SET deleted_at = NULL WHERE id = '00000000-0000-4000-a000-00000000000e'$q$,
  $c$SELECT deleted_at IS NULL FROM profiles WHERE id = '00000000-0000-4000-a000-00000000000e'$c$, 'bloqueado');

SELECT pg_temp.t('perfis', '(antigo) Excluir conta com UPDATE direto - o jeito que o app usava', '00000000-0000-4000-a000-00000000000a',
  $q$WITH u AS (UPDATE profiles SET deleted_at = NOW() WHERE id = '00000000-0000-4000-a000-00000000000a' RETURNING id) SELECT count(*) FROM u$q$,
  $c$SELECT deleted_at IS NOT NULL FROM profiles WHERE id = '00000000-0000-4000-a000-00000000000a'$c$, 'bloqueado');

-- ============================================================
-- CABANAS (properties)
-- ============================================================
SELECT pg_temp.t('cabanas', 'Visitante vê cabana ainda pendente de aprovação', NULL,
  $q$SELECT count(*) FROM properties WHERE id = '00000000-0000-4000-a000-0000000000f2'$q$,
  $c$SELECT $1::int > 0$c$, 'bloqueado');

SELECT pg_temp.t('cabanas', 'Visitante vê cabana ativa (Explorar)', NULL,
  $q$SELECT count(*) FROM properties WHERE id = '00000000-0000-4000-a000-0000000000f1'$q$,
  $c$SELECT $1::int = 1$c$, 'permitido');

SELECT pg_temp.t('cabanas', 'Anfitrião cria cabana já "ativo" e em destaque', '00000000-0000-4000-a000-00000000000b',
  $q$INSERT INTO properties (owner_id, title, price, status, featured, rating) VALUES ('00000000-0000-4000-a000-00000000000b', 'Burla', 100, 'ativo', TRUE, 5)$q$,
  $c$SELECT EXISTS (SELECT 1 FROM properties WHERE title = 'Burla' AND (status = 'ativo' OR featured OR rating = 5))$c$, 'bloqueado');

SELECT pg_temp.t('cabanas', 'Anfitrião cria cabana normal (fica pendente)', '00000000-0000-4000-a000-00000000000b',
  $q$INSERT INTO properties (owner_id, title, price) VALUES ('00000000-0000-4000-a000-00000000000b', 'Legitima', 150)$q$,
  $c$SELECT EXISTS (SELECT 1 FROM properties WHERE title = 'Legitima' AND status = 'pendente')$c$, 'permitido');

SELECT pg_temp.t('cabanas', 'Hóspede (não anfitrião) publica cabana', '00000000-0000-4000-a000-00000000000a',
  $q$INSERT INTO properties (owner_id, title, price) VALUES ('00000000-0000-4000-a000-00000000000a', 'Hospede publicando', 100)$q$,
  $c$SELECT EXISTS (SELECT 1 FROM properties WHERE title = 'Hospede publicando')$c$, 'bloqueado');

SELECT pg_temp.t('cabanas', 'Anfitrião aprova a própria cabana (status ativo)', '00000000-0000-4000-a000-00000000000b',
  $q$UPDATE properties SET status = 'ativo' WHERE id = '00000000-0000-4000-a000-0000000000f2'$q$,
  $c$SELECT status = 'ativo' FROM properties WHERE id = '00000000-0000-4000-a000-0000000000f2'$c$, 'bloqueado');

SELECT pg_temp.t('cabanas', 'Anfitrião infla nota/contadores da própria cabana', '00000000-0000-4000-a000-00000000000b',
  $q$UPDATE properties SET rating = 5, reviews_count = 999, featured = TRUE WHERE id = '00000000-0000-4000-a000-0000000000f1'$q$,
  $c$SELECT rating = 5 OR reviews_count = 999 OR featured FROM properties WHERE id = '00000000-0000-4000-a000-0000000000f1'$c$, 'bloqueado');

SELECT pg_temp.t('cabanas', 'Anfitrião transfere a cabana para outro dono', '00000000-0000-4000-a000-00000000000b',
  $q$UPDATE properties SET owner_id = '00000000-0000-4000-a000-00000000000c' WHERE id = '00000000-0000-4000-a000-0000000000f1'$q$,
  $c$SELECT owner_id <> '00000000-0000-4000-a000-00000000000b' FROM properties WHERE id = '00000000-0000-4000-a000-0000000000f1'$c$, 'bloqueado');

SELECT pg_temp.t('cabanas', 'Anfitrião edita título/preço da própria cabana', '00000000-0000-4000-a000-00000000000b',
  $q$UPDATE properties SET title = 'Novo titulo', price = 350 WHERE id = '00000000-0000-4000-a000-0000000000f1'$q$,
  $c$SELECT title = 'Novo titulo' AND price = 350 FROM properties WHERE id = '00000000-0000-4000-a000-0000000000f1'$c$, 'permitido');

SELECT pg_temp.t('cabanas', 'Anfitrião "exclui" a própria cabana (status removido)', '00000000-0000-4000-a000-00000000000b',
  $q$UPDATE properties SET status = 'removido' WHERE id = '00000000-0000-4000-a000-0000000000f1'$q$,
  $c$SELECT status::text = 'removido' FROM properties WHERE id = '00000000-0000-4000-a000-0000000000f1'$c$, 'permitido');

SELECT pg_temp.t('cabanas', 'Anfitrião define preço negativo', '00000000-0000-4000-a000-00000000000b',
  $q$UPDATE properties SET price = -100 WHERE id = '00000000-0000-4000-a000-0000000000f1'$q$,
  $c$SELECT price < 0 FROM properties WHERE id = '00000000-0000-4000-a000-0000000000f1'$c$, 'bloqueado');

SELECT pg_temp.t('cabanas', 'Anfitrião grava imagem com URL não-HTTPS', '00000000-0000-4000-a000-00000000000b',
  $q$UPDATE properties SET images = ARRAY['http://rastreador.exemplo/pixel.gif'] WHERE id = '00000000-0000-4000-a000-0000000000f1'$q$,
  $c$SELECT images[1] LIKE 'http://%' FROM properties WHERE id = '00000000-0000-4000-a000-0000000000f1'$c$, 'bloqueado');

SELECT pg_temp.t('cabanas', 'Usuário comum edita cabana de outra pessoa', '00000000-0000-4000-a000-00000000000a',
  $q$UPDATE properties SET title = 'hackeado' WHERE id = '00000000-0000-4000-a000-0000000000f1'$q$,
  $c$SELECT title = 'hackeado' FROM properties WHERE id = '00000000-0000-4000-a000-0000000000f1'$c$, 'bloqueado');

SELECT pg_temp.t('cabanas', 'Admin aprova cabana pendente', '00000000-0000-4000-a000-00000000000d',
  $q$UPDATE properties SET status = 'ativo' WHERE id = '00000000-0000-4000-a000-0000000000f2'$q$,
  $c$SELECT status = 'ativo' FROM properties WHERE id = '00000000-0000-4000-a000-0000000000f2'$c$, 'permitido');

SELECT pg_temp.t('cabanas', 'Admin com conta EXCLUÍDA ainda aprova cabana', '00000000-0000-4000-a000-00000000000e',
  $q$UPDATE properties SET status = 'ativo' WHERE id = '00000000-0000-4000-a000-0000000000f2'$q$,
  $c$SELECT status = 'ativo' FROM properties WHERE id = '00000000-0000-4000-a000-0000000000f2'$c$, 'bloqueado');

SELECT pg_temp.t('cabanas', 'Admin com conta EXCLUÍDA ainda lê cabanas pendentes', '00000000-0000-4000-a000-00000000000e',
  $q$SELECT count(*) FROM properties WHERE status = 'pendente'$q$,
  $c$SELECT $1::int > 0$c$, 'bloqueado');

-- ============================================================
-- RESERVAS (bookings)
-- ============================================================
SELECT pg_temp.t('reservas', 'Hóspede reserva pagando R$ 1,00 (total vindo do app)', '00000000-0000-4000-a000-00000000000a',
  $q$INSERT INTO bookings (property_id, guest_id, check_in, check_out, pay_method, price_per_night, total) VALUES ('00000000-0000-4000-a000-0000000000f1', '00000000-0000-4000-a000-00000000000a', CURRENT_DATE + 90, CURRENT_DATE + 92, 'card', 1, 1)$q$,
  $c$SELECT EXISTS (SELECT 1 FROM bookings WHERE guest_id = '00000000-0000-4000-a000-00000000000a' AND check_in = CURRENT_DATE + 90 AND total < 600)$c$, 'bloqueado');

SELECT pg_temp.t('reservas', 'Hóspede faz reserva normal (preço calculado no banco)', '00000000-0000-4000-a000-00000000000a',
  $q$INSERT INTO bookings (property_id, guest_id, check_in, check_out, pay_method, price_per_night, total) VALUES ('00000000-0000-4000-a000-0000000000f1', '00000000-0000-4000-a000-00000000000a', CURRENT_DATE + 90, CURRENT_DATE + 92, 'card', 300, 660)$q$,
  $c$SELECT EXISTS (SELECT 1 FROM bookings WHERE guest_id = '00000000-0000-4000-a000-00000000000a' AND check_in = CURRENT_DATE + 90 AND total = 660)$c$, 'permitido');

SELECT pg_temp.t('reservas', 'Reservar em nome de outra pessoa (guest_id alheio)', '00000000-0000-4000-a000-00000000000a',
  $q$INSERT INTO bookings (property_id, guest_id, check_in, check_out, price_per_night, total) VALUES ('00000000-0000-4000-a000-0000000000f1', '00000000-0000-4000-a000-00000000000c', CURRENT_DATE + 100, CURRENT_DATE + 101, 300, 330)$q$,
  $c$SELECT EXISTS (SELECT 1 FROM bookings WHERE guest_id = '00000000-0000-4000-a000-00000000000c' AND check_in = CURRENT_DATE + 100)$c$, 'bloqueado');

SELECT pg_temp.t('reservas', 'Reservar cabana que ainda não foi aprovada', '00000000-0000-4000-a000-00000000000a',
  $q$INSERT INTO bookings (property_id, guest_id, check_in, check_out, price_per_night, total) VALUES ('00000000-0000-4000-a000-0000000000f2', '00000000-0000-4000-a000-00000000000a', CURRENT_DATE + 5, CURRENT_DATE + 6, 200, 220)$q$,
  $c$SELECT EXISTS (SELECT 1 FROM bookings WHERE property_id = '00000000-0000-4000-a000-0000000000f2')$c$, 'bloqueado');

SELECT pg_temp.t('reservas', 'Reservar datas que já estão ocupadas (sobreposição)', '00000000-0000-4000-a000-00000000000a',
  $q$INSERT INTO bookings (property_id, guest_id, check_in, check_out, price_per_night, total) VALUES ('00000000-0000-4000-a000-0000000000f1', '00000000-0000-4000-a000-00000000000a', CURRENT_DATE + 31, CURRENT_DATE + 32, 300, 330)$q$,
  $c$SELECT EXISTS (SELECT 1 FROM bookings WHERE guest_id = '00000000-0000-4000-a000-00000000000a' AND check_in = CURRENT_DATE + 31)$c$, 'bloqueado');

SELECT pg_temp.t('reservas', 'Bloquear o calendário: reserva de 300 noites', '00000000-0000-4000-a000-00000000000a',
  $q$INSERT INTO bookings (property_id, guest_id, check_in, check_out, price_per_night, total) VALUES ('00000000-0000-4000-a000-0000000000f1', '00000000-0000-4000-a000-00000000000a', CURRENT_DATE + 63, CURRENT_DATE + 363, 300, 1)$q$,
  $c$SELECT EXISTS (SELECT 1 FROM bookings WHERE guest_id = '00000000-0000-4000-a000-00000000000a' AND check_in = CURRENT_DATE + 63)$c$, 'bloqueado');

SELECT pg_temp.t('reservas', 'Bloquear o calendário: reserva para daqui a 3 anos', '00000000-0000-4000-a000-00000000000a',
  $q$INSERT INTO bookings (property_id, guest_id, check_in, check_out, price_per_night, total) VALUES ('00000000-0000-4000-a000-0000000000f1', '00000000-0000-4000-a000-00000000000a', CURRENT_DATE + 1100, CURRENT_DATE + 1102, 300, 1)$q$,
  $c$SELECT EXISTS (SELECT 1 FROM bookings WHERE guest_id = '00000000-0000-4000-a000-00000000000a' AND check_in = CURRENT_DATE + 1100)$c$, 'bloqueado');

SELECT pg_temp.t('reservas', 'Bloquear o calendário: 10 reservas seguidas sem pagar', '00000000-0000-4000-a000-00000000000a',
  $q$INSERT INTO bookings (property_id, guest_id, check_in, check_out, price_per_night, total) SELECT '00000000-0000-4000-a000-0000000000f1', '00000000-0000-4000-a000-00000000000a', CURRENT_DATE + 120 + g*3, CURRENT_DATE + 122 + g*3, 300, 1 FROM generate_series(1, 10) g$q$,
  $c$SELECT count(*) >= 10 FROM bookings WHERE guest_id = '00000000-0000-4000-a000-00000000000a' AND check_in > CURRENT_DATE + 120$c$, 'bloqueado');

SELECT pg_temp.t('reservas', 'Anfitrião reserva a própria cabana (inflar contadores)', '00000000-0000-4000-a000-00000000000b',
  $q$INSERT INTO bookings (property_id, guest_id, check_in, check_out, price_per_night, total) VALUES ('00000000-0000-4000-a000-0000000000f1', '00000000-0000-4000-a000-00000000000b', CURRENT_DATE + 200, CURRENT_DATE + 201, 300, 330)$q$,
  $c$SELECT EXISTS (SELECT 1 FROM bookings WHERE guest_id = '00000000-0000-4000-a000-00000000000b')$c$, 'bloqueado');

SELECT pg_temp.t('reservas', 'Ler a reserva de outro hóspede', '00000000-0000-4000-a000-00000000000a',
  $q$SELECT count(*) FROM bookings WHERE id = '00000000-0000-4000-a000-0000000000b1'$q$,
  $c$SELECT $1::int > 0$c$, 'bloqueado');

SELECT pg_temp.t('reservas', 'Anfitrião vê reservas da própria cabana', '00000000-0000-4000-a000-00000000000b',
  $q$SELECT count(*) FROM bookings WHERE property_id = '00000000-0000-4000-a000-0000000000f1'$q$,
  $c$SELECT $1::int = 3$c$, 'permitido');

SELECT pg_temp.t('reservas', 'Cancelar a reserva de outro hóspede', '00000000-0000-4000-a000-00000000000a',
  $q$UPDATE bookings SET status = 'cancelada' WHERE id = '00000000-0000-4000-a000-0000000000b1'$q$,
  $c$SELECT status = 'cancelada' FROM bookings WHERE id = '00000000-0000-4000-a000-0000000000b1'$c$, 'bloqueado');

SELECT pg_temp.t('reservas', 'Hóspede altera total/datas da própria reserva', '00000000-0000-4000-a000-00000000000a',
  $q$UPDATE bookings SET total = 1, check_out = CURRENT_DATE + 70 WHERE id = '00000000-0000-4000-a000-0000000000b3'$q$,
  $c$SELECT total = 1 OR check_out = CURRENT_DATE + 70 FROM bookings WHERE id = '00000000-0000-4000-a000-0000000000b3'$c$, 'bloqueado');

SELECT pg_temp.t('reservas', 'Hóspede marca reserva futura como "realizada"', '00000000-0000-4000-a000-00000000000a',
  $q$UPDATE bookings SET status = 'realizada' WHERE id = '00000000-0000-4000-a000-0000000000b3'$q$,
  $c$SELECT status = 'realizada' FROM bookings WHERE id = '00000000-0000-4000-a000-0000000000b3'$c$, 'bloqueado');

SELECT pg_temp.t('reservas', 'Hóspede cancela a própria reserva', '00000000-0000-4000-a000-00000000000a',
  $q$UPDATE bookings SET status = 'cancelada', cancel_reason = 'mudanca de planos' WHERE id = '00000000-0000-4000-a000-0000000000b3'$q$,
  $c$SELECT status = 'cancelada' FROM bookings WHERE id = '00000000-0000-4000-a000-0000000000b3'$c$, 'permitido');

-- ============================================================
-- FAVORITOS
-- ============================================================
SELECT pg_temp.t('favoritos', 'Adicionar favorito na conta de outra pessoa', '00000000-0000-4000-a000-00000000000a',
  $q$INSERT INTO favorites (user_id, property_id) VALUES ('00000000-0000-4000-a000-00000000000c', '00000000-0000-4000-a000-0000000000f1')$q$,
  $c$SELECT EXISTS (SELECT 1 FROM favorites WHERE user_id = '00000000-0000-4000-a000-00000000000c')$c$, 'bloqueado');

SELECT pg_temp.t('favoritos', 'Favoritar uma cabana (uso normal)', '00000000-0000-4000-a000-00000000000a',
  $q$INSERT INTO favorites (user_id, property_id) VALUES ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-0000000000f1')$q$,
  $c$SELECT EXISTS (SELECT 1 FROM favorites WHERE user_id = '00000000-0000-4000-a000-00000000000a')$c$, 'permitido');

-- ============================================================
-- AVALIAÇÕES (reviews)
-- ============================================================
SELECT pg_temp.t('avaliações', 'Avaliar cabana sem nunca ter se hospedado', '00000000-0000-4000-a000-00000000000c',
  $q$INSERT INTO reviews (property_id, author_id, rating, comment) VALUES ('00000000-0000-4000-a000-0000000000f1', '00000000-0000-4000-a000-00000000000c', 1, 'falsa')$q$,
  $c$SELECT EXISTS (SELECT 1 FROM reviews WHERE author_id = '00000000-0000-4000-a000-00000000000c')$c$, 'bloqueado');

SELECT pg_temp.t('avaliações', 'Avaliar usando a reserva de OUTRA pessoa', '00000000-0000-4000-a000-00000000000a',
  $q$INSERT INTO reviews (property_id, booking_id, author_id, rating) VALUES ('00000000-0000-4000-a000-0000000000f1', '00000000-0000-4000-a000-0000000000b1', '00000000-0000-4000-a000-00000000000a', 1)$q$,
  $c$SELECT EXISTS (SELECT 1 FROM reviews WHERE booking_id = '00000000-0000-4000-a000-0000000000b1')$c$, 'bloqueado');

SELECT pg_temp.t('avaliações', 'Avaliar antes da estadia acontecer', '00000000-0000-4000-a000-00000000000a',
  $q$INSERT INTO reviews (property_id, booking_id, author_id, rating) VALUES ('00000000-0000-4000-a000-0000000000f1', '00000000-0000-4000-a000-0000000000b3', '00000000-0000-4000-a000-00000000000a', 5)$q$,
  $c$SELECT EXISTS (SELECT 1 FROM reviews WHERE booking_id = '00000000-0000-4000-a000-0000000000b3')$c$, 'bloqueado');

SELECT pg_temp.t('avaliações', 'Avaliar estadia encerrada (uso normal)', '00000000-0000-4000-a000-00000000000a',
  $q$INSERT INTO reviews (property_id, booking_id, author_id, rating, comment) VALUES ('00000000-0000-4000-a000-0000000000f1', '00000000-0000-4000-a000-0000000000b2', '00000000-0000-4000-a000-00000000000a', 4, 'Muito bom')$q$,
  $c$SELECT EXISTS (SELECT 1 FROM reviews WHERE booking_id = '00000000-0000-4000-a000-0000000000b2')$c$, 'permitido');

SELECT pg_temp.t('avaliações', 'Avaliar a mesma estadia duas vezes', '00000000-0000-4000-a000-00000000000a',
  $q$INSERT INTO reviews (property_id, booking_id, author_id, rating) SELECT '00000000-0000-4000-a000-0000000000f1', '00000000-0000-4000-a000-0000000000b2', '00000000-0000-4000-a000-00000000000a', 5 FROM generate_series(1, 2)$q$,
  $c$SELECT count(*) > 1 FROM reviews WHERE booking_id = '00000000-0000-4000-a000-0000000000b2'$c$, 'bloqueado');

SELECT pg_temp.t('avaliações', 'Nota fora da escala (rating = 6)', '00000000-0000-4000-a000-00000000000a',
  $q$INSERT INTO reviews (property_id, booking_id, author_id, rating) VALUES ('00000000-0000-4000-a000-0000000000f1', '00000000-0000-4000-a000-0000000000b2', '00000000-0000-4000-a000-00000000000a', 6)$q$,
  $c$SELECT EXISTS (SELECT 1 FROM reviews WHERE rating = 6)$c$, 'bloqueado');

-- ============================================================
-- CONVERSAS E MENSAGENS
-- ============================================================
SELECT pg_temp.t('mensagens', 'Ler mensagens de uma conversa alheia', '00000000-0000-4000-a000-00000000000a',
  $q$SELECT count(*) FROM messages WHERE conversation_id = '00000000-0000-4000-a000-0000000000c1'$q$,
  $c$SELECT $1::int > 0$c$, 'bloqueado');

SELECT pg_temp.t('mensagens', 'Enviar mensagem dentro de conversa alheia', '00000000-0000-4000-a000-00000000000a',
  $q$INSERT INTO messages (conversation_id, sender_id, content) VALUES ('00000000-0000-4000-a000-0000000000c1', '00000000-0000-4000-a000-00000000000a', 'intrusa')$q$,
  $c$SELECT EXISTS (SELECT 1 FROM messages WHERE content = 'intrusa')$c$, 'bloqueado');

SELECT pg_temp.t('mensagens', 'Enviar mensagem se passando pelo anfitrião (sender_id falso)', '00000000-0000-4000-a000-00000000000a',
  $q$INSERT INTO messages (conversation_id, sender_id, content) VALUES ('00000000-0000-4000-a000-0000000000c2', '00000000-0000-4000-a000-00000000000b', 'falsificada')$q$,
  $c$SELECT EXISTS (SELECT 1 FROM messages WHERE content = 'falsificada')$c$, 'bloqueado');

SELECT pg_temp.t('mensagens', 'Phishing: abrir conversa fingindo ser o anfitrião de cabana alheia', '00000000-0000-4000-a000-00000000000a',
  $q$INSERT INTO conversations (property_id, guest_id, host_id) VALUES ('00000000-0000-4000-a000-0000000000f2', '00000000-0000-4000-a000-00000000000c', '00000000-0000-4000-a000-00000000000a')$q$,
  $c$SELECT EXISTS (SELECT 1 FROM conversations WHERE host_id = '00000000-0000-4000-a000-00000000000a')$c$, 'bloqueado');

SELECT pg_temp.t('mensagens', 'Abrir "suporte" com usuário comum no lugar do admin', '00000000-0000-4000-a000-00000000000a',
  $q$INSERT INTO conversations (property_id, guest_id, host_id) VALUES (NULL, '00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000c')$q$,
  $c$SELECT EXISTS (SELECT 1 FROM conversations WHERE guest_id = '00000000-0000-4000-a000-00000000000a' AND host_id = '00000000-0000-4000-a000-00000000000c')$c$, 'bloqueado');

SELECT pg_temp.t('mensagens', 'Hóspede abre conversa com o dono da cabana (botão Contato)', '00000000-0000-4000-a000-00000000000c',
  $q$INSERT INTO conversations (property_id, guest_id, host_id) VALUES ('00000000-0000-4000-a000-0000000000f2', '00000000-0000-4000-a000-00000000000c', '00000000-0000-4000-a000-00000000000b')$q$,
  $c$SELECT EXISTS (SELECT 1 FROM conversations WHERE property_id = '00000000-0000-4000-a000-0000000000f2' AND guest_id = '00000000-0000-4000-a000-00000000000c')$c$, 'permitido');

SELECT pg_temp.t('mensagens', 'Hóspede abre conversa de suporte com o admin', '00000000-0000-4000-a000-00000000000a',
  $q$INSERT INTO conversations (property_id, guest_id, host_id) VALUES (NULL, '00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000d')$q$,
  $c$SELECT EXISTS (SELECT 1 FROM conversations WHERE guest_id = '00000000-0000-4000-a000-00000000000a' AND host_id = '00000000-0000-4000-a000-00000000000d')$c$, 'permitido');

SELECT pg_temp.t('mensagens', 'Enviar mensagem na própria conversa (gera notificação)', '00000000-0000-4000-a000-00000000000a',
  $q$INSERT INTO messages (conversation_id, sender_id, content) VALUES ('00000000-0000-4000-a000-0000000000c2', '00000000-0000-4000-a000-00000000000a', 'Oi anfitriao')$q$,
  $c$SELECT EXISTS (SELECT 1 FROM messages WHERE content = 'Oi anfitriao') AND EXISTS (SELECT 1 FROM notifications WHERE user_id = '00000000-0000-4000-a000-00000000000b' AND body = 'Oi anfitriao')$c$, 'permitido');

SELECT pg_temp.t('mensagens', 'Mensagem gigante (1 MB) - abuso/spam', '00000000-0000-4000-a000-00000000000a',
  $q$INSERT INTO messages (conversation_id, sender_id, content) VALUES ('00000000-0000-4000-a000-0000000000c2', '00000000-0000-4000-a000-00000000000a', repeat('x', 1000000))$q$,
  $c$SELECT EXISTS (SELECT 1 FROM messages WHERE length(content) = 1000000)$c$, 'bloqueado');

SELECT pg_temp.t('mensagens', 'Reescrever o texto de uma mensagem recebida', '00000000-0000-4000-a000-00000000000a',
  $q$UPDATE messages SET content = 'adulterada' WHERE id = '00000000-0000-4000-a000-0000000000e2'$q$,
  $c$SELECT content = 'adulterada' FROM messages WHERE id = '00000000-0000-4000-a000-0000000000e2'$c$, 'bloqueado');

SELECT pg_temp.t('mensagens', 'Marcar como lida mensagem recebida (uso normal)', '00000000-0000-4000-a000-00000000000a',
  $q$UPDATE messages SET read_at = NOW() WHERE id = '00000000-0000-4000-a000-0000000000e2'$q$,
  $c$SELECT read_at IS NOT NULL FROM messages WHERE id = '00000000-0000-4000-a000-0000000000e2'$c$, 'permitido');

SELECT pg_temp.t('mensagens', 'Marcar como lida mensagem de conversa alheia', '00000000-0000-4000-a000-00000000000a',
  $q$UPDATE messages SET read_at = NOW() WHERE id = '00000000-0000-4000-a000-0000000000e1'$q$,
  $c$SELECT read_at IS NOT NULL FROM messages WHERE id = '00000000-0000-4000-a000-0000000000e1'$c$, 'bloqueado');

SELECT pg_temp.t('mensagens', 'Alterar last_message de uma conversa diretamente', '00000000-0000-4000-a000-00000000000a',
  $q$UPDATE conversations SET last_message = 'forjada' WHERE id = '00000000-0000-4000-a000-0000000000c2'$q$,
  $c$SELECT last_message = 'forjada' FROM conversations WHERE id = '00000000-0000-4000-a000-0000000000c2'$c$, 'bloqueado');

-- ============================================================
-- NOTIFICAÇÕES
-- ============================================================
SELECT pg_temp.t('notificações', 'Criar notificação falsa para outro usuário via create_notification()', '00000000-0000-4000-a000-00000000000a',
  $q$SELECT create_notification('00000000-0000-4000-a000-00000000000c', 'aviso', 'Sua conta foi bloqueada', 'Pague via PIX para liberar')$q$,
  $c$SELECT EXISTS (SELECT 1 FROM notifications WHERE title = 'Sua conta foi bloqueada')$c$, 'bloqueado');

SELECT pg_temp.t('notificações', 'Inserir notificação direto na tabela', '00000000-0000-4000-a000-00000000000a',
  $q$INSERT INTO notifications (user_id, type, title, body) VALUES ('00000000-0000-4000-a000-00000000000c', 'aviso', 'Falsa', 'x')$q$,
  $c$SELECT EXISTS (SELECT 1 FROM notifications WHERE title = 'Falsa')$c$, 'bloqueado');

SELECT pg_temp.t('notificações', 'Ler notificações de outro usuário', '00000000-0000-4000-a000-00000000000a',
  $q$SELECT count(*) FROM notifications WHERE user_id = '00000000-0000-4000-a000-00000000000b'$q$,
  $c$SELECT $1::int > 0$c$, 'bloqueado');

SELECT pg_temp.t('notificações', 'Contar não lidas de outro usuário via RPC', '00000000-0000-4000-a000-00000000000a',
  $q$SELECT get_unread_notifications_count('00000000-0000-4000-a000-00000000000b')$q$,
  $c$SELECT $1::int = (SELECT count(*) FROM notifications WHERE user_id = '00000000-0000-4000-a000-00000000000b' AND NOT read) AND $1::int > 0$c$, 'bloqueado');

SELECT pg_temp.t('notificações', 'Marcar como lidas as notificações de outro usuário via RPC', '00000000-0000-4000-a000-00000000000a',
  $q$SELECT mark_all_notifications_read('00000000-0000-4000-a000-00000000000b')$q$,
  $c$SELECT NOT EXISTS (SELECT 1 FROM notifications WHERE user_id = '00000000-0000-4000-a000-00000000000b' AND NOT read)$c$, 'bloqueado');

SELECT pg_temp.t('notificações', 'Anfitrião marca as próprias notificações como lidas', '00000000-0000-4000-a000-00000000000b',
  $q$SELECT mark_all_notifications_read('00000000-0000-4000-a000-00000000000b')$q$,
  $c$SELECT NOT EXISTS (SELECT 1 FROM notifications WHERE user_id = '00000000-0000-4000-a000-00000000000b' AND NOT read)$c$, 'permitido');

SELECT pg_temp.t('notificações', 'Alterar o texto de uma notificação própria', '00000000-0000-4000-a000-00000000000b',
  $q$UPDATE notifications SET title = 'editada' WHERE user_id = '00000000-0000-4000-a000-00000000000b'$q$,
  $c$SELECT EXISTS (SELECT 1 FROM notifications WHERE title = 'editada')$c$, 'bloqueado');

-- ============================================================
-- DENÚNCIAS (reports) E PAINEL ADMIN
-- ============================================================
SELECT pg_temp.t('denúncias', 'Ler a denúncia feita por outra pessoa', '00000000-0000-4000-a000-00000000000a',
  $q$SELECT count(*) FROM reports WHERE id = '00000000-0000-4000-a000-0000000000d1'$q$,
  $c$SELECT $1::int > 0$c$, 'bloqueado');

SELECT pg_temp.t('denúncias', 'Abrir denúncia em nome de outra pessoa', '00000000-0000-4000-a000-00000000000a',
  $q$INSERT INTO reports (reporter_id, property_id, reason) VALUES ('00000000-0000-4000-a000-00000000000c', '00000000-0000-4000-a000-0000000000f1', 'em nome da vitima')$q$,
  $c$SELECT EXISTS (SELECT 1 FROM reports WHERE reason = 'em nome da vitima')$c$, 'bloqueado');

SELECT pg_temp.t('denúncias', 'Abrir denúncia já "resolvida" e assinada por um admin', '00000000-0000-4000-a000-00000000000a',
  $q$INSERT INTO reports (reporter_id, property_id, reason, status, resolved_by, resolution) VALUES ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-0000000000f1', 'forjada', 'resolvido', '00000000-0000-4000-a000-00000000000d', 'ok')$q$,
  $c$SELECT EXISTS (SELECT 1 FROM reports WHERE reason = 'forjada' AND (status <> 'pendente' OR resolved_by IS NOT NULL))$c$, 'bloqueado');

SELECT pg_temp.t('denúncias', 'Abrir denúncia (uso normal, avisa os admins)', '00000000-0000-4000-a000-00000000000a',
  $q$INSERT INTO reports (reporter_id, property_id, reason) VALUES ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-0000000000f1', 'Fotos falsas')$q$,
  $c$SELECT EXISTS (SELECT 1 FROM reports WHERE reason = 'Fotos falsas' AND status = 'pendente') AND EXISTS (SELECT 1 FROM notifications WHERE user_id = '00000000-0000-4000-a000-00000000000d' AND body LIKE '%Fotos falsas%')$c$, 'permitido');

SELECT pg_temp.t('denúncias', 'Usuário comum altera status de denúncia', '00000000-0000-4000-a000-00000000000c',
  $q$UPDATE reports SET status = 'arquivado' WHERE id = '00000000-0000-4000-a000-0000000000d1'$q$,
  $c$SELECT status = 'arquivado' FROM reports WHERE id = '00000000-0000-4000-a000-0000000000d1'$c$, 'bloqueado');

SELECT pg_temp.t('denúncias', 'Admin resolve denúncia (quem denunciou é avisado)', '00000000-0000-4000-a000-00000000000d',
  $q$UPDATE reports SET status = 'resolvido', resolved_at = NOW(), resolved_by = '00000000-0000-4000-a000-00000000000d' WHERE id = '00000000-0000-4000-a000-0000000000d1'$q$,
  $c$SELECT (SELECT status = 'resolvido' FROM reports WHERE id = '00000000-0000-4000-a000-0000000000d1') AND EXISTS (SELECT 1 FROM notifications WHERE user_id = '00000000-0000-4000-a000-00000000000c' AND title = 'Sua denúncia foi analisada')$c$, 'permitido');

SELECT pg_temp.t('denúncias', 'Admin assina a resolução com o nome de outro admin', '00000000-0000-4000-a000-00000000000d',
  $q$UPDATE reports SET status = 'resolvido', resolved_by = '00000000-0000-4000-a000-00000000000e' WHERE id = '00000000-0000-4000-a000-0000000000d1'$q$,
  $c$SELECT resolved_by = '00000000-0000-4000-a000-00000000000e' FROM reports WHERE id = '00000000-0000-4000-a000-0000000000d1'$c$, 'bloqueado');

SELECT pg_temp.t('admin', 'Usuário comum lê todas as reservas da plataforma', '00000000-0000-4000-a000-00000000000a',
  $q$SELECT count(*) FROM bookings$q$,
  $c$SELECT $1::int > (SELECT count(*) FROM bookings WHERE guest_id = '00000000-0000-4000-a000-00000000000a')$c$, 'bloqueado');

SELECT pg_temp.t('admin', 'Admin lê todas as reservas (painel)', '00000000-0000-4000-a000-00000000000d',
  $q$SELECT count(*) FROM bookings WHERE id::text LIKE '00000000-0000-4000-a000-%'$q$,
  $c$SELECT $1::int = 3$c$, 'permitido');

-- ============================================================
-- STORAGE (fotos)
-- ============================================================
SELECT pg_temp.t('storage', 'Enviar foto para a pasta de avatar de outra pessoa', '00000000-0000-4000-a000-00000000000a',
  $q$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('avatars', '00000000-0000-4000-a000-00000000000c/troca.png', '00000000-0000-4000-a000-00000000000a')$q$,
  $c$SELECT EXISTS (SELECT 1 FROM storage.objects WHERE name = '00000000-0000-4000-a000-00000000000c/troca.png')$c$, 'bloqueado');

SELECT pg_temp.t('storage', 'Enviar o próprio avatar (uso normal)', '00000000-0000-4000-a000-00000000000a',
  $q$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('avatars', '00000000-0000-4000-a000-00000000000a/eu.png', '00000000-0000-4000-a000-00000000000a')$q$,
  $c$SELECT EXISTS (SELECT 1 FROM storage.objects WHERE name = '00000000-0000-4000-a000-00000000000a/eu.png')$c$, 'permitido');

SELECT pg_temp.t('storage', 'Sobrescrever/mover o avatar de outra pessoa', '00000000-0000-4000-a000-00000000000a',
  $q$UPDATE storage.objects SET name = '00000000-0000-4000-a000-00000000000a/roubada.png' WHERE name = '00000000-0000-4000-a000-00000000000c/foto.png'$q$,
  $c$SELECT NOT EXISTS (SELECT 1 FROM storage.objects WHERE name = '00000000-0000-4000-a000-00000000000c/foto.png')$c$, 'bloqueado');

SELECT pg_temp.t('storage', 'Apagar o avatar de outra pessoa', '00000000-0000-4000-a000-00000000000a',
  $q$DELETE FROM storage.objects WHERE name = '00000000-0000-4000-a000-00000000000c/foto.png'$q$,
  $c$SELECT NOT EXISTS (SELECT 1 FROM storage.objects WHERE name = '00000000-0000-4000-a000-00000000000c/foto.png')$c$, 'bloqueado');

SELECT pg_temp.t('storage', 'Hóspede (não anfitrião) envia arquivo ao bucket de cabanas', '00000000-0000-4000-a000-00000000000a',
  $q$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('properties', '00000000-0000-4000-a000-00000000000a/x.png', '00000000-0000-4000-a000-00000000000a')$q$,
  $c$SELECT EXISTS (SELECT 1 FROM storage.objects WHERE name = '00000000-0000-4000-a000-00000000000a/x.png' AND bucket_id = 'properties')$c$, 'bloqueado');

SELECT pg_temp.t('storage', 'Anfitrião envia foto da própria cabana', '00000000-0000-4000-a000-00000000000b',
  $q$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('properties', '00000000-0000-4000-a000-00000000000b/cabana.jpg', '00000000-0000-4000-a000-00000000000b')$q$,
  $c$SELECT EXISTS (SELECT 1 FROM storage.objects WHERE name = '00000000-0000-4000-a000-00000000000b/cabana.jpg')$c$, 'permitido');

-- Configuração (não é ação de usuário): os buckets públicos precisam limitar tipo e
-- tamanho, senão dá para hospedar HTML/JS/executáveis de graça no domínio do projeto.
INSERT INTO _resultado (area, teste, esperado, obtido, ok, detalhe)
SELECT 'storage', 'Bucket "' || b.id || '" aceita qualquer tipo/tamanho de arquivo (ex.: .html)', 'bloqueado',
       CASE WHEN b.allowed_mime_types IS NULL OR b.file_size_limit IS NULL OR 'text/html' = ANY (b.allowed_mime_types) THEN 'permitido' ELSE 'bloqueado' END,
       NOT (b.allowed_mime_types IS NULL OR b.file_size_limit IS NULL OR 'text/html' = ANY (b.allowed_mime_types)),
       'allowed_mime_types=' || COALESCE(b.allowed_mime_types::text, 'NULL') || ' file_size_limit=' || COALESCE(b.file_size_limit::text, 'NULL')
FROM storage.buckets b WHERE b.id IN ('avatars', 'properties') ORDER BY b.id;

-- ============================================================
-- CONFIGURAÇÃO DAS FUNÇÕES
-- ============================================================
INSERT INTO _resultado (area, teste, esperado, obtido, ok, detalhe)
SELECT 'funções', 'SECURITY DEFINER sem search_path fixo: ' || p.proname, 'bloqueado', 'permitido', FALSE,
       'função roda como dono do banco e resolve nomes pelo search_path de quem chama'
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef
  AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%');

INSERT INTO _resultado (area, teste, esperado, obtido, ok, detalhe)
SELECT 'funções', 'Toda função SECURITY DEFINER tem search_path fixo', 'permitido', 'permitido', TRUE, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosecdef
    AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%')
);

-- ============================================================
-- 3º TESTE (29/10/2026) - achados T-01 a T-06 (docs/relatorio-seguranca.md)
-- ============================================================
-- T-01: conta excluída continua usando a API com o token que já tinha
-- (o app desloga, mas o JWT vale até expirar e o login Google gera outro).
SELECT pg_temp.t('conta excluída', 'Conta excluída faz reserva', '00000000-0000-4000-a000-00000000000f',
  $q$INSERT INTO bookings (property_id, guest_id, check_in, check_out, pay_method) VALUES ('00000000-0000-4000-a000-0000000000f1', '00000000-0000-4000-a000-00000000000f', CURRENT_DATE + 100, CURRENT_DATE + 102, 'pix')$q$,
  $c$SELECT EXISTS (SELECT 1 FROM bookings WHERE guest_id = '00000000-0000-4000-a000-00000000000f')$c$, 'bloqueado');

SELECT pg_temp.t('conta excluída', 'Conta excluída envia mensagem no chat', '00000000-0000-4000-a000-00000000000f',
  $q$INSERT INTO messages (conversation_id, sender_id, content) VALUES ('00000000-0000-4000-a000-0000000000c3', '00000000-0000-4000-a000-00000000000f', 'ainda estou aqui')$q$,
  $c$SELECT EXISTS (SELECT 1 FROM messages WHERE sender_id = '00000000-0000-4000-a000-00000000000f')$c$, 'bloqueado');

SELECT pg_temp.t('conta excluída', 'Conta excluída abre conversa nova', '00000000-0000-4000-a000-00000000000f',
  $q$INSERT INTO conversations (property_id, guest_id, host_id) VALUES ('00000000-0000-4000-a000-0000000000f2', '00000000-0000-4000-a000-00000000000f', '00000000-0000-4000-a000-00000000000b')$q$,
  $c$SELECT EXISTS (SELECT 1 FROM conversations WHERE guest_id = '00000000-0000-4000-a000-00000000000f' AND property_id = '00000000-0000-4000-a000-0000000000f2')$c$, 'bloqueado');

SELECT pg_temp.t('conta excluída', 'Conta excluída envia denúncia', '00000000-0000-4000-a000-00000000000f',
  $q$INSERT INTO reports (reporter_id, property_id, reason) VALUES ('00000000-0000-4000-a000-00000000000f', '00000000-0000-4000-a000-0000000000f1', 'spam')$q$,
  $c$SELECT EXISTS (SELECT 1 FROM reports WHERE reporter_id = '00000000-0000-4000-a000-00000000000f')$c$, 'bloqueado');

SELECT pg_temp.t('conta excluída', 'Conta excluída salva favorito', '00000000-0000-4000-a000-00000000000f',
  $q$INSERT INTO favorites (user_id, property_id) VALUES ('00000000-0000-4000-a000-00000000000f', '00000000-0000-4000-a000-0000000000f1')$q$,
  $c$SELECT EXISTS (SELECT 1 FROM favorites WHERE user_id = '00000000-0000-4000-a000-00000000000f')$c$, 'bloqueado');

SELECT pg_temp.t('conta excluída', 'Conta excluída envia arquivo de avatar', '00000000-0000-4000-a000-00000000000f',
  $q$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('avatars', '00000000-0000-4000-a000-00000000000f/x.png', '00000000-0000-4000-a000-00000000000f')$q$,
  $c$SELECT EXISTS (SELECT 1 FROM storage.objects WHERE name = '00000000-0000-4000-a000-00000000000f/x.png')$c$, 'bloqueado');

SELECT pg_temp.t('conta excluída', 'Conta excluída troca de role via set_own_role()', '00000000-0000-4000-a000-00000000000f',
  $q$SELECT role FROM set_own_role('anfitriao')$q$,
  $c$SELECT role = 'anfitriao' FROM profiles WHERE id = '00000000-0000-4000-a000-00000000000f'$c$, 'bloqueado');

SELECT pg_temp.t('conta excluída', 'Anfitrião excluído publica cabana nova', '00000000-0000-4000-a000-000000000010',
  $q$INSERT INTO properties (owner_id, title, location, price) VALUES ('00000000-0000-4000-a000-000000000010', 'Nova', 'GO', 100)$q$,
  $c$SELECT EXISTS (SELECT 1 FROM properties WHERE owner_id = '00000000-0000-4000-a000-000000000010' AND title = 'Nova')$c$, 'bloqueado');

-- T-02: cabana de anfitrião que excluiu a conta continua no ar e reservável.
SELECT pg_temp.t('conta excluída', 'Visitante vê cabana de anfitrião que excluiu a conta', NULL,
  $q$SELECT count(*) FROM properties WHERE id = '00000000-0000-4000-a000-0000000000f3'$q$,
  $c$SELECT $1::int > 0$c$, 'bloqueado');

SELECT pg_temp.t('conta excluída', 'Hóspede reserva cabana de anfitrião que excluiu a conta', '00000000-0000-4000-a000-00000000000c',
  $q$INSERT INTO bookings (property_id, guest_id, check_in, check_out, pay_method) VALUES ('00000000-0000-4000-a000-0000000000f3', '00000000-0000-4000-a000-00000000000c', CURRENT_DATE + 5, CURRENT_DATE + 7, 'pix')$q$,
  $c$SELECT EXISTS (SELECT 1 FROM bookings WHERE property_id = '00000000-0000-4000-a000-0000000000f3')$c$, 'bloqueado');

SELECT pg_temp.t('conta excluída', 'Excluir conta de hóspede libera as datas das reservas futuras', '00000000-0000-4000-a000-00000000000a',
  $q$SELECT delete_my_account()$q$,
  $c$SELECT status = 'cancelada' FROM bookings WHERE id = '00000000-0000-4000-a000-0000000000b3'$c$, 'permitido');

SELECT pg_temp.t('conta excluída', 'Excluir conta de anfitrião tira as cabanas do ar', '00000000-0000-4000-a000-00000000000b',
  $q$SELECT delete_my_account()$q$,
  $c$SELECT NOT EXISTS (SELECT 1 FROM properties WHERE owner_id = '00000000-0000-4000-a000-00000000000b' AND status = 'ativo')$c$, 'permitido');

-- T-03: anfitrião troca título/fotos de cabana já aprovada e ela continua no ar sem revisão.
SELECT pg_temp.t('moderação', 'Anfitrião troca título/descrição/fotos de cabana aprovada sem nova análise', '00000000-0000-4000-a000-00000000000b',
  $q$UPDATE properties SET title = 'Pague por PIX fora do app: 62 9...', images = ARRAY['https://exemplo.com/golpe.png'] WHERE id = '00000000-0000-4000-a000-0000000000f1'$q$,
  $c$SELECT title LIKE 'Pague%' AND status = 'ativo' FROM properties WHERE id = '00000000-0000-4000-a000-0000000000f1'$c$, 'bloqueado');

SELECT pg_temp.t('moderação', 'Anfitrião muda só o preço de cabana aprovada (continua no ar)', '00000000-0000-4000-a000-00000000000b',
  $q$UPDATE properties SET price = 350 WHERE id = '00000000-0000-4000-a000-0000000000f1'$q$,
  $c$SELECT price = 350 AND status = 'ativo' FROM properties WHERE id = '00000000-0000-4000-a000-0000000000f1'$c$, 'permitido');

SELECT pg_temp.t('moderação', 'Anfitrião edita cabana e ela volta para análise (fluxo do app)', '00000000-0000-4000-a000-00000000000b',
  $q$UPDATE properties SET description = 'Nova descrição' WHERE id = '00000000-0000-4000-a000-0000000000f1'$q$,
  $c$SELECT description = 'Nova descrição' AND status = 'pendente' FROM properties WHERE id = '00000000-0000-4000-a000-0000000000f1'$c$, 'permitido');

-- T-04: perfil se passando pela equipe do app.
SELECT pg_temp.t('perfis', 'Usuário comum se chama "Suporte ReservaGO" (golpe no chat)', '00000000-0000-4000-a000-00000000000b',
  $q$UPDATE profiles SET name = 'Suporte ReservaGO' WHERE id = '00000000-0000-4000-a000-00000000000b'$q$,
  $c$SELECT name = 'Suporte ReservaGO' FROM profiles WHERE id = '00000000-0000-4000-a000-00000000000b'$c$, 'bloqueado');

SELECT pg_temp.t('perfis', 'Usuário comum se chama "Admin"', '00000000-0000-4000-a000-00000000000a',
  $q$UPDATE profiles SET name = 'Admin' WHERE id = '00000000-0000-4000-a000-00000000000a'$q$,
  $c$SELECT name = 'Admin' FROM profiles WHERE id = '00000000-0000-4000-a000-00000000000a'$c$, 'bloqueado');

SELECT pg_temp.t('perfis', 'Nome comum com acento continua permitido ("Adriana Mônica")', '00000000-0000-4000-a000-00000000000a',
  $q$UPDATE profiles SET name = 'Adriana Mônica' WHERE id = '00000000-0000-4000-a000-00000000000a'$q$,
  $c$SELECT name = 'Adriana Mônica' FROM profiles WHERE id = '00000000-0000-4000-a000-00000000000a'$c$, 'permitido');

-- T-05: cancelar estadia que já começou/terminou (apaga histórico e contador do anfitrião).
SELECT pg_temp.t('reservas', 'Hóspede cancela estadia já concluída', '00000000-0000-4000-a000-00000000000a',
  $q$UPDATE bookings SET status = 'cancelada' WHERE id = '00000000-0000-4000-a000-0000000000b2'$q$,
  $c$SELECT status = 'cancelada' FROM bookings WHERE id = '00000000-0000-4000-a000-0000000000b2'$c$, 'bloqueado');

-- T-06: várias conversas de "suporte" com o mesmo admin (spam na caixa do suporte).
SELECT pg_temp.t('mensagens', 'Abrir 2ª conversa de suporte com o mesmo admin', '00000000-0000-4000-a000-00000000000c',
  $q$INSERT INTO conversations (property_id, guest_id, host_id) VALUES (NULL, '00000000-0000-4000-a000-00000000000c', '00000000-0000-4000-a000-00000000000d'), (NULL, '00000000-0000-4000-a000-00000000000c', '00000000-0000-4000-a000-00000000000d')$q$,
  $c$SELECT (SELECT count(*) FROM conversations WHERE guest_id = '00000000-0000-4000-a000-00000000000c' AND property_id IS NULL) > 1$c$, 'bloqueado');

SELECT pg_temp.t('mensagens', 'Abrir a 1ª conversa de suporte (uso normal)', '00000000-0000-4000-a000-00000000000c',
  $q$INSERT INTO conversations (property_id, guest_id, host_id) VALUES (NULL, '00000000-0000-4000-a000-00000000000c', '00000000-0000-4000-a000-00000000000d')$q$,
  $c$SELECT EXISTS (SELECT 1 FROM conversations WHERE guest_id = '00000000-0000-4000-a000-00000000000c' AND property_id IS NULL)$c$, 'permitido');

-- ── Limpeza ─────────────────────────────────────────────────
SELECT set_config('role', 'none', false);
SELECT set_config('request.jwt.claims', '', false);
DELETE FROM storage.objects WHERE name LIKE '00000000-0000-4000-a000-%';
DELETE FROM auth.users WHERE id::text LIKE '00000000-0000-4000-a000-%';

-- ── Resultado ───────────────────────────────────────────────
SELECT n AS "#", area, teste, esperado, obtido, ok, detalhe
FROM _resultado
ORDER BY ok, n;
