-- ============================================================
-- RESERVAGO — Seed de dados de desenvolvimento
-- ============================================================
-- Este arquivo NÃO foi rodado contra o banco. Copie o conteúdo pro SQL
-- Editor do Supabase e rode manualmente, com o schema.sql (+ migração 001)
-- já aplicados.
--
-- O que este arquivo cria:
--   1. 3 perfis de anfitrião fictícios (via auth.users, pra respeitar a FK
--      profiles.id -> auth.users.id e a trigger handle_new_user)
--   2. As 8 propriedades hoje hardcoded em context/ListingContext.tsx,
--      já com status 'ativo' (senão não aparecem em propertyService.getProperties(),
--      que filtra por 'ativo' por padrão)
--   3. Algumas reviews de exemplo
--
-- Sobre o passo 1: inserir direto em auth.users é o jeito padrão de seedar
-- usuários de teste no SQL Editor (a UI do Supabase não tem "criar usuário
-- em lote"). A trigger on_auth_user_created (schema.sql) dispara sozinha e
-- já cria a linha em profiles com name/email vindos de raw_user_meta_data -
-- só precisamos de um UPDATE depois pra virar 'anfitriao' e completar bio/
-- telefone/interesses. Se esse INSERT em auth.users der erro na sua versão
-- do Supabase (o schema interno pode variar), a alternativa é criar 3
-- contas de verdade pelo login Google e trocar os e-mails abaixo pelos
-- e-mails reais antes de rodar o resto do arquivo.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 1. Anfitriões fictícios ─────────────────────────────────
-- UUIDs fixos e legíveis só pra facilitar reler este arquivo depois.
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin,
  confirmation_token, recovery_token
) VALUES
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001',
   'authenticated', 'authenticated', 'maria.anfitria.seed@reservago.com',
   crypt('Seed123!', gen_salt('bf')), NOW(), NOW(), NOW(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Maria Andrade"}',
   FALSE, '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000002',
   'authenticated', 'authenticated', 'joao.anfitriao.seed@reservago.com',
   crypt('Seed123!', gen_salt('bf')), NOW(), NOW(), NOW(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"João Ferreira"}',
   FALSE, '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000003',
   'authenticated', 'authenticated', 'clara.anfitria.seed@reservago.com',
   crypt('Seed123!', gen_salt('bf')), NOW(), NOW(), NOW(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Clara Nogueira"}',
   FALSE, '', '')
ON CONFLICT (id) DO NOTHING;

-- handle_new_user() já criou as linhas em profiles com role='hospede'
-- (default da coluna) - agora completamos pra anfitrião.
UPDATE profiles SET role = 'anfitriao', bio = 'Anfitriã de cabanas no litoral alagoano.', interests = ARRAY['Praia','Hospitalidade']
  WHERE id = 'a1000000-0000-0000-0000-000000000001';
UPDATE profiles SET role = 'anfitriao', bio = 'Cabanas de montanha há 5 anos.', interests = ARRAY['Montanha','Trilhas']
  WHERE id = 'a1000000-0000-0000-0000-000000000002';
UPDATE profiles SET role = 'anfitriao', bio = 'Cachoeiras e trilhas particulares no Centro-Oeste.', interests = ARRAY['Cachoeira','Ecoturismo']
  WHERE id = 'a1000000-0000-0000-0000-000000000003';

-- ── 2. Propriedades (as 8 de context/ListingContext.tsx) ────
-- owner_id em round-robin entre os 3 anfitriões acima.
INSERT INTO properties
  (owner_id, title, description, location, price, isolation_level, category, sub_category, images, amenities, status)
VALUES
  ('a1000000-0000-0000-0000-000000000001', 'Vila dos Corais',
   'Design moderno com piscinas naturais.', 'São Miguel dos Milagres, AL', 880, 'extremo',
   'Praia Privativa', 'Populares',
   ARRAY['https://images.unsplash.com/photo-1537956965359-7573183d1f57?w=800&q=80'],
   ARRAY['Wi-Fi','Piscina','Ar-condicionado'], 'ativo'),

  ('a1000000-0000-0000-0000-000000000002', 'Casa de Vidro Oceânica',
   'Totalmente privativa com acesso ao mar.', 'Ilhabela, SP', 950, 'extremo',
   'Praia Privativa', 'Sul',
   ARRAY['https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?w=800&q=80'],
   ARRAY['Wi-Fi','Vista para o mar','Cozinha completa'], 'ativo'),

  ('a1000000-0000-0000-0000-000000000003', 'Bangalô Areia Branca',
   'Pé na areia com serviço exclusivo.', 'Trancoso, BA', 1200, 'extremo',
   'Praia Privativa', 'Nordeste',
   ARRAY['https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800&q=80'],
   ARRAY['Wi-Fi','Café da manhã incluso','Piscina'], 'ativo'),

  ('a1000000-0000-0000-0000-000000000001', 'Cabana do Lago Azul',
   'Um refúgio tranquilo à beira do lago.', 'Campos do Jordão, SP', 450, 'isolado',
   'Campo', 'Populares',
   ARRAY['https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80'],
   ARRAY['Lareira','Wi-Fi','Estacionamento'], 'ativo'),

  ('a1000000-0000-0000-0000-000000000002', 'Refúgio da Montanha',
   'Luxo com som de queda d''água.', 'Monte Verde, MG', 520, 'extremo',
   'Campo', 'Montanhas',
   ARRAY['https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&q=80'],
   ARRAY['Lareira','Banheira de hidromassagem','Wi-Fi'], 'ativo'),

  ('a1000000-0000-0000-0000-000000000003', 'Chalé Nascer do Sol',
   'Vista privilegiada da serra.', 'Urubici, SC', 380, 'semi',
   'Campo', 'Planícies',
   ARRAY['https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=800&q=80'],
   ARRAY['Wi-Fi','Estacionamento'], 'ativo'),

  ('a1000000-0000-0000-0000-000000000001', 'A-Frame Forest House',
   'Cabana estilo A-frame com lareira.', 'Gramado, RS', 550, 'isolado',
   'Campo', 'Montanhas',
   ARRAY['https://images.unsplash.com/photo-1510798831971-661eb04b3739?w=800&q=80'],
   ARRAY['Lareira','Wi-Fi','Churrasqueira'], 'ativo'),

  ('a1000000-0000-0000-0000-000000000002', 'Eco-Cabana das Águas',
   'Trilha privativa para cachoeira.', 'Pirenópolis, GO', 420, 'extremo',
   'Cachoeira', 'Centro-Oeste',
   ARRAY['https://images.unsplash.com/photo-1532274402911-5a369e4c4bb5?w=800&q=80'],
   ARRAY['Trilha privativa','Wi-Fi','Churrasqueira'], 'ativo');

-- ── 3. Reviews de exemplo ─────────────────────────────────────
-- booking_id fica NULL (não estamos seedando reservas) - o UNIQUE(booking_id,
-- author_id) não é violado porque NULL nunca é igual a NULL no Postgres.
-- Autor é sempre um anfitrião DIFERENTE do dono, só pra ter dado de exemplo
-- sem precisar seedar perfis de hóspede (não foi pedido nesta tarefa).
-- reviews_rating_trigger recalcula properties.rating/reviews_count sozinho.
INSERT INTO reviews (property_id, author_id, rating, comment)
SELECT id, 'a1000000-0000-0000-0000-000000000002', 5, 'Lugar incrível, isolamento de verdade e muito limpo.'
FROM properties WHERE title = 'Vila dos Corais';

INSERT INTO reviews (property_id, author_id, rating, comment)
SELECT id, 'a1000000-0000-0000-0000-000000000003', 4, 'Vista maravilhosa, só o Wi-Fi que oscilou um pouco.'
FROM properties WHERE title = 'Casa de Vidro Oceânica';

INSERT INTO reviews (property_id, author_id, rating, comment)
SELECT id, 'a1000000-0000-0000-0000-000000000001', 5, 'Atendimento impecável, voltaria sem pensar duas vezes.'
FROM properties WHERE title = 'Bangalô Areia Branca';

INSERT INTO reviews (property_id, author_id, rating, comment)
SELECT id, 'a1000000-0000-0000-0000-000000000003', 5, 'Lago lindo, lugar super tranquilo pra desconectar.'
FROM properties WHERE title = 'Cabana do Lago Azul';

INSERT INTO reviews (property_id, author_id, rating, comment)
SELECT id, 'a1000000-0000-0000-0000-000000000001', 4, 'Trilha até a cachoeira vale muito a pena.'
FROM properties WHERE title = 'Eco-Cabana das Águas';

-- ============================================================
-- Fim do seed. Confira depois:
--   SELECT title, status, rating, reviews_count FROM properties ORDER BY title;
-- ============================================================
