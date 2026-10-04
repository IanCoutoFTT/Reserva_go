-- ============================================================
-- Migração 003: políticas de Storage do bucket "avatars"
-- ============================================================
--
-- Contexto (branch feature/perfil-admin, RF-008 - Editar Perfil):
-- app/(tabs)/profile.tsx passou a fazer upload de verdade da foto de perfil
-- via services/profileService.ts:uploadAvatar(), no mesmo padrão que já
-- funciona pra fotos de cabana (services/propertyService.ts:uploadPropertyImage,
-- bucket "properties"). O bucket "avatars" já existe (schema.sql linha 514,
-- `INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', ...)`),
-- mas nenhuma policy de storage.objects pra ele está registrada em
-- supabase/schema.sql - políticas de Storage não fazem parte do dump normal
-- de schema, então não dá pra saber por aqui se elas já existem no projeto
-- real ou não.
--
-- NÃO SEI se isso já está configurado no seu projeto Supabase. Antes de
-- rodar, confira no painel: Storage > avatars > Policies. Se já existir uma
-- policy equivalente (dono só grava dentro da própria pasta userId/arquivo),
-- não precisa rodar nada. Se não existir, o upload de foto de perfil vai
-- falhar com um erro de permissão (RLS) na hora de testar - essa migração
-- resolve isso.
--
-- Caminho usado pelo upload: `${userId}/${timestamp}.${ext}` (igual ao
-- padrão de uploadPropertyImage) - por isso a policy usa
-- storage.foldername(name))[1] = auth.uid(), que é o primeiro pedaço do
-- caminho, exatamente o userId.

-- Leitura pública (bucket já é público, mas storage.objects tem RLS própria
-- separada da flag "public" do bucket - sem policy de SELECT, ninguém lê).
CREATE POLICY "avatars_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- Cada usuário só pode enviar dentro da própria pasta (primeiro segmento do
-- caminho = seu próprio auth.uid()).
CREATE POLICY "avatars_owner_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Permite trocar de foto sem acumular lixo (upsert / sobrescrever o próprio
-- arquivo) - uploadAvatar usa upsert:false e nome com timestamp então isso
-- não é estritamente necessário hoje, mas fica coerente com a policy de
-- INSERT e evita surpresa se o client mudar pra upsert:true no futuro.
CREATE POLICY "avatars_owner_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Verificação pós-aplicação (rodar no SQL Editor):
-- SELECT policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'avatars_%';
-- Deve devolver as 3 policies acima.
