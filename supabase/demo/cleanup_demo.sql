-- ============================================================
-- ReservaGO: REMOVE os dados de demonstração criados por seed_demo.sql
-- ============================================================
-- Apaga só o que foi criado pela carga de demonstração: cabanas (e, junto,
-- as avaliações, favoritos e reservas ligadas a elas), os hóspedes fictícios
-- e as notificações ligadas às cabanas. Não toca em nenhum dado real.
-- Cole no SQL Editor e rode.
-- ============================================================

DELETE FROM public.notifications WHERE property_id::text LIKE 'de000000-%';
DELETE FROM public.properties    WHERE id::text LIKE 'de000000-%';
DELETE FROM auth.users           WHERE id::text LIKE 'de000000-%';   -- apaga os perfis fictícios em cascata

-- Conferência: as três devem dar 0.
-- SELECT count(*) FROM properties WHERE id::text LIKE 'de000000-%';
-- SELECT count(*) FROM auth.users WHERE id::text LIKE 'de000000-%';
-- SELECT count(*) FROM reviews    WHERE id::text LIKE 'de000000-%';
