-- ============================================================
-- ReservaGO: ESCONDE as cabanas de TESTE antigas da vitrine
-- ============================================================
-- Cabanas como "Chale_Demo_Mirante", "CabanaTesteIntegracao" e "Cabana Teste QA"
-- foram criadas durante os testes e aparecem na tela Explorar sem foto, com nota 0.
-- Este script as marca como 'inativo' (somem da vitrine), SEM apagar nada: as
-- reservas e os históricos continuam no banco. Não toca nas cabanas de demonstração
-- (ids "de000000-").
--
-- Passo 1: rode só este SELECT e confira se a lista são mesmo cabanas de teste.
-- Passo 2: se estiver certo, rode o UPDATE abaixo.
-- Para desfazer: UPDATE properties SET status = 'ativo' WHERE id = '<id da cabana>';
-- ============================================================

-- PASSO 1: prévia
SELECT id, title, location, status
  FROM public.properties
 WHERE id::text NOT LIKE 'de000000-%'
   AND status::text = 'ativo'
   AND title ~* '(teste|test|demo)'
 ORDER BY title;

-- PASSO 2: aplicar (descomente as linhas abaixo e rode)
-- UPDATE public.properties
--    SET status = 'inativo'
--  WHERE id::text NOT LIKE 'de000000-%'
--    AND status::text = 'ativo'
--    AND title ~* '(teste|test|demo)';
