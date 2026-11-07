# ReservaGO — Relatório do 3º teste de segurança

**Data:** 29/10/2026
**Escopo:** banco Supabase (RLS, triggers, funções, Storage), app React Native/Expo (autenticação, serviços, telas, logs, bundle de produção) e dependências npm.
**Ponto de partida:** o zip `Reserva_go-main` enviado, com `schema.sql` + migrações **001 a 007**.

---

## 1. Resumo

| | Antes (zip enviado) | Depois |
|---|---|---|
| Testes de ataque no banco (`supabase/tests/security_tests.sql`) | **77 de 113** passando | **113 de 113** passando |
| Falhas do 2º teste que ainda estavam abertas no repositório | **16** (S-01 a S-16) | **0** (todas reaplicadas) |
| Falhas novas encontradas neste 3º teste | — | **5** (T-01 a T-05), todas corrigidas |
| Credenciais de admin dentro do APK de produção | sim (`admin@reservago.com` / `1234`) | não (conferido no bundle) |
| `npm audit` (críticas / altas) | 2 / 17 (45 no total) | 0 / 6 (27 no total) |
| TypeScript (`tsc --noEmit`) | 0 erros | 0 erros |
| Jest | 20 suítes, 150 testes | 22 suítes, 162 testes |

**Achado principal antes de qualquer teste:** o zip enviado **não contém nenhuma das correções do 2º teste** (não existe a migração 008, nem `supabase/tests/`, nem as mudanças no app). Ou seja, o repositório estava no mesmo ponto em que o 2º teste começou. Por isso este 3º teste fez duas coisas:

1. **Rodou de novo a bateria do 2º teste** (92 cenários) sobre o repositório do zip: as mesmas 19 falhas apareceram. Todas as correções S-01 a S-16 foram reaplicadas (migração 008 + app) e estão descritas na **Parte B**.
2. **Procurou falhas novas** com 21 cenários a mais (total 113). Saíram 5 achados novos (T-01 a T-05, **Parte A**), corrigidos na nova migração **009**.

As correções do 1º teste (migrações 006 e 007) continuam funcionando: preço calculado no servidor, cabana não se autoaprova, notificação falsa bloqueada, mensagens só entre participantes, avaliação só de quem se hospedou, e-mail/telefone fora da leitura pública. Esses casos fazem parte dos 77 que já passavam e seguem como regressão automática no CI.

> **Para não perder as correções de novo:** depois de copiar os arquivos para o repositório, rode `git status` e confira que aparecem **arquivos modificados** (não só arquivos novos) — a lista completa está na seção 3.

---

## 2. Como os testes foram feitos

### 2.1 Banco de dados
1. Subi um **PostgreSQL 16** local com o mínimo do Supabase que o projeto usa (`supabase/tests/local_supabase_shim.sql`): papéis `anon`/`authenticated`/`service_role`, `auth.uid()`, `auth.role()`, `storage.objects`, `storage.buckets` e as permissões padrão do Supabase.
2. Apliquei `schema.sql` + migrações **exatamente como estão no zip** (001–007) e rodei os 113 cenários → **77 ok, 36 falhas** (`docs/evidencias-seguranca/3o-teste-antes.txt`).
3. Cada cenário “vira” um usuário do mesmo jeito que o PostgREST faz com o JWT do app (`SET ROLE authenticated` + `request.jwt.claims`), tenta a ação e depois confere, como dono do banco, se ela teve efeito. Cada cenário é desfeito logo em seguida.
4. Os cenários cobrem **ataques** (devem dar `bloqueado`) e **uso normal do app** (devem dar `permitido`), para garantir que as correções não quebram nada — por exemplo, “anfitrião muda só o preço e a cabana continua no ar” e “nome comum com acento continua permitido”.
5. Usuários de teste: A = atacante (hóspede), B = anfitrião, C = vítima, D = admin, E = admin com conta excluída e, novos neste teste, **F = hóspede que excluiu a conta** e **G = anfitrião que excluiu a conta**.
6. Depois de aplicar 008 e 009: **113 ok, 0 falhas** (`docs/evidencias-seguranca/3o-teste-depois.txt`). Também conferi que 008 e 009 podem ser rodadas 2× (idempotentes) e que o `seed.sql` continua aplicando depois delas.

### 2.2 App
- Leitura do código de autenticação, serviços, telas e polyfills.
- **Bundle de produção Android** (`npx expo export --platform android`) gerado com o `AuthContext` original e com o corrigido, procurando as credenciais fixas dentro do bytecode Hermes. Controle positivo: strings comuns do app (`oauth-callback`, `get_my_profile`) aparecem no bundle, então a busca funciona.
- `tsc --noEmit`, Jest e `npm audit` antes e depois.

---

## Parte A — Achados novos do 3º teste (migração 009)

### T-01 — Conta excluída continuava usando a API · **Média** · corrigido
**Problema:** “Excluir conta” só marcava `profiles.deleted_at`. O usuário em `auth.users` continua existindo, o token (JWT) que o celular já tinha continua válido até expirar, e um novo login com Google gera outro. O app desloga sozinho quando o perfil some, mas isso é **só no app**: chamando a API direto, a conta excluída continuava fazendo reserva, mandando mensagem, abrindo conversa, denunciando, favoritando, subindo arquivo e trocando de role. As policies só conferiam `auth.uid()`, nunca se a conta ainda estava ativa.
**Teste:** cenários 93 a 99 (falhavam), 100 (já bloqueado pela regra de anfitrião).
**Correção:** função `is_active_user()` e uma policy **RESTRICTIVE** `conta_ativa_insert` / `conta_ativa_update` em `bookings`, `messages`, `conversations`, `reports`, `favorites`, `reviews`, `properties`, `profiles` e `storage.objects`. Policy restritiva soma (AND) com as que já existiam, então não foi preciso reescrever nenhuma delas. `set_own_role()` (que ignora RLS por ser `SECURITY DEFINER`) ganhou a mesma checagem por dentro.

### T-02 — Cabana de quem excluiu a conta continuava no ar e reservável · **Média** · corrigido
**Problema:** quando um anfitrião excluía a conta, as cabanas dele seguiam `ativo`: apareciam no Explorar e aceitavam reserva de hóspedes reais — sem ninguém do outro lado para receber. E quando um hóspede excluía a conta, as reservas futuras dele continuavam bloqueando as datas no calendário do anfitrião.
**Teste:** cenários 101 a 104.
**Correção:** `properties_public_read` passou a exigir que o dono esteja ativo (`is_active_user(owner_id)`); como o trigger de reserva lê a cabana com essa RLS, a reserva é recusada. `delete_my_account()` agora também **cancela as reservas futuras** do usuário (libera o calendário; o anfitrião é avisado pelo trigger que já existia) e marca as cabanas dele como `removido`.

### T-03 — Conteúdo de cabana aprovada trocado sem passar pela moderação · **Alta** · corrigido
**Problema:** a moderação só acontecia na criação. Depois de aprovada, o anfitrião podia trocar título, descrição, local e fotos e o conteúdo novo ia direto ao ar. Exemplo testado: título “Pague por PIX fora do app: 62 9…” e uma foto externa — o mesmo golpe que o S-01 fechou no chat, só que agora na vitrine.
**Teste:** cenário 105 (ataque), 106 e 107 (uso normal).
**Correção:** no trigger `protect_property_moderation_fields`, se uma cabana `ativo` tem **título, descrição, local, fotos ou comodidades** alterados por quem não é admin, ela volta para `pendente`. Preço, categoria e nível de isolamento são valores fechados e **não** tiram a cabana do ar. No app, `create-listing.tsx` avisa: “Alterações enviadas para análise — a cabana sai do explorar até um administrador aprovar de novo”.

### T-04 — Perfil se passando pela equipe do app · **Baixa** · corrigido
**Problema:** qualquer usuário podia se chamar “Suporte ReservaGO” ou “Admin”. Com o S-01 resolvido, só o dono real conversa sobre uma cabana — mas o dono real ainda podia aparecer no chat como “Suporte ReservaGO”.
**Teste:** cenários 108 a 110.
**Correção:** `protect_profile_fields` recusa, para quem não é admin, nomes com “reservago”, “suporte”, “admin…”, “moderador” ou “equipe reserva”, com a mensagem “Esse nome é reservado à equipe do ReservaGO. Escolha outro.”, que a tela Editar Perfil já mostra. O cenário 110 garante que nomes comuns (“Adriana Mônica”) continuam passando.

### T-05 — Cancelar estadia que já começou ou terminou · **Baixa** · corrigido
**Problema:** o hóspede conseguia cancelar uma reserva cujo check-in já tinha passado, inclusive de estadia concluída. Isso apaga o histórico, derruba o contador de reservas da cabana (`bookings_count`, usado no ranking do admin) e dispara notificação de cancelamento falsa para o anfitrião.
**Teste:** cenário 111.
**Correção:** `protect_booking_update` só aceita cancelamento **até o dia do check-in** (mensagem “Não é possível cancelar uma estadia que já começou.”). No app, `lib/booking.ts → canCancelStay()` esconde o botão “Cancelar reserva” de estadias em andamento, com teste no Jest.

### Verificado e já protegido (sem correção)
- **Várias conversas de suporte com o mesmo admin** (cenários 112 e 113): já bloqueado pelo índice único `conversations_unique_no_property` da migração 006. Ficou como regressão.
- **Avaliação repetida da mesma reserva**: já bloqueado (`UNIQUE (booking_id, author_id)`).
- **Reserva sobreposta**: já bloqueado (`bookings_no_overlap`, exclusão por intervalo de datas).
- **Admin excluído agindo como admin**: `is_admin()` e as policies de admin já conferem `deleted_at`.
- **Realtime**: as 3 tabelas publicadas (`bookings`, `messages`, `notifications`) respeitam a RLS.

---

## Parte B — Correções do 2º teste reaplicadas (migração 008 + app)

Estes 16 achados foram encontrados no 2º teste, mas **não estavam no zip**. Reapliquei todos e reconferi: os cenários do banco passam, e os do app foram verificados no código, no Jest e no bundle de produção.

Severidade: **Alta** = permite fraude ou derrubar o serviço para outros usuários; **Média** = expõe dados, quebra um direito do usuário ou enfraquece uma proteção; **Baixa** = integridade/endurecimento.

#### S-01 — Phishing pelo chat: conversa “se passando” pelo anfitrião · **Alta** · corrigido
**Problema:** a policy `conversations_participant_insert` só exigia que o usuário estivesse em um dos lados da conversa. Um atacante criava uma conversa com `host_id = ele mesmo`, `guest_id = qualquer hóspede` e `property_id = cabana de outra pessoa`. No app, a vítima via uma conversa “sobre a Cabana X” com alguém que parecia o anfitrião — cenário clássico de golpe (“pague por PIX fora do app”). O mesmo valia para uma falsa conversa de **suporte** com um usuário comum no lugar do admin.  
**Teste:** cenários 58 e 59.  
**Correção (migração 008):** só o hóspede abre conversa; numa conversa sobre cabana, `host_id` tem que ser o **dono real** da cabana (função `property_owner()`); numa conversa sem cabana (suporte), o outro lado tem que ser **admin ativo**.

#### S-02 — Bloqueio de calendário sem pagar · **Alta** · corrigido
**Problema:** não há pagamento real; o banco aceitava reserva de qualquer duração, para qualquer data futura, sem limite por conta. Uma única conta conseguia reservar 300 noites de uma cabana, ou reservar todas as cabanas por um ano, deixando o calendário inteiro indisponível para clientes de verdade.  
**Teste:** cenários 37, 38 e 39.  
**Correção (trigger `prepare_booking_insert`):** no máximo **30 noites** por reserva, check-in até **365 dias** à frente e no máximo **5 reservas futuras ativas** por hóspede. Os três limites são constantes no topo da função, fáceis de ajustar.

#### S-03 — Buckets públicos aceitavam qualquer arquivo · **Média** · corrigido
**Problema:** `avatars` e `properties` são públicos e não tinham limite de tipo nem de tamanho. Qualquer conta podia hospedar HTML, scripts ou executáveis no domínio do projeto (útil para phishing) ou encher o Storage.  
**Teste:** cenários 90 e 91.  
**Correção:** 5 MB por arquivo e só `image/jpeg, image/png, image/webp, image/heic, image/heif` (+ `image/jpg` por compatibilidade). No app, o content-type agora vem de `lib/imageType.ts` (antes era `image/${extensão}`, o que gerava tipos inventados).

#### S-04 — Hóspede publicava cabana e fotos de cabana · **Baixa** · corrigido
**Problema:** qualquer conta logada, mesmo sem perfil de anfitrião, criava anúncio e subia arquivos no bucket `properties`.  
**Teste:** cenários 20 e 88.  
**Correção:** policies de INSERT em `properties` e no bucket `properties` exigem role `anfitriao` ou `admin`. Em `app/create-listing.tsx`, quem não é anfitrião recebe uma mensagem e é levado para ativar o perfil.

#### S-05 — Denúncia forjada e assinatura de resolução falsa · **Baixa** · corrigido
**Problema:** o usuário criava a denúncia já com `status = 'resolvido'` e `resolved_by = <id de um admin>`; e um admin podia registrar a resolução no nome de outro admin.  
**Teste:** cenários 77 e 81.  
**Correção:** trigger `protect_report_fields`: denúncia sempre nasce `pendente`, sem dados de resolução; o conteúdo da denúncia não muda depois; ao resolver/arquivar, `resolved_by` e `resolved_at` são preenchidos pelo próprio banco com quem resolveu.

#### S-06 — Campos sem limite e URLs perigosas · **Média** · corrigido
**Problema:** mensagem, bio, descrição etc. aceitavam 1 MB ou mais (abuso de armazenamento e de notificações, já que o texto da mensagem vira notificação); preço negativo era aceito; `avatar_url` e `images` aceitavam `javascript:`, `http:` ou pixel de rastreamento externo.  
**Teste:** cenários 11, 12, 26, 27 e 63.  
**Correção:** `CHECK`s em `profiles`, `properties`, `messages`, `reviews` e `reports` (tamanhos máximos, preço entre 0 e 100.000, URLs só `https://`). Foram criados como `NOT VALID`: valem para tudo que for gravado daqui para frente sem quebrar a migração se já existir algum dado antigo fora do padrão.

#### S-07 — Usuário trocava o próprio e-mail do perfil · **Baixa** · corrigido
**Problema:** o e-mail do perfil vem do login Google, mas podia ser sobrescrito (ex.: `admin@reservago.com`), o que confunde o painel e qualquer comunicação futura.  
**Teste:** cenário 10.  
**Correção:** trigger `protect_profile_fields` mantém `email`, `id`, `created_at` e `deleted_at` imutáveis para requisições do app.

#### S-08 — “Excluir conta” nunca funcionou · **Média** (LGPD) · corrigido
**Problema:** o app fazia `UPDATE profiles SET deleted_at = now()`. A linha nova deixa de passar na policy de leitura (`deleted_at IS NULL`) e o Postgres recusa o comando com *“new row violates row-level security policy”*. O usuário via erro e a conta continuava ativa — o direito de exclusão não era atendido.  
**Teste:** cenários 13 e 15 (o 15 reproduz o jeito antigo e confirma o erro).  
**Correção:** função `delete_my_account()` (só age sobre o próprio usuário), que também apaga telefone, bio e interesses. `services/profileService.ts → deleteAccount()` passou a chamar esse RPC, com testes no Jest.

#### S-09 — Funções privilegiadas mal configuradas · **Baixa** · corrigido
**Problema:** `create_notification` é `SECURITY DEFINER` sem `search_path` fixo (resolveria nomes pelo `search_path` de quem chama); `set_own_role` podia ser chamada sem login.  
**Teste:** cenários 7 e 92.  
**Correção:** `search_path = public` fixado e `EXECUTE` de `set_own_role` só para `authenticated`. O teste 92 confere **todas** as funções `SECURITY DEFINER` do schema, então uma função nova sem `search_path` volta a falhar no CI.

#### S-10 — Triggers tratavam “sem usuário” como administrador · **Baixa** (defesa em profundidade) · corrigido
**Problema:** os triggers de proteção da 006 liberavam tudo quando `auth.uid()` era nulo, pensando no SQL Editor. Só que um visitante **sem login** (chave `anon`) também tem `auth.uid()` nulo. Hoje nenhuma policy deixa `anon` escrever, então não era explorável — mas bastaria uma policy nova mal escrita para os triggers pararem de proteger.  
**Correção:** função `is_app_request()` (verifica se o comando veio do app, como `anon` ou `authenticated`). Os triggers passaram a ser `SECURITY INVOKER` e só liberam o que vem do SQL Editor, do `service_role` ou de funções internas do próprio banco.

#### S-11 — Contas do seed com senha pública · **Alta** (se o seed foi aplicado) · corrigido no arquivo
**Problema:** `supabase/seed.sql` cria 3 anfitriões com e-mail e senha `Seed123!`, tudo publicado no GitHub. Se o seed foi rodado no projeto real com login por e-mail habilitado, qualquer pessoa entra como esses anfitriões e edita ou remove as cabanas deles.  
**Correção:** cada conta do seed agora recebe uma senha aleatória descartada na hora, então ninguém consegue logar nelas. **Ação manual necessária:** ver seção 4.

#### S-12 — Aleatoriedade insegura no login (PKCE) · **Média** · corrigido
**Problema:** `lib/cryptoPolyfill.ts` instalava `crypto.getRandomValues` **global** usando `Math.random()`, que não é criptograficamente seguro. Isso alimentava o `code_verifier` do PKCE e qualquer outra biblioteca que confiasse nessa API.  
**Correção:** `getRandomValues` agora vem do **expo-crypto** (gerador seguro do sistema operacional). Se o módulo nativo não existir no binário, o polyfill **não instala nada** e o app não volta para `Math.random`. Testes novos em `lib/__tests__/cryptoPolyfill.test.ts`.

#### S-13 — Login de admin “1234” dentro do app de produção · **Média** · corrigido
**Problema:** o formulário de login fake era escondido com `__DEV__`, mas o array com as 3 contas (incluindo **admin / 1234**) e a função que as aceita continuavam no bundle. Confirmado: o bundle de produção gerado a partir do código original contém `admin@reservago.com` e `static-admin-01`.  
**Correção:** `STATIC_USERS = __DEV__ ? [...] : []` e `login()` retorna sem fazer nada fora de dev. Confirmado: o bundle de produção do código corrigido **não contém** nenhuma dessas strings.

#### S-14 — Logs com dado pessoal e código de autorização · **Baixa** · corrigido
**Problema:** cerca de 70 `console.log` continuavam ativos em produção, alguns com o e-mail do perfil e a URL de retorno do OAuth (com o código de autorização). No Android, esses logs vão para o `logcat`.  
**Correção:** `lib/productionLogs.ts` (primeiro import de `app/_layout.tsx`) desliga `console.log/info/debug` em produção; `warn` e `error` continuam ativos. Também removi a URL e o e-mail dos logs de login.

#### S-15 — Busca montada por concatenação no filtro do PostgREST · **Baixa** · corrigido
**Problema:** `propertyService.getProperties({ search })` colava o texto digitado dentro de `.or('title.ilike.%…%,…')`. Vírgulas e parênteses no texto mudavam a estrutura do filtro. Hoje a tela Explorar filtra localmente e não chama esse caminho, mas ele estava pronto para ser usado.  
**Correção:** `sanitizeSearchTerm()` remove `, ( ) . : " ' \ % *` e limita a 60 caracteres. Testes no Jest.

#### S-16 — Dependências vulneráveis · **Média** · parcialmente corrigido
**Antes:** 45 vulnerabilidades (2 críticas: `tar`, `shell-quote`; 17 altas).  
**Feito:** `npm audit fix` (sem `--force`, só versões compatíveis com o Expo SDK 54).  
**Depois (medido de novo neste 3º teste):** 27 (0 críticas, 6 altas, 3 moderadas, 18 baixas). As que restam (`expo-router` → `query-string`/`decode-uri-component`, `postcss`, `image-size` e, novo, `ws` do servidor de desenvolvimento) só saem com o upgrade do Expo SDK. São quase todas de ferramentas de build ou de negação de serviço local no parser de deep link, sem acesso a dados. Fica registrado como risco residual.

---

---

## 3. Arquivos alterados / criados (copie TODOS para o repositório)

**Banco**
- `supabase/migrations/008_security_retest_fixes.sql` — **novo**: S-01 a S-10.
- `supabase/migrations/009_security_third_test_fixes.sql` — **novo**: T-01 a T-05.
- `supabase/tests/security_tests.sql` — **novo**: os 113 cenários (rodam no SQL Editor do Supabase).
- `supabase/tests/local_supabase_shim.sql` — **novo**: Supabase mínimo para rodar os testes em Postgres puro (CI). **Não rodar no Supabase.**
- `supabase/seed.sql` — *modificado*: S-11.
- `supabase/schema.sql` — *modificado*: só um aviso no cabeçalho (estado final = schema + 001–009).

**App**
- `lib/cryptoPolyfill.ts` — *modificado*: S-12 · `package.json` / `package-lock.json` — *modificados*: `expo-crypto ~15.0.8` + `npm audit fix`.
- `context/AuthContext.tsx` — *modificado*: S-13 e S-14.
- `lib/productionLogs.ts` — **novo** · `app/_layout.tsx` — *modificado* (importa ele primeiro): S-14.
- `app/login.tsx`, `app/oauth-callback.tsx` — *modificados*: logs sem URL/código de autorização (S-14).
- `services/profileService.ts` — *modificado*: S-08 (RPC `delete_my_account`) e S-03 (content-type).
- `services/propertyService.ts` — *modificado*: S-15 (`sanitizeSearchTerm`) e S-03.
- `lib/imageType.ts` — **novo**: S-03.
- `app/create-listing.tsx` — *modificado*: S-04 (aviso para quem não é anfitrião) e T-03 (aviso de nova análise).
- `lib/booking.ts`, `app/(tabs)/bookings.tsx` — *modificados*: T-05 (`canCancelStay`).

**Testes, CI e documentação**
- `services/__tests__/profileService.test.ts`, `services/__tests__/propertyService.test.ts`, `lib/__tests__/booking.test.ts` — *modificados*.
- `lib/__tests__/cryptoPolyfill.test.ts`, `lib/__tests__/imageType.test.ts` — **novos**.
- `.github/workflows/ci.yml` — *modificado*: novo job **“Testes de segurança do banco (RLS)”** — sobe Postgres 16, aplica schema + todas as migrações + seed, roda os 113 cenários e derruba o build se algum der `ok = f`.
- `docs/relatorio-seguranca.md` (este arquivo) e `docs/evidencias-seguranca/3o-teste-antes.txt` / `3o-teste-depois.txt` — **novos**.

---

## 4. O que precisa ser feito à mão (fora do código)

1. **Aplicar no Supabase, em ordem:** SQL Editor → colar `008_security_retest_fixes.sql` → Run; depois `009_security_third_test_fixes.sql` → Run. (Se a 006 e a 007 ainda não tiverem sido aplicadas, aplicar antes.) A 009 redefine funções da 008: **se rodar a 008 de novo algum dia, rode a 009 logo em seguida.**
2. **Rodar `supabase/tests/security_tests.sql`** no SQL Editor. A tabela final deve ter as 113 linhas com `ok = true`.
3. **Contas do seed (S-11):** em Authentication → Users, procurar `maria.anfitria.seed@`, `joao.anfitriao.seed@` e `clara.anfitria.seed@reservago.com`. Se existirem, use “Send password recovery” para um e-mail do grupo ou exclua as contas.
4. **Login por e-mail:** se o app só usa Google, desligue o provider *Email* em Authentication → Providers.
5. **Gerar um novo dev build / APK** (`eas build -p android --profile development`): o `expo-crypto` é módulo nativo. No Expo Go ele já vem incluso; no APK antigo o polyfill apenas não instala o gerador aleatório (seguro, mas sem o ganho da correção).
6. **Commit:** `git add -A`, depois `git status` — confira que os arquivos *modificados* da seção 3 aparecem, não só os novos.
7. Depois de aplicar, trocar “PROPOSTO” por “JÁ APLICADO” no cabeçalho da 008 e da 009.

## 5. Riscos residuais (não corrigidos de propósito)
- **Dependências** que só saem com o upgrade do Expo SDK: `expo-router` → `query-string`/`decode-uri-component`, `postcss`, `image-size`. Novo neste teste: `ws` 7.5.10 (negação de serviço por memória), usado só pelo servidor de desenvolvimento do Metro e pelo React DevTools — não vai para o APK.
- **Sem limite de frequência** (rate limit) para mensagens, denúncias e reservas/cancelamentos. Tamanho e quantidade simultânea estão limitados, mas uma conta ainda pode mandar muitas mensagens curtas. Resolver pede Edge Function ou tabela de contagem.
- **Limite de 5 reservas ativas** é contado no trigger; duas reservas enviadas no mesmo milissegundo podem passar juntas (uma 6ª). Impacto baixo.
- **Reservas de hóspedes em cabana de anfitrião que excluiu a conta** não são canceladas automaticamente (só a cabana sai do ar). Precisam de contato pelo suporte/admin — o texto de notificação atual diria “cancelada pelo hóspede”, o que seria enganoso.
- **Exclusão de conta é lógica** (`deleted_at`): o usuário continua em `auth.users`. Para exclusão completa (LGPD), um admin deve removê-lo em Authentication → Users ou criar uma Edge Function com a `service_role`.
- **Limites de reserva** (30 noites / 365 dias / 5 ativas) e a **lista de nomes reservados** são decisões de produto que tomei como padrão seguro. Ajustem se o grupo preferir outros valores (constantes no topo das funções).
- Extensões `btree_gist`, `pg_trgm` e `uuid-ossp` no schema `public` (aviso do *Security Advisor*). Não é explorável aqui; mover exigiria recriar índices.
