-- ============================================================
-- ReservaGO: DADOS DE DEMONSTRAÇÃO (cabanas, hóspedes e avaliações fictícios)
-- ============================================================
-- Cria 18 cabanas, 14 hóspedes de demonstração e 70 avaliações (1 a 5 estrelas, com comentário).
-- Tudo inventado: nomes de cabanas e de pessoas são fictícios; só as cidades são reais.
-- As fotos vêm do Unsplash (licença livre para uso, sem exigir crédito).
--
-- COMO USAR (SQL Editor do Supabase):
--   1. Esvazie o editor, cole este arquivo inteiro e clique em Run.
--   2. Por padrão as cabanas ficam na conta cujo nome começa com "Deusmair"
--      (anfitrião preferido; senão admin). Para usar outra conta, preencha
--      v_owner_email logo abaixo com o e-mail dela.
--   3. Idempotente: rodar de novo não duplica nada.
--   4. Para REMOVER tudo depois: rode supabase/demo/cleanup_demo.sql.
--
-- Não mexe em nenhum dado que não seja de demonstração: tudo o que cria usa
-- ids começados por "de000000-" e e-mails @demo.reservago.invalid, e a limpeza
-- apaga só isso.
-- ============================================================

DO $do$
DECLARE
  -- Preencha para escolher o dono das cabanas pelo e-mail (deixe NULL para o padrão).
  v_owner_email TEXT := NULL;
  -- Aviso no fim de cada descrição. Troque por '' para não mostrar.
  v_nota  TEXT := E'\n\nℹ️ Anúncio de demonstração do projeto ReservaGO (TCC).';
  v_owner UUID;
  v_start TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF v_owner_email IS NOT NULL THEN
    SELECT id INTO v_owner FROM public.profiles
     WHERE lower(email) = lower(v_owner_email) AND deleted_at IS NULL;
  ELSE
    SELECT id INTO v_owner FROM public.profiles
     WHERE role IN ('anfitriao', 'admin') AND deleted_at IS NULL AND name ILIKE 'Deusmair%'
     ORDER BY (role = 'anfitriao') DESC, created_at
     LIMIT 1;
  END IF;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Não achei a conta dona das cabanas. Preencha v_owner_email com o e-mail de um anfitrião ou admin.';
  END IF;

  -- ── 1. Hóspedes de demonstração (sem senha utilizável: ninguém consegue logar) ──
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, is_super_admin, confirmation_token, recovery_token
  ) VALUES
  ('00000000-0000-0000-0000-000000000000', 'de000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'demo.camila.ribeiro@demo.reservago.invalid', md5(gen_random_uuid()::text), NOW(), NOW() - INTERVAL '12 months', NOW(),
   '{"provider":"demo","providers":["demo"]}'::jsonb, '{"full_name":"Camila Ribeiro","avatar_url":"https://ui-avatars.com/api/?name=Camila%20Ribeiro&size=128&background=2D5A27&color=ffffff&bold=true&format=png"}'::jsonb, FALSE, '', ''),
  ('00000000-0000-0000-0000-000000000000', 'de000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'demo.rafael.monteiro@demo.reservago.invalid', md5(gen_random_uuid()::text), NOW(), NOW() - INTERVAL '11 months', NOW(),
   '{"provider":"demo","providers":["demo"]}'::jsonb, '{"full_name":"Rafael Monteiro","avatar_url":"https://ui-avatars.com/api/?name=Rafael%20Monteiro&size=128&background=1F6F8B&color=ffffff&bold=true&format=png"}'::jsonb, FALSE, '', ''),
  ('00000000-0000-0000-0000-000000000000', 'de000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'demo.beatriz.albuquerque@demo.reservago.invalid', md5(gen_random_uuid()::text), NOW(), NOW() - INTERVAL '10 months', NOW(),
   '{"provider":"demo","providers":["demo"]}'::jsonb, '{"full_name":"Beatriz Albuquerque","avatar_url":"https://ui-avatars.com/api/?name=Beatriz%20Albuquerque&size=128&background=8E5A2B&color=ffffff&bold=true&format=png"}'::jsonb, FALSE, '', ''),
  ('00000000-0000-0000-0000-000000000000', 'de000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'demo.thiago.nascimento@demo.reservago.invalid', md5(gen_random_uuid()::text), NOW(), NOW() - INTERVAL '9 months', NOW(),
   '{"provider":"demo","providers":["demo"]}'::jsonb, '{"full_name":"Thiago Nascimento","avatar_url":"https://ui-avatars.com/api/?name=Thiago%20Nascimento&size=128&background=6B4C9A&color=ffffff&bold=true&format=png"}'::jsonb, FALSE, '', ''),
  ('00000000-0000-0000-0000-000000000000', 'de000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'demo.luciana.paiva@demo.reservago.invalid', md5(gen_random_uuid()::text), NOW(), NOW() - INTERVAL '8 months', NOW(),
   '{"provider":"demo","providers":["demo"]}'::jsonb, '{"full_name":"Luciana Paiva","avatar_url":"https://ui-avatars.com/api/?name=Luciana%20Paiva&size=128&background=B4533C&color=ffffff&bold=true&format=png"}'::jsonb, FALSE, '', ''),
  ('00000000-0000-0000-0000-000000000000', 'de000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'demo.gustavo.teixeira@demo.reservago.invalid', md5(gen_random_uuid()::text), NOW(), NOW() - INTERVAL '7 months', NOW(),
   '{"provider":"demo","providers":["demo"]}'::jsonb, '{"full_name":"Gustavo Teixeira","avatar_url":"https://ui-avatars.com/api/?name=Gustavo%20Teixeira&size=128&background=2F7F6F&color=ffffff&bold=true&format=png"}'::jsonb, FALSE, '', ''),
  ('00000000-0000-0000-0000-000000000000', 'de000000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'demo.fernanda.castilho@demo.reservago.invalid', md5(gen_random_uuid()::text), NOW(), NOW() - INTERVAL '6 months', NOW(),
   '{"provider":"demo","providers":["demo"]}'::jsonb, '{"full_name":"Fernanda Castilho","avatar_url":"https://ui-avatars.com/api/?name=Fernanda%20Castilho&size=128&background=2D5A27&color=ffffff&bold=true&format=png"}'::jsonb, FALSE, '', ''),
  ('00000000-0000-0000-0000-000000000000', 'de000000-0000-4000-8000-000000000008', 'authenticated', 'authenticated', 'demo.bruno.vasconcelos@demo.reservago.invalid', md5(gen_random_uuid()::text), NOW(), NOW() - INTERVAL '5 months', NOW(),
   '{"provider":"demo","providers":["demo"]}'::jsonb, '{"full_name":"Bruno Vasconcelos","avatar_url":"https://ui-avatars.com/api/?name=Bruno%20Vasconcelos&size=128&background=1F6F8B&color=ffffff&bold=true&format=png"}'::jsonb, FALSE, '', ''),
  ('00000000-0000-0000-0000-000000000000', 'de000000-0000-4000-8000-000000000009', 'authenticated', 'authenticated', 'demo.mariana.siqueira@demo.reservago.invalid', md5(gen_random_uuid()::text), NOW(), NOW() - INTERVAL '4 months', NOW(),
   '{"provider":"demo","providers":["demo"]}'::jsonb, '{"full_name":"Mariana Siqueira","avatar_url":"https://ui-avatars.com/api/?name=Mariana%20Siqueira&size=128&background=8E5A2B&color=ffffff&bold=true&format=png"}'::jsonb, FALSE, '', ''),
  ('00000000-0000-0000-0000-000000000000', 'de000000-0000-4000-8000-000000000010', 'authenticated', 'authenticated', 'demo.eduardo.barros@demo.reservago.invalid', md5(gen_random_uuid()::text), NOW(), NOW() - INTERVAL '12 months', NOW(),
   '{"provider":"demo","providers":["demo"]}'::jsonb, '{"full_name":"Eduardo Barros","avatar_url":"https://ui-avatars.com/api/?name=Eduardo%20Barros&size=128&background=6B4C9A&color=ffffff&bold=true&format=png"}'::jsonb, FALSE, '', ''),
  ('00000000-0000-0000-0000-000000000000', 'de000000-0000-4000-8000-000000000011', 'authenticated', 'authenticated', 'demo.patricia.lemos@demo.reservago.invalid', md5(gen_random_uuid()::text), NOW(), NOW() - INTERVAL '11 months', NOW(),
   '{"provider":"demo","providers":["demo"]}'::jsonb, '{"full_name":"Patrícia Lemos","avatar_url":"https://ui-avatars.com/api/?name=Patr%C3%ADcia%20Lemos&size=128&background=B4533C&color=ffffff&bold=true&format=png"}'::jsonb, FALSE, '', ''),
  ('00000000-0000-0000-0000-000000000000', 'de000000-0000-4000-8000-000000000012', 'authenticated', 'authenticated', 'demo.rodrigo.furtado@demo.reservago.invalid', md5(gen_random_uuid()::text), NOW(), NOW() - INTERVAL '10 months', NOW(),
   '{"provider":"demo","providers":["demo"]}'::jsonb, '{"full_name":"Rodrigo Furtado","avatar_url":"https://ui-avatars.com/api/?name=Rodrigo%20Furtado&size=128&background=2F7F6F&color=ffffff&bold=true&format=png"}'::jsonb, FALSE, '', ''),
  ('00000000-0000-0000-0000-000000000000', 'de000000-0000-4000-8000-000000000013', 'authenticated', 'authenticated', 'demo.juliana.medeiros@demo.reservago.invalid', md5(gen_random_uuid()::text), NOW(), NOW() - INTERVAL '9 months', NOW(),
   '{"provider":"demo","providers":["demo"]}'::jsonb, '{"full_name":"Juliana Medeiros","avatar_url":"https://ui-avatars.com/api/?name=Juliana%20Medeiros&size=128&background=2D5A27&color=ffffff&bold=true&format=png"}'::jsonb, FALSE, '', ''),
  ('00000000-0000-0000-0000-000000000000', 'de000000-0000-4000-8000-000000000014', 'authenticated', 'authenticated', 'demo.andre.cavalcanti@demo.reservago.invalid', md5(gen_random_uuid()::text), NOW(), NOW() - INTERVAL '8 months', NOW(),
   '{"provider":"demo","providers":["demo"]}'::jsonb, '{"full_name":"André Cavalcanti","avatar_url":"https://ui-avatars.com/api/?name=Andr%C3%A9%20Cavalcanti&size=128&background=1F6F8B&color=ffffff&bold=true&format=png"}'::jsonb, FALSE, '', '')
  ON CONFLICT (id) DO NOTHING;

  -- Campos de token que, se ficarem NULL, podem quebrar a listagem em Authentication > Users.
  -- Cada UPDATE é protegido: se a coluna não existir nesta versão do Supabase, segue em frente.
  BEGIN UPDATE auth.users SET email_change_token_new = '' WHERE id::text LIKE 'de000000-%' AND email_change_token_new IS NULL; EXCEPTION WHEN undefined_column THEN NULL; END;
  BEGIN UPDATE auth.users SET email_change = '' WHERE id::text LIKE 'de000000-%' AND email_change IS NULL; EXCEPTION WHEN undefined_column THEN NULL; END;
  BEGIN UPDATE auth.users SET email_change_token_current = '' WHERE id::text LIKE 'de000000-%' AND email_change_token_current IS NULL; EXCEPTION WHEN undefined_column THEN NULL; END;
  BEGIN UPDATE auth.users SET phone_change = '' WHERE id::text LIKE 'de000000-%' AND phone_change IS NULL; EXCEPTION WHEN undefined_column THEN NULL; END;
  BEGIN UPDATE auth.users SET phone_change_token = '' WHERE id::text LIKE 'de000000-%' AND phone_change_token IS NULL; EXCEPTION WHEN undefined_column THEN NULL; END;
  BEGIN UPDATE auth.users SET reauthentication_token = '' WHERE id::text LIKE 'de000000-%' AND reauthentication_token IS NULL; EXCEPTION WHEN undefined_column THEN NULL; END;

  -- ── 2. Cabanas (já aprovadas) ──
  INSERT INTO public.properties
    (id, owner_id, title, description, location, price, isolation_level, category, sub_category,
     images, amenities, status, featured, bookings_count, created_at)
  VALUES
  ('de000000-0000-4000-9000-000000000001', v_owner, 'Vila dos Coqueiros', $t$Conjunto de bangalôs de madeira e palha a 30 metros da praia, cercado por coqueiral e com uma piscina natural formada pela maré baixa a poucos passos da porta. É o tipo de lugar para desligar do mundo: o som é só do mar e do vento nas palmeiras.

📍 Como chegar
A 4 km do centro de São Miguel dos Milagres, pela AL-101 (Rota Ecológica dos Milagres). Os últimos 600 metros são de estrada de areia batida, que carros baixos fazem com cuidado. Aeroporto de Maceió a 1h30 de carro. Enviamos a localização no WhatsApp depois da reserva.

🛏️ A estadia
• Capacidade: até 4 hóspedes
• 2 quartos · 1 cama de casal e 2 de solteiro
• 1 banheiro
• Check-in a partir das 14h · check-out até as 11h

✅ O que tem
• Wi-Fi (satélite, funciona bem na varanda)
• Piscina compartilhada com deck
• Ar-condicionado nos quartos
• Cozinha com fogão a gás, geladeira e utensílios
• Chuveiro externo com água morna
• Roupa de cama e toalhas
• Redes na varanda
• Café da manhã regional servido no bangalô

❌ O que não tem
• TV (de propósito)
• Hidromassagem
• Serviço de lavanderia
• Estacionamento coberto

📋 Regras da casa
• Não são permitidos eventos nem festas
• Silêncio depois das 22h
• Pets não são aceitos
• Proibido fumar dentro do bangalô$t$ || v_nota, 'São Miguel dos Milagres, AL', 890, 'extremo', 'Praia Privativa', 'Populares',
   ARRAY['https://images.unsplash.com/photo-1771526087650-6c755f4e5639?auto=format&fit=crop&w=900&q=75', 'https://images.unsplash.com/photo-1710563138874-4bac91c14e51?auto=format&fit=crop&w=900&q=75', 'https://images.unsplash.com/photo-1645378975326-7339786fdec3?auto=format&fit=crop&w=900&q=75'],
   ARRAY['Wi-Fi', 'Piscina', 'Pé na areia', 'Café da manhã incluso', 'Ar-condicionado', 'Chuveiro externo', 'Rede na varanda', 'Cozinha equipada'],
   'ativo', TRUE, 17, NOW() - INTERVAL '9 months' - INTERVAL '0 days'),
  ('de000000-0000-4000-9000-000000000002', v_owner, 'Eco-Bangalô Laguna Azul', $t$Bangalô de madeira certificada em meio à Mata Atlântica, de frente para uma laguna de águas calmas a 8 minutos a pé da praia dos Nativos. O projeto usa energia solar e reaproveita a água da chuva, sem abrir mão do conforto.

📍 Como chegar
A 6 km do Quadrado de Trancoso, pela estrada Trancoso–Caraíva, entrada sinalizada à direita. Estrada de terra batida por 1,2 km, boa para qualquer carro quando não chove forte. Aeroporto de Porto Seguro a 50 minutos.

🛏️ A estadia
• Capacidade: até 5 hóspedes
• 2 quartos · 1 cama de casal, 1 beliche e 1 sofá-cama
• 2 banheiros
• Check-in a partir das 14h · check-out até as 11h

✅ O que tem
• Wi-Fi em todo o bangalô
• Piscina com borda infinita para a laguna
• Ar-condicionado e ventilador de teto
• Cozinha completa com fogão, forno e cafeteira
• Churrasqueira e mesa externa
• Chuveiro com água quente (aquecimento solar)
• Roupa de cama, toalhas e kit de banho
• Vaga para 2 carros

❌ O que não tem
• Hidromassagem
• Serviço de praia (cadeiras e guarda-sol são por conta do hóspede)
• Restaurante no local
• TV a cabo

📋 Regras da casa
• Aceitamos 1 pet de pequeno porte, avise na reserva
• Sem festas ou som alto
• Check-out até 11h
• Use apenas repelente e protetor biodegradáveis na laguna$t$ || v_nota, 'Trancoso, BA', 1180, 'isolado', 'Praia Privativa', 'Populares',
   ARRAY['https://images.unsplash.com/photo-1665616728379-d0c1d9ec63d5?auto=format&fit=crop&w=900&q=75', 'https://images.unsplash.com/photo-1662638852986-fdea10dd4f52?auto=format&fit=crop&w=900&q=75', 'https://images.unsplash.com/photo-1766937754720-4d30de201fd1?auto=format&fit=crop&w=900&q=75'],
   ARRAY['Wi-Fi', 'Piscina', 'Ar-condicionado', 'Café da manhã incluso', 'Aceita pets', 'Estacionamento', 'Churrasqueira', 'Vista panorâmica'],
   'ativo', TRUE, 20, NOW() - INTERVAL '8 months' - INTERVAL '3 days'),
  ('de000000-0000-4000-9000-000000000003', v_owner, 'Bangalô Maré Mansa', $t$Bangalô com telhado de palha numa vila de pescadores da Península de Maraú, a 100 metros da praia e perto dos passeios de piscinas naturais. Simples, charmoso e com aquele ritmo devagar que só o Nordeste tem.

📍 Como chegar
Na vila de Barra Grande, a 5 minutos a pé do centrinho e do píer da balsa. Chegada por Itacaré: 1h de carro até Camamu ou travessia de lancha. Passamos o roteiro completo depois da reserva.

🛏️ A estadia
• Capacidade: até 3 hóspedes
• 1 quarto · 1 cama de casal e 1 de solteiro
• 1 banheiro
• Check-in a partir das 14h · check-out até as 11h

✅ O que tem
• Wi-Fi
• Ventilador de teto e mosquiteiros
• Mini cozinha com frigobar, fogareiro e utensílios
• Varanda com redes
• Chuveiro externo para tirar a areia
• Café da manhã com frutas e tapioca
• Toalhas de banho

❌ O que não tem
• Ar-condicionado
• Piscina
• TV
• Cozinha com forno
• Elevador ou acesso para cadeirantes

📋 Regras da casa
• Pets não são aceitos
• Silêncio depois das 22h
• Check-in a partir das 14h$t$ || v_nota, 'Barra Grande, BA', 640, 'semi', 'Praia Privativa', 'Nordeste',
   ARRAY['https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?auto=format&fit=crop&w=900&q=75', 'https://images.unsplash.com/photo-1763770523213-8a2bce70579c?auto=format&fit=crop&w=900&q=75', 'https://images.unsplash.com/photo-1528913775512-624d24b27b96?auto=format&fit=crop&w=900&q=75'],
   ARRAY['Wi-Fi', 'Ventilador de teto', 'Café da manhã incluso', 'Rede na varanda', 'Cozinha equipada', 'Estacionamento', 'Chuveiro externo'],
   'ativo', FALSE, 11, NOW() - INTERVAL '7 months' - INTERVAL '6 days'),
  ('de000000-0000-4000-9000-000000000004', v_owner, 'Casa Duna Branca', $t$Casa de dois andares com varanda ampla de frente para o mar, no meio das dunas e falésias da Costa Leste do Ceará. Ideal para família ou grupo de amigos que quer praia vazia e vento constante para quem gosta de kitesurf.

📍 Como chegar
A 12 km do centro de Icapuí, pela CE-261, depois estrada de piçarra por 2 km até a duna. Fortaleza fica a 2h30 de carro. A casa fica ao lado de um ponto de apoio para kitesurf.

🛏️ A estadia
• Capacidade: até 8 hóspedes
• 3 quartos · 2 camas de casal, 2 de solteiro e 1 sofá-cama
• 2 banheiros
• Check-in a partir das 14h · check-out até as 11h

✅ O que tem
• Wi-Fi
• Ar-condicionado em 2 quartos
• Varanda coberta com redes e mesa para 8 pessoas
• Cozinha completa com forno e liquidificador
• Churrasqueira
• Chuveirão com água morna
• Estacionamento para 3 carros
• Roupa de cama e toalhas

❌ O que não tem
• Piscina
• Hidromassagem
• Empregada ou serviço de limpeza diário
• Mercado próximo (o mais perto fica a 12 km, faça compras antes)

📋 Regras da casa
• Aceitamos pets, com taxa única de limpeza
• Limite de 8 pessoas
• Sem festas
• Silêncio depois das 23h$t$ || v_nota, 'Icapuí, CE', 760, 'isolado', 'Praia Privativa', 'Nordeste',
   ARRAY['https://images.unsplash.com/photo-1775053383038-5e248d3182a7?auto=format&fit=crop&w=900&q=75', 'https://images.unsplash.com/photo-1605549339992-83721992836e?auto=format&fit=crop&w=900&q=75', 'https://images.unsplash.com/photo-1721369483526-62f48a00b949?auto=format&fit=crop&w=900&q=75'],
   ARRAY['Wi-Fi', 'Ar-condicionado', 'Varanda de frente para o mar', 'Cozinha equipada', 'Churrasqueira', 'Estacionamento', 'Aceita pets'],
   'ativo', FALSE, 14, NOW() - INTERVAL '6 months' - INTERVAL '9 days'),
  ('de000000-0000-4000-9000-000000000005', v_owner, 'Casa de Vidro Praia do Rosa', $t$Casa contemporânea com paredes de vidro e deck suspenso sobre a Praia do Rosa, uma das mais bonitas do sul do país. Da sala dá para ver baleias-francas passando entre julho e novembro.

📍 Como chegar
A 7 km do centro da Praia do Rosa, pela SC-434, e o último trecho é calçado. Florianópolis fica a 1h20 de carro e o aeroporto de Jaguaruna a 1h10. Enviamos o mapa e o código da portaria depois da reserva.

🛏️ A estadia
• Capacidade: até 6 hóspedes
• 3 quartos · 2 camas de casal e 2 de solteiro
• 3 banheiros
• Check-in a partir das 14h · check-out até as 11h

✅ O que tem
• Wi-Fi de fibra
• Hidromassagem no deck (aquecida)
• Lareira a gás na sala
• Ar-condicionado quente e frio
• Cozinha gourmet com fogão de 5 bocas, forno e cafeteira
• Churrasqueira no deck
• Chuveiros com água quente central
• Roupa de cama, toalhas e secador de cabelo
• Garagem para 2 carros

❌ O que não tem
• Piscina
• Acesso direto à areia (são 150 m por uma escada)
• Pets
• Serviço de café da manhã

📋 Regras da casa
• Pets não são aceitos
• Sem festas ou eventos
• Silêncio depois das 22h
• Cuidado com crianças pequenas no deck$t$ || v_nota, 'Imbituba, SC', 1050, 'semi', 'Praia Privativa', 'Sul',
   ARRAY['https://images.unsplash.com/photo-1615571022219-eb45cf7faa9d?auto=format&fit=crop&w=900&q=75', 'https://images.unsplash.com/photo-1537956965359-7573183d1f57?auto=format&fit=crop&w=900&q=75'],
   ARRAY['Wi-Fi', 'Vista panorâmica', 'Lareira', 'Cozinha equipada', 'Hidromassagem', 'Ar-condicionado', 'Estacionamento', 'Churrasqueira'],
   'ativo', TRUE, 17, NOW() - INTERVAL '5 months' - INTERVAL '12 days'),
  ('de000000-0000-4000-9000-000000000006', v_owner, 'Sobrado Pé na Areia', $t$Sobrado de três pavimentos a 40 passos da praia de Mariscal, com varandas voltadas para o mar e área gourmet. Perto de restaurantes e mercados, para quem prefere praia com infraestrutura.

📍 Como chegar
Na Rua das Garças, Mariscal, a 5 minutos do centro de Bombinhas e a 1h30 de Balneário Camboriú. Ruas asfaltadas e estacionamento privativo.

🛏️ A estadia
• Capacidade: até 8 hóspedes
• 4 quartos · 3 camas de casal e 2 de solteiro
• 3 banheiros
• Check-in a partir das 14h · check-out até as 11h

✅ O que tem
• Wi-Fi
• Ar-condicionado nos 4 quartos
• Varandas com vista para o mar
• Cozinha completa e área gourmet com churrasqueira
• Máquina de lavar roupa
• Estacionamento para 2 carros
• Roupa de cama e toalhas

❌ O que não tem
• Piscina
• Hidromassagem
• Lareira
• Silêncio absoluto (fica em área movimentada na alta temporada)

📋 Regras da casa
• Pets não são aceitos
• Limite de 8 pessoas
• Silêncio depois das 22h
• Máximo de 2 carros$t$ || v_nota, 'Bombinhas, SC', 720, 'urbano', 'Praia Privativa', 'Sul',
   ARRAY['https://images.unsplash.com/photo-1775183712114-b6862e0c2edf?auto=format&fit=crop&w=900&q=75', 'https://images.unsplash.com/photo-1785962019598-2c71b10357b9?auto=format&fit=crop&w=900&q=75'],
   ARRAY['Wi-Fi', 'Ar-condicionado', 'Varanda', 'Cozinha equipada', 'Estacionamento', 'Churrasqueira', 'Lavanderia'],
   'ativo', FALSE, 11, NOW() - INTERVAL '4 months' - INTERVAL '15 days'),
  ('de000000-0000-4000-9000-000000000007', v_owner, 'A-Frame Refúgio do Pinhão', $t$Cabana em formato A-frame de madeira e vidro, com janelões triangulares que enchem a sala de luz e vista direta para a mata de araucárias. No deck, um ofurô aquecido a lenha para as noites geladas da Mantiqueira.

📍 Como chegar
A 9 km do centro de Capivari, pela estrada do Horto Florestal, e os últimos 800 m são de terra compactada. De São Paulo são 2h30 de carro, pela Carvalho Pinto e SP-123.

🛏️ A estadia
• Capacidade: até 4 hóspedes
• 1 quarto · 1 cama de casal no mezanino e 1 sofá-cama duplo na sala
• 1 banheiro
• Check-in a partir das 14h · check-out até as 11h

✅ O que tem
• Lareira a lenha (primeira carga de lenha inclusa)
• Ofurô de cedro aquecido a lenha no deck
• Wi-Fi
• Cozinha com fogão, geladeira e cafeteira
• Churrasqueira e fogueira externa
• Aquecedor elétrico
• Cobertores extras, roupa de cama e toalhas

❌ O que não tem
• Ar-condicionado (não precisa, o clima é frio)
• Piscina
• TV
• Quarto separado para crianças (mezanino aberto)

📋 Regras da casa
• Sem festas ou som alto
• Pets não são aceitos
• Cuidado ao acender o ofurô: peça a instrução ao anfitrião
• Proibido fumar$t$ || v_nota, 'Campos do Jordão, SP', 690, 'isolado', 'Campo', 'Populares',
   ARRAY['https://images.unsplash.com/photo-1782226796423-8d72656a332c?auto=format&fit=crop&w=900&q=75', 'https://images.unsplash.com/photo-1761782791727-3994283faa88?auto=format&fit=crop&w=900&q=75', 'https://images.unsplash.com/photo-1668461363398-1fd41bf2ca79?auto=format&fit=crop&w=900&q=75'],
   ARRAY['Lareira', 'Ofurô aquecido a lenha', 'Wi-Fi', 'Churrasqueira', 'Cozinha equipada', 'Aquecedor', 'Estacionamento', 'Vista panorâmica'],
   'ativo', TRUE, 20, NOW() - INTERVAL '10 months' - INTERVAL '18 days'),
  ('de000000-0000-4000-9000-000000000008', v_owner, 'Cabana Lago Sereno', $t$Cabana de madeira à beira de um pequeno lago de truta, com deck para o entardecer e hidromassagem aquecida para duas pessoas. Fica em um sítio fechado de 12 mil metros quadrados, com trilha curta até uma mata de pinus.

📍 Como chegar
A 5 km do centro de Monte Verde, pela estrada de Camanducaia, e o acesso é todo asfaltado até a porteira. De Belo Horizonte são 4h30 de carro e de São Paulo 3h30.

🛏️ A estadia
• Capacidade: até 4 hóspedes
• 1 quarto · 1 cama de casal e 1 sofá-cama
• 1 banheiro
• Check-in a partir das 14h · check-out até as 11h

✅ O que tem
• Hidromassagem aquecida para 2 pessoas
• Lareira a lenha
• Wi-Fi
• Cozinha com fogão, forno e geladeira
• Deck com vista para o lago
• Churrasqueira
• Aquecedor
• Roupa de cama, toalhas e roupão

❌ O que não tem
• Piscina
• Ar-condicionado
• Pesca liberada (o lago é de criação, a pesca é no vizinho)
• Serviço de café da manhã

📋 Regras da casa
• Aceitamos 1 pet, avise na reserva
• Silêncio depois das 22h
• Sem festas$t$ || v_nota, 'Monte Verde, MG', 560, 'semi', 'Campo', 'Populares',
   ARRAY['https://images.unsplash.com/photo-1583878594798-c31409c8ab4a?auto=format&fit=crop&w=900&q=75', 'https://images.unsplash.com/photo-1782846484501-d4b1c5b57953?auto=format&fit=crop&w=900&q=75', 'https://images.unsplash.com/photo-1662150535993-2a8397f99603?auto=format&fit=crop&w=900&q=75'],
   ARRAY['Lareira', 'Hidromassagem', 'Wi-Fi', 'Cozinha equipada', 'Vista para o lago', 'Estacionamento', 'Aceita pets'],
   'ativo', FALSE, 14, NOW() - INTERVAL '8 months' - INTERVAL '1 days'),
  ('de000000-0000-4000-9000-000000000009', v_owner, 'Chalé Névoa da Serra', $t$Chalé em formato de A no alto da serra de Urubici, uma das cidades mais frias do Brasil, com cama no mezanino e janelões para a névoa que sobe do vale pela manhã. Muito procurado por quem quer ver a geada ou, com sorte, neve.

📍 Como chegar
A 14 km do centro de Urubici, pela SC-370, e os últimos 3 km são de estrada de terra em subida. Recomendamos carro com boa altura livre do solo em dias de chuva. Florianópolis fica a 3h de carro.

🛏️ A estadia
• Capacidade: até 4 hóspedes
• 1 quarto · 1 cama de casal no mezanino e 1 sofá-cama na sala
• 1 banheiro
• Check-in a partir das 14h · check-out até as 11h

✅ O que tem
• Lareira a lenha
• Aquecedor elétrico
• Wi-Fi
• Cozinha com fogão a lenha e a gás, geladeira e cafeteira
• Churrasqueira
• Cobertores e edredons extras
• Roupa de cama e toalhas

❌ O que não tem
• Ar-condicionado
• Hidromassagem
• TV
• Sinal de celular estável (só no mirante a 200 m)

📋 Regras da casa
• Sem festas
• Pets não são aceitos
• Cuidado com o fogo da lareira ao sair
• Check-out até 11h$t$ || v_nota, 'Urubici, SC', 520, 'isolado', 'Campo', 'Montanhas',
   ARRAY['https://images.unsplash.com/photo-1770035183754-40166582f83f?auto=format&fit=crop&w=900&q=75', 'https://images.unsplash.com/photo-1727706572437-4fcda0cbd66f?auto=format&fit=crop&w=900&q=75', 'https://images.unsplash.com/photo-1631630259742-c0f0b17c6c10?auto=format&fit=crop&w=900&q=75'],
   ARRAY['Lareira', 'Wi-Fi', 'Cozinha equipada', 'Aquecedor', 'Vista panorâmica', 'Estacionamento', 'Churrasqueira'],
   'ativo', FALSE, 11, NOW() - INTERVAL '7 months' - INTERVAL '4 days'),
  ('de000000-0000-4000-9000-000000000010', v_owner, 'Cabana Pedra do Sol', $t$Cabana de pedra e madeira aos pés da Serra da Mantiqueira, com sala de pé-direito alto, lareira de pedra e hidromassagem no jardim com vista para as montanhas. A 15 minutos das cachoeiras de Maromba.

📍 Como chegar
A 4 km de Maromba, pela estrada de Visconde de Mauá, com trecho final de 400 m de paralelepípedo. Do Rio de Janeiro são 3h30 de carro, pela Dutra e Penedo.

🛏️ A estadia
• Capacidade: até 5 hóspedes
• 2 quartos · 1 cama de casal, 1 beliche e 1 sofá-cama
• 2 banheiros
• Check-in a partir das 14h · check-out até as 11h

✅ O que tem
• Hidromassagem no jardim
• Lareira de pedra (lenha por conta do hóspede)
• Wi-Fi
• Cozinha completa com forno
• Churrasqueira com cobertura
• Aquecedor nos quartos
• Estacionamento para 2 carros
• Roupa de cama e toalhas

❌ O que não tem
• Piscina
• Ar-condicionado
• Lenha inclusa
• Serviço de café da manhã

📋 Regras da casa
• Aceitamos pets de pequeno e médio porte
• Silêncio depois das 22h
• Sem festas$t$ || v_nota, 'Visconde de Mauá, RJ', 610, 'semi', 'Campo', 'Montanhas',
   ARRAY['https://images.unsplash.com/photo-1551648746-d158bcd704e7?auto=format&fit=crop&w=900&q=75', 'https://images.unsplash.com/photo-1696860740793-1bb7bf33cdc1?auto=format&fit=crop&w=900&q=75', 'https://images.unsplash.com/photo-1772040942277-b194d9d0b648?auto=format&fit=crop&w=900&q=75'],
   ARRAY['Lareira', 'Hidromassagem', 'Wi-Fi', 'Cozinha equipada', 'Vista panorâmica', 'Estacionamento', 'Churrasqueira', 'Aceita pets'],
   'ativo', FALSE, 11, NOW() - INTERVAL '6 months' - INTERVAL '7 days'),
  ('de000000-0000-4000-9000-000000000011', v_owner, 'Sítio Alvorada', $t$Casa de campo em um sítio de 2 hectares com pomar, horta e piscina, a poucos minutos do centro histórico de Pirenópolis. Quartos amplos, varanda gostosa e fogão a lenha para quem gosta de cozinhar com calma.

📍 Como chegar
Na GO-225, a 8 km do centro de Pirenópolis, depois de uma estradinha de terra bem conservada por 700 m. De Brasília são 2h30 e de Goiânia 2h.

🛏️ A estadia
• Capacidade: até 6 hóspedes
• 3 quartos · 2 camas de casal e 2 de solteiro
• 2 banheiros
• Check-in a partir das 14h · check-out até as 11h

✅ O que tem
• Piscina com deck e cadeiras
• Ar-condicionado nos quartos
• Wi-Fi
• Cozinha completa e fogão a lenha
• Churrasqueira e forno de pizza
• Pomar com mangas e acerolas (conforme a estação)
• Área para crianças brincarem
• Roupa de cama e toalhas

❌ O que não tem
• Hidromassagem
• Lareira
• TV a cabo
• Serviço de limpeza durante a estadia

📋 Regras da casa
• Aceitamos pets, não podem entrar na piscina
• Limite de 6 pessoas
• Silêncio depois das 23h
• Proibido fogos de artifício$t$ || v_nota, 'Pirenópolis, GO', 430, 'semi', 'Campo', 'Planícies',
   ARRAY['https://images.unsplash.com/photo-1772454697149-4ead43f7a218?auto=format&fit=crop&w=900&q=75', 'https://images.unsplash.com/photo-1761319914911-71b059a655d8?auto=format&fit=crop&w=900&q=75', 'https://images.unsplash.com/photo-1582490841511-81e1363fb48c?auto=format&fit=crop&w=900&q=75'],
   ARRAY['Piscina', 'Wi-Fi', 'Ar-condicionado', 'Churrasqueira', 'Cozinha equipada', 'Aceita pets', 'Estacionamento', 'Fogão a lenha'],
   'ativo', FALSE, 14, NOW() - INTERVAL '6 months' - INTERVAL '10 days'),
  ('de000000-0000-4000-9000-000000000012', v_owner, 'Chalé Campo Aberto', $t$Cabana de troncos em um campo aberto com vista para a Serra do Mar, em Cunha, cidade conhecida pela cerâmica de alta temperatura e pelo clima de montanha. Banheira de imersão no banheiro e lareira na sala.

📍 Como chegar
A 11 km do centro de Cunha, na estrada do bairro Pedra Azul, em trecho de terra bem cuidada. De São Paulo são 3h30 de carro, pela Dutra e Guaratinguetá.

🛏️ A estadia
• Capacidade: até 4 hóspedes
• 1 quarto · 1 cama de casal e 2 de solteiro
• 1 banheiro
• Check-in a partir das 14h · check-out até as 11h

✅ O que tem
• Banheira de imersão com água quente
• Lareira e fogão a lenha
• Wi-Fi
• Cozinha completa
• Estacionamento
• Mesa e cadeiras no gramado
• Roupa de cama, toalhas e cobertores

❌ O que não tem
• Piscina
• Ar-condicionado
• Churrasqueira
• Lenha inclusa
• Sinal de celular fora do mirante

📋 Regras da casa
• Aceitamos pets de pequeno porte
• Sem festas
• Silêncio depois das 22h$t$ || v_nota, 'Cunha, SP', 470, 'isolado', 'Campo', 'Planícies',
   ARRAY['https://images.unsplash.com/photo-1475087542963-13ab5e611954?auto=format&fit=crop&w=900&q=75', 'https://images.unsplash.com/photo-1680703486830-1b5af60635d7?auto=format&fit=crop&w=900&q=75', 'https://images.unsplash.com/photo-1773423386572-4ad451dc6c26?auto=format&fit=crop&w=900&q=75'],
   ARRAY['Lareira', 'Fogão a lenha', 'Wi-Fi', 'Cozinha equipada', 'Estacionamento', 'Aceita pets', 'Banheira de imersão'],
   'ativo', FALSE, 8, NOW() - INTERVAL '5 months' - INTERVAL '13 days'),
  ('de000000-0000-4000-9000-000000000013', v_owner, 'Cabana Bosque Encantado', $t$Cabana A-frame no meio de uma mata de araucárias e pinheiros, a 8 minutos do centro de Gramado. Na sala, janelões em formato triangular; no deck, uma hidromassagem para duas pessoas. Muito procurada na época do Natal Luz.

📍 Como chegar
A 6 km do centro de Gramado, pela estrada da Linha Nova, trecho final em paralelepípedo. Porto Alegre fica a 1h40 de carro.

🛏️ A estadia
• Capacidade: até 2 hóspedes
• 1 quarto · 1 cama de casal king
• 1 banheiro
• Check-in a partir das 14h · check-out até as 11h

✅ O que tem
• Hidromassagem no deck
• Lareira a gás
• Aquecimento central
• Wi-Fi
• Cozinha equipada
• Cama king com roupa de cama premium
• Estacionamento coberto
• Roupão e chinelos

❌ O que não tem
• Capacidade para mais de 2 pessoas
• Piscina
• Pets
• Crianças menores de 12 anos

📋 Regras da casa
• Exclusiva para casais, sem crianças
• Sem festas
• Pets não são aceitos
• Silêncio depois das 22h$t$ || v_nota, 'Gramado, RS', 780, 'semi', 'Campo', 'Populares',
   ARRAY['https://images.unsplash.com/photo-1575403071235-5dcd06cbf169?auto=format&fit=crop&w=900&q=75', 'https://images.unsplash.com/photo-1761782797823-2b555af8a226?auto=format&fit=crop&w=900&q=75'],
   ARRAY['Lareira', 'Wi-Fi', 'Cozinha equipada', 'Aquecimento central', 'Estacionamento', 'Hidromassagem', 'Vista panorâmica'],
   'ativo', FALSE, 11, NOW() - INTERVAL '4 months' - INTERVAL '16 days'),
  ('de000000-0000-4000-9000-000000000014', v_owner, 'Eco-Cabana das Águas', $t$Cabana de madeira dentro de uma reserva particular de cerrado, com trilha privativa de 15 minutos até uma cachoeira de três quedas com poço de águas claras. Aqui o banho é de cachoeira de manhã e a noite é de céu estrelado.

📍 Como chegar
A 24 km do centro de Pirenópolis, pela GO-225 e depois 6 km de estrada de terra, com trechos de cascalho. Recomendamos carro com boa altura livre do solo na época das chuvas (nov–mar). De Brasília são 3h.

🛏️ A estadia
• Capacidade: até 4 hóspedes
• 1 quarto · 1 cama de casal e 2 de solteiro
• 1 banheiro
• Check-in a partir das 14h · check-out até as 11h

✅ O que tem
• Trilha privativa até a cachoeira (15 min, nível fácil)
• Poço natural para banho
• Wi-Fi na varanda
• Fogão a lenha e fogão a gás
• Churrasqueira
• Chuveiro com água quente (aquecimento solar)
• Roupa de cama e toalhas
• Vaga para 2 carros

❌ O que não tem
• Ar-condicionado
• Piscina
• TV
• Energia 24h em dias muito nublados (sistema solar, use com consciência)
• Mercado próximo (compre em Pirenópolis)

📋 Regras da casa
• Aceitamos pets, mas não na trilha da cachoeira
• Sem som alto ou festas
• Não deixe lixo na trilha
• Proibido fogueira fora da área indicada$t$ || v_nota, 'Pirenópolis, GO', 420, 'extremo', 'Cachoeira', 'Populares',
   ARRAY['https://images.unsplash.com/photo-1449158743715-0a90ebb6d2d8?auto=format&fit=crop&w=900&q=75', 'https://images.unsplash.com/photo-1432405972618-c60b0225b8f9?auto=format&fit=crop&w=900&q=75', 'https://images.unsplash.com/photo-1525824236856-8c0a31dfe3be?auto=format&fit=crop&w=900&q=75'],
   ARRAY['Trilha privativa', 'Cachoeira na propriedade', 'Wi-Fi', 'Churrasqueira', 'Fogão a lenha', 'Estacionamento', 'Aceita pets', 'Vista panorâmica'],
   'ativo', TRUE, 20, NOW() - INTERVAL '10 months' - INTERVAL '19 days'),
  ('de000000-0000-4000-9000-000000000015', v_owner, 'Recanto Cachoeira Dourada', $t$Cabana em meio ao cerrado da Chapada dos Veadeiros, com acesso a uma cachoeira de água cor de chá e cascatas em degraus, ótimas para banho. O dono cuida de uma pequena reserva e guia quem quiser conhecer a flora local ao amanhecer.

📍 Como chegar
A 18 km de Alto Paraíso, pela GO-239 em direção a São Jorge, depois 4 km de estrada de terra. Brasília fica a 3h30 e Goiânia a 5h. Em época de chuva, o último trecho pede cuidado.

🛏️ A estadia
• Capacidade: até 4 hóspedes
• 1 quarto · 1 cama de casal e 1 beliche
• 1 banheiro
• Check-in a partir das 14h · check-out até as 11h

✅ O que tem
• Cachoeira e cascatas na propriedade
• Trilha guiada sob pedido (taxa à parte)
• Wi-Fi na área comum
• Fogão a lenha e a gás
• Chuveiro com água quente solar
• Varanda com redes
• Roupa de cama e toalhas

❌ O que não tem
• Ar-condicionado
• Piscina
• Sinal de celular na cabana
• Restaurante (levamos café da manhã sob encomenda)

📋 Regras da casa
• Pets não são aceitos por causa da fauna local
• Não use sabão ou repelente na cachoeira
• Sem som alto
• Respeite o horário de silêncio$t$ || v_nota, 'Alto Paraíso de Goiás, GO', 380, 'extremo', 'Cachoeira', 'Centro-Oeste',
   ARRAY['https://images.unsplash.com/photo-1767711384997-6804f4b54997?auto=format&fit=crop&w=900&q=75', 'https://images.unsplash.com/photo-1482685945432-29a7abf2f466?auto=format&fit=crop&w=900&q=75'],
   ARRAY['Trilha privativa', 'Cachoeira na propriedade', 'Wi-Fi', 'Fogão a lenha', 'Estacionamento', 'Vista panorâmica', 'Cozinha equipada'],
   'ativo', FALSE, 11, NOW() - INTERVAL '8 months' - INTERVAL '2 days'),
  ('de000000-0000-4000-9000-000000000016', v_owner, 'Pousada Vale das Araras', $t$Chalé de madeira em meio ao cerrado da Chapada dos Guimarães, onde as araras-vermelhas cruzam o céu ao amanhecer. Piscina, café da manhã regional e acesso a uma cachoeira com 12 metros de queda.

📍 Como chegar
A 11 km do centro de Chapada dos Guimarães, pela MT-251 em direção ao Parque Nacional, com acesso todo asfaltado. Cuiabá fica a 1h de carro.

🛏️ A estadia
• Capacidade: até 4 hóspedes
• 1 quarto · 1 cama de casal e 2 de solteiro
• 1 banheiro
• Check-in a partir das 14h · check-out até as 11h

✅ O que tem
• Café da manhã regional (tapioca, cuscuz, frutas)
• Piscina com vista para o cânion
• Ar-condicionado
• Wi-Fi
• Cozinha compartilhada para uso à noite
• Churrasqueira
• Roupa de cama e toalhas
• Estacionamento

❌ O que não tem
• Hidromassagem
• Lareira
• Cozinha individual completa
• Pets

📋 Regras da casa
• Pets não são aceitos
• Silêncio depois das 22h
• Acesso à cachoeira de 8h às 17h$t$ || v_nota, 'Chapada dos Guimarães, MT', 340, 'semi', 'Cachoeira', 'Centro-Oeste',
   ARRAY['https://images.unsplash.com/photo-1772955543023-a6e99819e161?auto=format&fit=crop&w=900&q=75', 'https://images.unsplash.com/photo-1523224949444-170258978eef?auto=format&fit=crop&w=900&q=75'],
   ARRAY['Cachoeira na propriedade', 'Piscina', 'Wi-Fi', 'Ar-condicionado', 'Café da manhã incluso', 'Estacionamento', 'Churrasqueira'],
   'ativo', FALSE, 14, NOW() - INTERVAL '7 months' - INTERVAL '5 days'),
  ('de000000-0000-4000-9000-000000000017', v_owner, 'Chalé Cascata do Escorrega', $t$Chalé de dois andares com deck suspenso entre as árvores, na região do Parque Estadual do Ibitipoca. A propriedade tem um riacho com cascata natural e poços para banho, perfeitos para o calor do verão.

📍 Como chegar
A 9 km da vila de Conceição do Ibitipoca, pela estrada para Lima Duarte, com acesso em estrada de terra. Juiz de Fora fica a 1h40 e Belo Horizonte a 4h.

🛏️ A estadia
• Capacidade: até 6 hóspedes
• 2 quartos · 2 camas de casal e 2 de solteiro
• 2 banheiros
• Check-in a partir das 14h · check-out até as 11h

✅ O que tem
• Cascata e poços para banho na propriedade
• Deck suspenso com mesa e redes
• Lareira e fogão a lenha
• Wi-Fi
• Churrasqueira
• Cozinha equipada
• Roupa de cama e toalhas
• Estacionamento para 3 carros

❌ O que não tem
• Ar-condicionado
• Piscina
• TV
• Mercado próximo (vila a 9 km)

📋 Regras da casa
• Sem festas
• Pets não são aceitos
• Silêncio depois das 22h
• Atenção ao deck molhado com crianças$t$ || v_nota, 'Lima Duarte, MG', 390, 'isolado', 'Cachoeira', 'Sudeste',
   ARRAY['https://images.unsplash.com/photo-1595877244574-e90ce41ce089?auto=format&fit=crop&w=900&q=75', 'https://images.unsplash.com/photo-1757440156773-93813caa0f25?auto=format&fit=crop&w=900&q=75'],
   ARRAY['Trilha privativa', 'Cachoeira na propriedade', 'Wi-Fi', 'Lareira', 'Fogão a lenha', 'Churrasqueira', 'Estacionamento'],
   'ativo', FALSE, 11, NOW() - INTERVAL '6 months' - INTERVAL '8 days'),
  ('de000000-0000-4000-9000-000000000018', v_owner, 'Cabana Poço Azul', $t$Cabana de madeira em um sítio na capital do ecoturismo paulista, com cachoeira de 20 metros e poço de água azulada dentro da propriedade. Perto das atividades de rafting, boia-cross e cachoeiras de Brotas.

📍 Como chegar
A 14 km do centro de Brotas, pela SP-197, e os últimos 2 km são de terra. Campinas fica a 2h de carro e São Paulo a 3h30.

🛏️ A estadia
• Capacidade: até 5 hóspedes
• 2 quartos · 1 cama de casal e 3 de solteiro
• 1 banheiro
• Check-in a partir das 14h · check-out até as 11h

✅ O que tem
• Cachoeira com poço para banho
• Piscina
• Wi-Fi
• Churrasqueira
• Cozinha completa
• Chuveiro com água quente
• Estacionamento
• Roupa de cama e toalhas

❌ O que não tem
• Ar-condicionado
• Hidromassagem
• Lareira
• Serviço de guia (indicamos agências parceiras)

📋 Regras da casa
• Aceitamos pets
• Sem festas
• Cuidado nas pedras escorregadias da cachoeira$t$ || v_nota, 'Brotas, SP', 330, 'semi', 'Cachoeira', 'Sudeste',
   ARRAY['https://images.unsplash.com/photo-1542718610-a1d656d1884c?auto=format&fit=crop&w=900&q=75', 'https://images.unsplash.com/photo-1757997916383-6900c7d6caa2?auto=format&fit=crop&w=900&q=75'],
   ARRAY['Cachoeira na propriedade', 'Piscina', 'Wi-Fi', 'Churrasqueira', 'Cozinha equipada', 'Estacionamento', 'Aceita pets'],
   'ativo', FALSE, 11, NOW() - INTERVAL '5 months' - INTERVAL '11 days')
  ON CONFLICT (id) DO NOTHING;

  -- ── 3. Avaliações (a nota média e a contagem de cada cabana são recalculadas pelo banco) ──
  INSERT INTO public.reviews (id, property_id, author_id, rating, comment, created_at)
  VALUES
  ('de000000-0000-4000-a000-000000000001', 'de000000-0000-4000-9000-000000000001', 'de000000-0000-4000-8000-000000000001', 5, $t$Acordar com o barulho do mar e tomar café na varanda foi o melhor da viagem. A piscina natural na maré baixa é um espetáculo. Voltaremos!$t$, NOW() - INTERVAL '70 days'),
  ('de000000-0000-4000-a000-000000000002', 'de000000-0000-4000-9000-000000000001', 'de000000-0000-4000-8000-000000000002', 5, $t$Lugar muito bem cuidado, a equipe foi atenciosa do começo ao fim. O café da manhã com tapioca e bolo de macaxeira vale a diária.$t$, NOW() - INTERVAL '108 days'),
  ('de000000-0000-4000-a000-000000000003', 'de000000-0000-4000-9000-000000000001', 'de000000-0000-4000-8000-000000000003', 4, $t$Cenário de cartão-postal. Só descontei uma estrela porque o Wi-Fi oscila no quarto, mas na varanda funciona bem.$t$, NOW() - INTERVAL '147 days'),
  ('de000000-0000-4000-a000-000000000004', 'de000000-0000-4000-9000-000000000001', 'de000000-0000-4000-8000-000000000004', 5, $t$Silêncio total, praia quase deserta. Fomos em casal e foi perfeito para comemorar nosso aniversário de casamento.$t$, NOW() - INTERVAL '185 days'),
  ('de000000-0000-4000-a000-000000000005', 'de000000-0000-4000-9000-000000000001', 'de000000-0000-4000-8000-000000000005', 3, $t$Muito bonito, mas a estrada de areia no fim assusta quem tem carro baixo e senti falta de uma TV para os dias de chuva.$t$, NOW() - INTERVAL '250 days'),
  ('de000000-0000-4000-a000-000000000006', 'de000000-0000-4000-9000-000000000002', 'de000000-0000-4000-8000-000000000006', 5, $t$Acordamos com os pássaros e fomos de caiaque na laguna. Estrutura excelente e o anfitrião respondeu todas as dúvidas rapidinho.$t$, NOW() - INTERVAL '24 days'),
  ('de000000-0000-4000-a000-000000000007', 'de000000-0000-4000-9000-000000000002', 'de000000-0000-4000-8000-000000000007', 5, $t$Perfeito para quem quer natureza com conforto. O ar-condicionado e a água quente funcionaram sem problemas.$t$, NOW() - INTERVAL '51 days'),
  ('de000000-0000-4000-a000-000000000008', 'de000000-0000-4000-9000-000000000002', 'de000000-0000-4000-8000-000000000008', 4, $t$Lindo e silencioso. A estrada de terra depois de chuva fica ruim, vale chegar de dia. Fora isso, tudo ótimo.$t$, NOW() - INTERVAL '102 days'),
  ('de000000-0000-4000-a000-000000000009', 'de000000-0000-4000-9000-000000000002', 'de000000-0000-4000-8000-000000000009', 5, $t$Levamos nosso cachorro e ele foi muito bem recebido. A piscina de frente para a laguna é um sonho.$t$, NOW() - INTERVAL '154 days'),
  ('de000000-0000-4000-a000-000000000010', 'de000000-0000-4000-9000-000000000002', 'de000000-0000-4000-8000-000000000010', 4, $t$Ótima estadia. Poderia ter um restaurante por perto, mas a cozinha completa resolveu.$t$, NOW() - INTERVAL '196 days'),
  ('de000000-0000-4000-a000-000000000011', 'de000000-0000-4000-9000-000000000002', 'de000000-0000-4000-8000-000000000011', 2, $t$A casa é linda, mas chegamos e o Wi-Fi estava fora do ar por dois dias. Resolveram depois, mas atrapalhou quem precisava trabalhar.$t$, NOW() - INTERVAL '223 days'),
  ('de000000-0000-4000-a000-000000000012', 'de000000-0000-4000-9000-000000000003', 'de000000-0000-4000-8000-000000000012', 5, $t$Simples e perfeito. A dona do bangalô nos indicou o passeio de piscinas naturais e foi o ponto alto da viagem.$t$, NOW() - INTERVAL '99 days'),
  ('de000000-0000-4000-a000-000000000013', 'de000000-0000-4000-9000-000000000003', 'de000000-0000-4000-8000-000000000013', 4, $t$Bem localizado, a 2 minutos do mar. Sem ar-condicionado dá calor nas noites sem vento, mas o ventilador deu conta.$t$, NOW() - INTERVAL '165 days'),
  ('de000000-0000-4000-a000-000000000014', 'de000000-0000-4000-9000-000000000003', 'de000000-0000-4000-8000-000000000014', 5, $t$Custo-benefício excelente. Café da manhã farto, rede na varanda e praia linda.$t$, NOW() - INTERVAL '190 days'),
  ('de000000-0000-4000-a000-000000000015', 'de000000-0000-4000-9000-000000000004', 'de000000-0000-4000-8000-000000000002', 5, $t$Fomos em 8 amigos para a temporada de kitesurf e a casa comportou todo mundo com folga. Vista da varanda é inacreditável.$t$, NOW() - INTERVAL '40 days'),
  ('de000000-0000-4000-a000-000000000016', 'de000000-0000-4000-9000-000000000004', 'de000000-0000-4000-8000-000000000004', 4, $t$Casa ampla e bem equipada. Só avisem para quem vai: o mercado é longe, leve tudo.$t$, NOW() - INTERVAL '103 days'),
  ('de000000-0000-4000-a000-000000000017', 'de000000-0000-4000-9000-000000000004', 'de000000-0000-4000-8000-000000000006', 5, $t$Praia deserta, vento ótimo e um pôr do sol que não dá para esquecer. Anfitrião super prestativo.$t$, NOW() - INTERVAL '146 days'),
  ('de000000-0000-4000-a000-000000000018', 'de000000-0000-4000-9000-000000000004', 'de000000-0000-4000-8000-000000000009', 3, $t$A casa é ótima e a localização incrível, mas o ar-condicionado de um dos quartos não gelava direito. Avisamos e foi consertado no dia seguinte.$t$, NOW() - INTERVAL '168 days'),
  ('de000000-0000-4000-a000-000000000019', 'de000000-0000-4000-9000-000000000005', 'de000000-0000-4000-8000-000000000003', 5, $t$Vimos duas baleias da hidromassagem com uma taça de vinho. Difícil descrever, é preciso viver. Casa impecável.$t$, NOW() - INTERVAL '17 days'),
  ('de000000-0000-4000-a000-000000000020', 'de000000-0000-4000-9000-000000000005', 'de000000-0000-4000-8000-000000000005', 5, $t$Arquitetura linda e confortável de verdade. A lareira na noite fria foi um charme.$t$, NOW() - INTERVAL '57 days'),
  ('de000000-0000-4000-a000-000000000021', 'de000000-0000-4000-9000-000000000005', 'de000000-0000-4000-8000-000000000007', 4, $t$A vista é sensacional e a casa é muito bem equipada. Só a escada até a praia cansa na volta.$t$, NOW() - INTERVAL '78 days'),
  ('de000000-0000-4000-a000-000000000022', 'de000000-0000-4000-9000-000000000005', 'de000000-0000-4000-8000-000000000010', 5, $t$Atendimento nota dez. Deixaram até um kit de boas-vindas com pão e geleia caseira.$t$, NOW() - INTERVAL '118 days'),
  ('de000000-0000-4000-a000-000000000023', 'de000000-0000-4000-9000-000000000005', 'de000000-0000-4000-8000-000000000013', 1, $t$Reservamos para o fim de semana e o aquecimento da hidromassagem não funcionou. O anfitrião tentou resolver, mas ficamos sem usar. Esperava mais pelo valor.$t$, NOW() - INTERVAL '130 days'),
  ('de000000-0000-4000-a000-000000000024', 'de000000-0000-4000-9000-000000000006', 'de000000-0000-4000-8000-000000000001', 4, $t$Localização excelente: a pé do mercado, dos restaurantes e da praia. Na alta temporada tem bastante movimento na rua.$t$, NOW() - INTERVAL '33 days'),
  ('de000000-0000-4000-a000-000000000025', 'de000000-0000-4000-9000-000000000006', 'de000000-0000-4000-8000-000000000008', 5, $t$Casa grande e organizada, deu certo para as duas famílias. A varanda do último andar é o melhor lugar da casa.$t$, NOW() - INTERVAL '70 days'),
  ('de000000-0000-4000-a000-000000000026', 'de000000-0000-4000-9000-000000000006', 'de000000-0000-4000-8000-000000000012', 3, $t$Boa casa, mas o chuveiro de um dos banheiros tem pouca pressão e o Wi-Fi caía no terceiro andar.$t$, NOW() - INTERVAL '106 days'),
  ('de000000-0000-4000-a000-000000000027', 'de000000-0000-4000-9000-000000000007', 'de000000-0000-4000-8000-000000000004', 5, $t$Fomos no inverno e foi mágico: lareira acesa, ofurô quentinho sob as estrelas. A cabana é ainda mais bonita pessoalmente.$t$, NOW() - INTERVAL '36 days'),
  ('de000000-0000-4000-a000-000000000028', 'de000000-0000-4000-9000-000000000007', 'de000000-0000-4000-8000-000000000006', 5, $t$Perfeita para casal. Acordamos com a luz entrando pelos janelões e café com vista para as araucárias.$t$, NOW() - INTERVAL '61 days'),
  ('de000000-0000-4000-a000-000000000029', 'de000000-0000-4000-9000-000000000007', 'de000000-0000-4000-8000-000000000011', 5, $t$O anfitrião explicou direitinho como acender o ofurô, que levou umas duas horas para esquentar. Valeu cada minuto.$t$, NOW() - INTERVAL '94 days'),
  ('de000000-0000-4000-a000-000000000030', 'de000000-0000-4000-9000-000000000007', 'de000000-0000-4000-8000-000000000013', 4, $t$Muito aconchegante. Para quem não gosta de subir escada, o mezanino pode ser um desafio.$t$, NOW() - INTERVAL '159 days'),
  ('de000000-0000-4000-a000-000000000031', 'de000000-0000-4000-9000-000000000007', 'de000000-0000-4000-8000-000000000014', 5, $t$Silêncio, mata e conforto. Já estamos planejando voltar no próximo inverno.$t$, NOW() - INTERVAL '224 days'),
  ('de000000-0000-4000-a000-000000000032', 'de000000-0000-4000-9000-000000000007', 'de000000-0000-4000-8000-000000000001', 4, $t$Cabana linda e bem equipada. Na noite de geada a lenha acabou antes do esperado, compre um pouco a mais na cidade.$t$, NOW() - INTERVAL '280 days'),
  ('de000000-0000-4000-a000-000000000033', 'de000000-0000-4000-9000-000000000008', 'de000000-0000-4000-8000-000000000002', 5, $t$A hidromassagem de frente para o lago, com o frio de Monte Verde, é uma experiência e tanto. Estadia perfeita.$t$, NOW() - INTERVAL '63 days'),
  ('de000000-0000-4000-a000-000000000034', 'de000000-0000-4000-9000-000000000008', 'de000000-0000-4000-8000-000000000005', 4, $t$Muito bonita e limpa. A água da hidromassagem demora a esquentar, ligue com antecedência.$t$, NOW() - INTERVAL '97 days'),
  ('de000000-0000-4000-a000-000000000035', 'de000000-0000-4000-9000-000000000008', 'de000000-0000-4000-8000-000000000008', 5, $t$Fomos de casal e voltaremos com os pais. O anfitrião deixou lenha, chocolate quente e geleias na chegada.$t$, NOW() - INTERVAL '162 days'),
  ('de000000-0000-4000-a000-000000000036', 'de000000-0000-4000-9000-000000000008', 'de000000-0000-4000-8000-000000000012', 5, $t$O lago ao amanhecer com a névoa é de tirar o fôlego. Tudo funcionando e muito aconchegante.$t$, NOW() - INTERVAL '228 days'),
  ('de000000-0000-4000-a000-000000000037', 'de000000-0000-4000-9000-000000000009', 'de000000-0000-4000-8000-000000000003', 5, $t$Amanhecer com geada nos campos e uma lareira acesa: foi tudo o que queríamos. Chalé muito bem cuidado.$t$, NOW() - INTERVAL '62 days'),
  ('de000000-0000-4000-a000-000000000038', 'de000000-0000-4000-9000-000000000009', 'de000000-0000-4000-8000-000000000007', 4, $t$Lugar lindo e silencioso. A subida de terra exige atenção, mas a recompensa é a vista.$t$, NOW() - INTERVAL '129 days'),
  ('de000000-0000-4000-a000-000000000039', 'de000000-0000-4000-9000-000000000009', 'de000000-0000-4000-8000-000000000009', 5, $t$Ficamos 3 noites e não queríamos ir embora. O anfitrião passou uma lista de passeios que deu muito certo.$t$, NOW() - INTERVAL '195 days'),
  ('de000000-0000-4000-a000-000000000040', 'de000000-0000-4000-9000-000000000010', 'de000000-0000-4000-8000-000000000001', 5, $t$Fim de semana perfeito: cachoeira de manhã, hidromassagem de tarde e lareira à noite. A vista para as montanhas é linda.$t$, NOW() - INTERVAL '65 days'),
  ('de000000-0000-4000-a000-000000000041', 'de000000-0000-4000-9000-000000000010', 'de000000-0000-4000-8000-000000000004', 4, $t$Ótima casa e anfitrião atencioso. A lenha não está inclusa, então compre antes de subir a serra.$t$, NOW() - INTERVAL '99 days'),
  ('de000000-0000-4000-a000-000000000042', 'de000000-0000-4000-9000-000000000010', 'de000000-0000-4000-8000-000000000010', 5, $t$Levamos nossa cachorra e fomos muito bem recebidos. Cabana bem aconchegante e silenciosa.$t$, NOW() - INTERVAL '162 days'),
  ('de000000-0000-4000-a000-000000000043', 'de000000-0000-4000-9000-000000000011', 'de000000-0000-4000-8000-000000000005', 5, $t$Perfeito para família. As crianças ficaram o dia todo no pomar e na piscina. A casa é bem equipada.$t$, NOW() - INTERVAL '42 days'),
  ('de000000-0000-4000-a000-000000000044', 'de000000-0000-4000-9000-000000000011', 'de000000-0000-4000-8000-000000000007', 4, $t$Sítio gostoso e bem cuidado, mas o Wi-Fi não pega bem no quarto dos fundos.$t$, NOW() - INTERVAL '85 days'),
  ('de000000-0000-4000-a000-000000000045', 'de000000-0000-4000-9000-000000000011', 'de000000-0000-4000-8000-000000000011', 5, $t$Fizemos pizza no forno a lenha e almoço no fogão a lenha. Foi o melhor fim de semana do ano.$t$, NOW() - INTERVAL '127 days'),
  ('de000000-0000-4000-a000-000000000046', 'de000000-0000-4000-9000-000000000011', 'de000000-0000-4000-8000-000000000014', 4, $t$Muito bom, a 10 minutos do centro. Em dias de calor o ar-condicionado fez falta numa das salas.$t$, NOW() - INTERVAL '161 days'),
  ('de000000-0000-4000-a000-000000000047', 'de000000-0000-4000-9000-000000000012', 'de000000-0000-4000-8000-000000000003', 4, $t$Cabana charmosa e muito silenciosa. Visita ao ateliê de cerâmica na cidade vale muito a pena.$t$, NOW() - INTERVAL '67 days'),
  ('de000000-0000-4000-a000-000000000048', 'de000000-0000-4000-9000-000000000012', 'de000000-0000-4000-8000-000000000006', 5, $t$O melhor da cabana é o campo aberto à noite: o céu estrelado aqui é raro. Banheira ótima para o frio.$t$, NOW() - INTERVAL '135 days'),
  ('de000000-0000-4000-a000-000000000049', 'de000000-0000-4000-9000-000000000013', 'de000000-0000-4000-8000-000000000002', 5, $t$Lua de mel perfeita. A hidromassagem com o frio de Gramado e a cabana toda decorada para o Natal foram inesquecíveis.$t$, NOW() - INTERVAL '25 days'),
  ('de000000-0000-4000-a000-000000000050', 'de000000-0000-4000-9000-000000000013', 'de000000-0000-4000-8000-000000000008', 5, $t$Detalhes caprichados e muita privacidade. A cama king é muito confortável.$t$, NOW() - INTERVAL '59 days'),
  ('de000000-0000-4000-a000-000000000051', 'de000000-0000-4000-9000-000000000013', 'de000000-0000-4000-8000-000000000010', 4, $t$Cabana linda. Só achamos o valor da diária alto na alta temporada, mas o conforto compensa.$t$, NOW() - INTERVAL '102 days'),
  ('de000000-0000-4000-a000-000000000052', 'de000000-0000-4000-9000-000000000014', 'de000000-0000-4000-8000-000000000004', 5, $t$Banho de cachoeira só nosso, sem ninguém por perto. A cabana é simples e muito aconchegante. Experiência única.$t$, NOW() - INTERVAL '29 days'),
  ('de000000-0000-4000-a000-000000000053', 'de000000-0000-4000-9000-000000000014', 'de000000-0000-4000-8000-000000000006', 5, $t$Trilha fácil e muito bonita. À noite o céu cheio de estrelas e o silêncio completo nos fizeram esquecer do celular.$t$, NOW() - INTERVAL '88 days'),
  ('de000000-0000-4000-a000-000000000054', 'de000000-0000-4000-9000-000000000014', 'de000000-0000-4000-8000-000000000008', 4, $t$Cachoeira linda e anfitrião educado. A estrada de terra exige cuidado depois da chuva e o Wi-Fi só funciona na varanda.$t$, NOW() - INTERVAL '118 days'),
  ('de000000-0000-4000-a000-000000000055', 'de000000-0000-4000-9000-000000000014', 'de000000-0000-4000-8000-000000000012', 5, $t$Fomos em família com duas crianças e todos adoraram. A segurança e a organização da trilha são ótimas.$t$, NOW() - INTERVAL '168 days'),
  ('de000000-0000-4000-a000-000000000056', 'de000000-0000-4000-9000-000000000014', 'de000000-0000-4000-8000-000000000014', 5, $t$Melhor decisão da viagem a Pirenópolis. Voltaremos na estação das chuvas, quando a cachoeira está mais cheia.$t$, NOW() - INTERVAL '255 days'),
  ('de000000-0000-4000-a000-000000000057', 'de000000-0000-4000-9000-000000000014', 'de000000-0000-4000-8000-000000000009', 3, $t$Lugar lindo, mas não percebi que a energia era solar e a geladeira desligou numa noite nublada. Leia a descrição com atenção.$t$, NOW() - INTERVAL '285 days'),
  ('de000000-0000-4000-a000-000000000058', 'de000000-0000-4000-9000-000000000015', 'de000000-0000-4000-8000-000000000001', 5, $t$A água cor de chá da cachoeira é inesquecível. O anfitrião nos levou numa trilha ao amanhecer e vimos tucanos.$t$, NOW() - INTERVAL '68 days'),
  ('de000000-0000-4000-a000-000000000059', 'de000000-0000-4000-9000-000000000015', 'de000000-0000-4000-8000-000000000003', 5, $t$Silêncio total, céu absurdo de estrelas. Cabana simples e bem limpa.$t$, NOW() - INTERVAL '124 days'),
  ('de000000-0000-4000-a000-000000000060', 'de000000-0000-4000-9000-000000000015', 'de000000-0000-4000-8000-000000000007', 4, $t$Experiência incrível, mas leve lanterna e repelente. Na estação seca a água esfria mais cedo.$t$, NOW() - INTERVAL '222 days'),
  ('de000000-0000-4000-a000-000000000061', 'de000000-0000-4000-9000-000000000016', 'de000000-0000-4000-8000-000000000002', 4, $t$Muito bem localizada, perto dos pontos turísticos. O café da manhã é farto e as araras passam logo cedo.$t$, NOW() - INTERVAL '73 days'),
  ('de000000-0000-4000-a000-000000000062', 'de000000-0000-4000-9000-000000000016', 'de000000-0000-4000-8000-000000000005', 5, $t$Equipe simpática, quarto limpo e piscina agradável depois dos passeios.$t$, NOW() - INTERVAL '124 days'),
  ('de000000-0000-4000-a000-000000000063', 'de000000-0000-4000-9000-000000000016', 'de000000-0000-4000-8000-000000000011', 3, $t$Boa estrutura, mas o ar-condicionado fazia barulho e o quarto fica perto do estacionamento.$t$, NOW() - INTERVAL '174 days'),
  ('de000000-0000-4000-a000-000000000064', 'de000000-0000-4000-9000-000000000016', 'de000000-0000-4000-8000-000000000013', 5, $t$Valeu cada centavo. Chalé aconchegante e anfitriões atenciosos. A cachoeira é um espetáculo.$t$, NOW() - INTERVAL '191 days'),
  ('de000000-0000-4000-a000-000000000065', 'de000000-0000-4000-9000-000000000017', 'de000000-0000-4000-8000-000000000001', 5, $t$Cascata só nossa e um deck lindo no meio da mata. Fomos de grupo e coube todo mundo.$t$, NOW() - INTERVAL '54 days'),
  ('de000000-0000-4000-a000-000000000066', 'de000000-0000-4000-9000-000000000017', 'de000000-0000-4000-8000-000000000004', 4, $t$Muito bonito e silencioso. O deck fica escorregadio quando chove, tome cuidado.$t$, NOW() - INTERVAL '111 days'),
  ('de000000-0000-4000-a000-000000000067', 'de000000-0000-4000-9000-000000000017', 'de000000-0000-4000-8000-000000000010', 5, $t$Perfeito para desligar. Acordamos com barulho de água e passarinho.$t$, NOW() - INTERVAL '167 days'),
  ('de000000-0000-4000-a000-000000000068', 'de000000-0000-4000-9000-000000000018', 'de000000-0000-4000-8000-000000000005', 4, $t$Ótima localização para quem quer fazer rafting e aproveitar a cachoeira no sítio. Estrutura simples e boa.$t$, NOW() - INTERVAL '54 days'),
  ('de000000-0000-4000-a000-000000000069', 'de000000-0000-4000-9000-000000000018', 'de000000-0000-4000-8000-000000000009', 5, $t$O poço azul da cachoeira é lindo e dá para ficar horas. A piscina também é ótima para as crianças.$t$, NOW() - INTERVAL '94 days'),
  ('de000000-0000-4000-a000-000000000070', 'de000000-0000-4000-9000-000000000018', 'de000000-0000-4000-8000-000000000013', 2, $t$O local é lindo, mas a estrada de terra estava com buracos e a internet não funcionou durante a nossa estadia. Esperava mais organização.$t$, NOW() - INTERVAL '134 days')
  ON CONFLICT (id) DO NOTHING;

  -- Os gatilhos de reserva e avaliação podem ter avisado o anfitrião: tira o ruído desta carga.
  DELETE FROM public.notifications
   WHERE created_at >= v_start AND property_id::text LIKE 'de000000-%';
END
$do$;

-- ── Conferência (rode depois) ───────────────────────────────
-- SELECT title, category, sub_category, price, rating, reviews_count, status
--   FROM properties WHERE id::text LIKE 'de000000-%' ORDER BY category, title;     -- 18 linhas
-- SELECT count(*) FROM reviews WHERE id::text LIKE 'de000000-%';                   -- 70
