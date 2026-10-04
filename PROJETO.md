# ReservaGO — Documentação do Projeto

Este arquivo documenta a estrutura real deste projeto, escrito a partir da leitura direta do código-fonte em 2026-08-21 — não do README, que contém informações desatualizadas (ver seção "Divergências conhecidas").

**Nota (2026-08-28):** as seções 1 a 7 abaixo descrevem o estado do código em 21/08 — várias telas foram conectadas ao Supabase depois disso. O estado atual e verificado (tela a tela, RF a RF) está em `docs/material-tcc.md` (gerado em 22/08, mais novo que este arquivo). A seção 8 já foi revisada nesta data e os itens resolvidos estão marcados com **[RESOLVIDA]**.

## Visão geral

ReservaGO é um app mobile (Expo + React Native) de reserva de cabanas/hospedagens, tipo Airbnb, com três perfis de usuário: `hospede`, `anfitriao`, `admin`. TCC de 7º período.

**Estado real do projeto (em 21/08/2026):** o front-end estava funcional com dados estáticos/locais, e nenhuma tela usava o Supabase de fato. **Isso mudou depois desta data** — hoje **10 de 10** requisitos funcionais (RF) já leem/escrevem no Supabase de verdade, através da camada `services/` (RF-008, o último que faltava, fechado em 04/09/2026 na branch `feature/perfil-admin`). Ver `docs/material-tcc.md`, seções 2 e 5, para o status atual tela a tela.

---

## 1. Stack e versões exatas

Lido de `package.json` / `app.json` / `tsconfig.json`:

| Item | Versão |
|---|---|
| Expo SDK | ~54.0.33 |
| expo-router | ~6.0.23 (file-based routing, `typedRoutes` habilitado em `app.json`) |
| React | 19.1.0 |
| React Native | 0.81.5 |
| React DOM | 19.1.0 |
| TypeScript | ~5.9.2 (`strict: true`, path alias `@/*` → raiz) |
| @supabase/supabase-js | ^2.105.4 |
| @react-native-async-storage/async-storage | 2.2.0 |
| react-native-reanimated | ~4.1.1 |
| react-native-worklets | 0.5.1 |
| lucide-react-native | ^1.7.0 (biblioteca de ícones usada nas telas novas) |
| @expo/vector-icons (FontAwesome) | ^15.0.3 (usado só na tab bar e no login) |
| expo-image-picker | ~17.0.11 |
| newArchEnabled | `true` (New Architecture do RN ligada em `app.json`) |
| scheme (deep link) | `reservago` |

Sem back-end próprio em Node — o único "backend" é o Supabase (projeto gerenciado, configurado via variáveis de ambiente).

---

## 2. Como rodar o projeto (PowerShell / Windows)

```powershell
# 1. Instalar dependências
npm install

# 2. Criar o arquivo de variáveis de ambiente (NÃO existe .env.example no repo — ver Divergências)
New-Item -Path .env -ItemType File
# Edite o .env manualmente com:
#   EXPO_PUBLIC_SUPABASE_URL=...
#   EXPO_PUBLIC_SUPABASE_ANON_KEY=...

# 3. Iniciar o Expo
npx expo start --clear

# 4. Rodar em plataforma específica (opcional, com o Metro já rodando)
npm run android
npm run ios
npm run web
```

> ⚠️ `npm test` **não funciona** hoje — não há script `test` no `package.json` nem a dependência `jest`. Ver Divergências.

> O login com Google OAuth mencionado no README (`ngrok http 127.0.0.1:8081`) não é necessário para rodar o app atualmente, porque o login real ainda não está implementado — ver seção 8.

---

## 3. Estrutura de pastas e papel de cada uma

```
ReservaGO/
├── app/                     # Rotas (Expo Router — cada arquivo = uma tela)
│   ├── _layout.tsx          # Layout raiz: monta os 5 Providers de contexto + Stack navigator
│   ├── (tabs)/               # Grupo de rotas da tab bar inferior
│   │   ├── _layout.tsx      # Configuração das 5 abas (Tabs.Screen)
│   │   ├── index.tsx        # Aba "Explorar" — home, busca, filtros, carrosséis por categoria
│   │   ├── favorites.tsx    # Aba "Favoritos"
│   │   ├── bookings.tsx     # Aba "Viagens" — reservas do usuário
│   │   ├── messages.tsx     # Aba "Mensagens" — chat (mock local, sem Supabase)
│   │   └── profile.tsx      # Aba "Perfil" — dashboard por role, editar perfil, privacidade/termos
│   ├── --/oauth-callback.tsx # Rota de callback OAuth (nome de pasta literal "--" — ver Divergências)
│   ├── login.tsx            # Tela de login (autenticação estática, ver seção 5)
│   ├── select-role.tsx      # Escolher hóspede/anfitrião (+ backdoor admin com 10 taps)
│   ├── details.tsx          # Detalhes da cabana + fluxo de reserva (datas → pagamento)
│   ├── create-listing.tsx   # Formulário de cadastro de cabana (anfitrião)
│   ├── my-cabins.tsx        # Painel do anfitrião — lista/edita/exclui cabanas
│   ├── admin-dashboard.tsx  # Painel admin — estatísticas, aprovações, denúncias, destaques (tudo mock)
│   ├── notifications.tsx    # Tela de notificações com filtro por tipo
│   ├── modal.tsx            # Modal placeholder do template padrão do Expo Router
│   ├── +not-found.tsx       # Tela 404
│   └── +html.tsx            # Configuração do HTML raiz (build web)
├── context/                 # Estado global via React Context (ver seção 5)
├── components/              # Componentes reutilizáveis
│   ├── PropertyCard.tsx     # Card de cabana (usado em index/favorites)
│   ├── ExternalLink.tsx     # Link que abre browser in-app (template Expo)
│   ├── useColorScheme(.web).ts / useClientOnlyValue(.web).ts  # Helpers do template Expo Router
│   └── __tests__/StyledText-test.js  # Teste quebrado — ver Divergências
├── constants/
│   ├── Colors.ts            # Paleta light/dark usada pela tab bar (tint = #2D5A27)
│   └── Properties.ts        # Lista de cabanas hardcoded, ÓRFÃ/não usada — ver Divergências
├── lib/
│   └── supabase.ts          # Client Supabase (auto-refresh e persistência de sessão DESLIGADOS)
├── supabase/
│   └── schema.sql           # Schema completo do banco (tabelas, triggers, RLS) — fonte da verdade do banco
├── assets/                  # Fontes e imagens (ícone, splash)
├── app.json, package.json, tsconfig.json
└── .env                     # Variáveis do Supabase (gitignored, não versionar)
```

---

## 4. Contexts existentes (`context/`)

Todos são providers React puros, montados em `app/_layout.tsx` nesta ordem: `AuthProvider > BookingProvider > FavoritesProvider > NotificationProvider > ListingProvider`.

| Context | O que gerencia | Persistência | Conectado ao Supabase? |
|---|---|---|---|
| `AuthContext.tsx` | Login/logout, `user` atual, troca de role (`updateRole`), exclusão de conta | Só em memória (`useState`) — some ao recarregar o app | **Não.** 3 usuários hardcoded (`admin@reservago.com`, `hospede@reservago.com`, `anfitriao@reservago.com`, senha `1234` para todos) |
| `BookingContext.tsx` | Lista de reservas do usuário logado (`addBooking`, `cancelBooking`) | `AsyncStorage`, chave `@reservago:bookings:<userId>` | Não |
| `FavoritesContext.tsx` | IDs de cabanas favoritadas (`toggleFavorite`) | `AsyncStorage`, chave `@reservago:favorites:<userId>` | Não |
| `ListingContext.tsx` | Catálogo de cabanas (`listings`/`allProperties`, `addListing`, `removeListing`, `updateListing`) | Só em memória — 8 cabanas hardcoded em `INITIAL_PROPERTIES`, resetam ao recarregar | Não |
| `NotificationContext.tsx` | Notificações do usuário (`markAsRead`, `markAllAsRead`, `addNotification`) | Só em memória — 8 notificações hardcoded | Não |

---

## 5. Banco de dados (`supabase/schema.sql`)

### Tabelas

| Tabela | Papel |
|---|---|
| `profiles` | Extensão de `auth.users` (nome, email, avatar, `role`, bio, interesses, soft-delete via `deleted_at`) |
| `properties` | Cabanas anunciadas (título, descrição, localização, preço, `isolation_level`, categoria/subcategoria, imagens, amenidades, rating, status de moderação `cabin_status`) |
| `bookings` | Reservas (check-in/check-out, `nights` gerado automaticamente, forma de pagamento, desconto PIX, status) |
| `favorites` | Relação usuário ↔ propriedade favoritada (unique) |
| `reviews` | Avaliações (nota 1–5, vinculada a uma `booking`, unique por `booking_id + author_id`) |
| `conversations` / `messages` | Chat entre hóspede e anfitrião |
| `notifications` | Notificações por usuário, com referências opcionais a `property/booking/message` |
| `reports` | Denúncias (de propriedade e/ou usuário), com status de moderação |

### Enums

`user_role` (hospede/anfitriao/admin), `booking_status` (reservada/realizada/cancelada), `pay_method` (pix/card), `notification_type` (reserva/mensagem/promocao/aviso), `isolation_level` (urbano/semi/isolado/extremo), `report_status` (pendente/em_analise/resolvido/arquivado), `cabin_status` (ativo/pendente/suspenso/inativo).

### Triggers e funções

- `handle_new_user()` → cria `profiles` automaticamente ao criar usuário em `auth.users`.
- `update_updated_at()` → atualiza `updated_at` em `profiles`, `properties`, `bookings`.
- `update_property_bookings_count()` → recalcula `properties.bookings_count` a cada mudança em `bookings`.
- `update_property_rating()` → recalcula `rating`/`reviews_count` de `properties` a cada mudança em `reviews`.
- `update_conversation_last_message()` → atualiza `last_message`/`last_message_at` da conversa a cada nova mensagem.
- `create_notification(...)` → função auxiliar genérica para inserir notificações.
- `notify_host_on_booking()` → notifica anfitrião (nova reserva) e ambas as partes (cancelamento).
- `notify_on_message()` → notifica o destinatário de uma nova mensagem.
- `notify_admins_on_report()` → notifica todos os admins ao criar uma denúncia.
- `handle_report_resolution()` → notifica o anfitrião quando uma denúncia sobre sua propriedade é resolvida.
- `get_unread_notifications_count(p_user_id)`, `mark_all_notifications_read(p_user_id)`, `is_property_available(...)` → funções auxiliares de uso direto pelo app (ainda não chamadas no código).

### RLS

RLS habilitado em todas as tabelas. Padrão geral: leitura pública restrita a dados "ativos"/próprios; escrita restrita ao dono do recurso; admin com acesso amplo via checagem de `profiles.role = 'admin'`. Buckets de Storage: `avatars` e `properties` (públicos).

Realtime habilitado para `messages`, `notifications`, `bookings`.

---

## 6. Convenções de nomenclatura observadas no código

- **Arquivos de tela**: `kebab-case.tsx` (`create-listing.tsx`, `my-cabins.tsx`, `admin-dashboard.tsx`); telas de tab em `app/(tabs)/` usam nome simples (`index`, `bookings`).
- **Componentes/Contexts**: `PascalCase.tsx` (`PropertyCard.tsx`, `AuthContext.tsx`).
- **Hooks customizados**: `useX` exportado junto do respectivo Context (`useAuth`, `useListings`, `useBookings`, `useFavorites`, `useNotifications`).
- **Estilos**: sempre `StyleSheet.create` no fim do arquivo, objeto chamado `styles`.
- **Cor de marca**: verde `#2D5A27` usado direto em várias telas (não centralizado em `constants/Colors.ts` de forma consistente — só a tab bar usa o arquivo de constantes).
- **Strings/dados de negócio**: em português (`'reservada'`, `'hospede'`, `'anfitriao'`), consistente entre schema SQL e front-end.
- **IDs mock**: prefixo por categoria nos dados estáticos de `ListingContext` (`p1`/`p2`... para praia, `c1`.. para campo, `w1`.. para cachoeira, "w" de waterfall/cachoeira).
- **AsyncStorage**: chaves padronizadas como `` `@reservago:<recurso>:<userId>` ``.

---

## 7. Quais telas já usam Supabase e quais ainda usam dados estáticos

| Tela/arquivo | Usa Supabase? | Fonte real dos dados |
|---|---|---|
| `app/--/oauth-callback.tsx` | **Sim** — único arquivo do app que importa `lib/supabase.ts` (`supabase.auth.exchangeCodeForSession`) | — |
| `app/login.tsx` | Não | `AuthContext` (lista `STATIC_USERS` hardcoded) |
| `app/select-role.tsx` | Não | `AuthContext.updateRole` (memória) |
| `app/(tabs)/index.tsx` | Não | `ListingContext.allProperties` (memória) |
| `app/(tabs)/favorites.tsx` | Não | `FavoritesContext` (AsyncStorage) + `ListingContext` |
| `app/(tabs)/bookings.tsx` | Não | `BookingContext` (AsyncStorage) + `ListingContext` |
| `app/(tabs)/messages.tsx` | Não | Estado local do componente (`INITIAL_CHATS` hardcoded, chat simulado com timeout) |
| `app/(tabs)/profile.tsx` | Não | `AuthContext` + dados hardcoded (`PAST_TRIPS`, estatísticas fixas 4.9/12/2023) |
| `app/details.tsx` | Não | Parâmetros de rota + `BookingContext.addBooking`; reviews (`REVIEWS`), anfitrião e comodidades (`AMENITIES`) hardcoded |
| `app/create-listing.tsx` | Não | `ListingContext.addListing` (memória, não persiste) |
| `app/my-cabins.tsx` | Não | `ListingContext.listings` |
| `app/admin-dashboard.tsx` | Não | Tudo mock local (`stats`, `pendingCabins`, `topCabins`, `reports`) — nenhum botão de ação tem efeito real |
| `app/notifications.tsx` | Não | `NotificationContext` (memória) |

**Resumo:** o Supabase está configurado (`lib/supabase.ts`) e o schema está pronto, mas **0 telas de fato leem/escrevem nas tabelas do banco**. Todo o app roda hoje sobre dados estáticos ou `AsyncStorage` local.

---

## 8. Divergências e inconsistências encontradas (ver também a mensagem de resumo enviada ao usuário)

Estes pontos devem ser considerados antes de qualquer nova implementação nesta área, para não repetir os mesmos problemas:

1. **README desatualizado**: descreve login real via Google OAuth + Supabase Auth, mas `AuthContext.tsx` é 100% estático.
2. **Tabela `listings` citada no README não existe** — o schema real chama essa tabela de `properties`.
3. **[RESOLVIDA] Rota de callback OAuth inconsistente**: pasta `app/--/` (nome literal `--`) gerava a rota `/--/oauth-callback`, incompatível com `reservago://oauth-callback`. Corrigida no commit `a1573ec` ("feat: implement Google OAuth flow", 21/08/2026): o arquivo virou `app/oauth-callback.tsx` (rota de nível superior, sem a pasta `--`), e `Linking.createURL('oauth-callback')` em `app/login.tsx` já gera o path certo automaticamente a partir da nova localização. **Atenção**: sobrou um comentário desatualizado em `app/login.tsx` (~linha 72) citando o path antigo com `--`; e a allowlist de Redirect URLs do Supabase (checklist da seção 9) ainda lista `exp://<IP>:8081/--/oauth-callback` — vale conferir no painel do Supabase se o path novo (sem `--`) também está cadastrado, ou o login pelo Expo Go em Android pode falhar por esse motivo (separado do bloqueio de iOS já documentado).
4. **[RESOLVIDA] `constants/Properties.ts` era código morto**: definia uma lista `PROPERTIES` não importada por nenhuma tela. O arquivo foi **removido** do projeto — confirmado, não existe mais em `constants/`.
5. **[RESOLVIDA] `app/my-cabins.tsx` lia `cabin.bookingsCount`** sem esse campo existir na interface `Listing`. Hoje `mapPropertyToCabinRow()` (`app/my-cabins.tsx`, linhas 12-29) mapeia `bookingsCount` a partir de `bookings_count` (coluna real, mantida pelo trigger `update_property_bookings_count`), vindo de `propertyService.getPropertiesByHost`. "Ganhos estimados" e "Reservas ativas" já refletem dado real.
6. **[RESOLVIDA] `app/details.tsx` chamava `addBooking(id, { ..., hostId })`** com tipo incompatível em `BookingContext.tsx`. O fluxo mudou: a reserva real hoje é feita por `createBooking()` de `services/bookingService.ts` (chamado em `app/details.tsx`, linha 247); `BookingContext.addBooking` (usado só no fallback local/offline) não declara mais `hostId` — sem incompatibilidade de tipos (`tsc --noEmit` roda limpo).
7. **[RESOLVIDA] `npm test` não funcionava**: configurado no commit `9aa9c82` ("test: configura Jest (jest-expo + Testing Library) e conserta npm test", 22/08/2026). `package.json` tem `"test": "jest"`, com `jest` 29.7.0 + `jest-expo` + Testing Library. Hoje: **12 suítes, 62 testes, todos passando**.
8. **[RESOLVIDA] `.env.example` não existia** no repositório. Criado em 22/08/2026 — hoje existe na raiz do projeto.
9. **[RESOLVIDA] Reorganização de rotas** que estava em andamento — hoje consolidada: `app/(tabs)/` com as 5 abas (`index`, `favorites`, `bookings`, `messages`, `profile`), `app/details.tsx` fora do grupo de abas, sem arquivos soltos remanescentes na raiz de `app/`.
10. **[RESOLVIDA] PKCE caía em `code_challenge_method=plain` em vez de `s256`** (warning no console: `WebCrypto API is not supported. Code challenge method will default to use plain instead of sha256.`). Causa exata, conferida em `node_modules/@supabase/auth-js/dist/main/lib/helpers.js` (`generatePKCEChallenge`): o SDK checa `typeof crypto.subtle !== 'undefined'` pra decidir entre `s256` e `plain`. Investigação mais funda em 03/09/2026 revelou que **o global `crypto` não existe de jeito nenhum** nesse runtime (não só `.subtle` — `typeof globalThis.crypto` loga `"undefined"`); o SDK não travava porque já tem um fallback interno com `Math.random()` pra gerar o `code_verifier` sem `crypto`. Resolvido com `lib/cryptoPolyfill.ts` (novo): polyfill de `crypto.getRandomValues` + `crypto.subtle.digest('SHA-256')` em JavaScript puro (sem dependência nativa nova, sem precisar de build), instalado só no momento do login (`app/login.tsx`, dentro de `handleGoogleLogin`) pra não interferir com nenhuma inicialização anterior do app. Tem auto-teste do SHA-256 contra os vetores de teste oficiais na inicialização; só ativa se o teste passar. Confirmado funcionando: `code_challenge_method=s256` real no `signInWithOAuth`.
11. **[RESOLVIDA] Escalação de privilégio via `profiles.role`** — até a correção abaixo, um usuário autenticado qualquer conseguia gravar `role='admin'` na própria linha de `profiles` via um `UPDATE` comum (a policy `profiles_self_update` original só checava `auth.uid() = id`, sem `WITH CHECK` nenhum restringindo colunas/valores). Isso virou risco real quando `AuthContext.updateRole` passou a gravar a role de verdade no banco (antes só trocava em memória) — e havia um backdoor de UI em `select-role.tsx` (10 toques no título liberava um botão "Acesso Admin") que chamava esse `updateRole` sem nenhuma checagem.
    - **Correção aplicada no banco** (`supabase/migrations/001_fix_profiles_self_update_role_escalation.sql`, já rodada no SQL Editor do Supabase e sincronizada em `supabase/schema.sql`): a policy `profiles_self_update` ganhou um `WITH CHECK (auth.uid() = id AND role = (SELECT role FROM profiles WHERE id = auth.uid()))` — ou seja, **`UPDATE` direto na tabela nunca muda `profiles.role`, pra nenhum valor**, nem entre `hospede`/`anfitriao`. A única forma sancionada de um usuário trocar a **própria** role é a function nova `set_own_role(new_role)` (`SECURITY DEFINER`), que recusa `'admin'` com `RAISE EXCEPTION`.
    - **No app**: `services/profileService.ts` (`updateRole`) chama `supabase.rpc('set_own_role', { new_role: role })` — nunca mais um `.update({ role })` direto (confirmado por grep em todo o projeto: os únicos outros `.update()` em `profiles` são `updateProfile` — que já exclui `role` no próprio tipo TS — e `deleteAccount`, que só grava `deleted_at`). `context/AuthContext.tsx` chama `profileService.updateRole(role)` (sem `id` — a function só afeta `auth.uid()`).
    - O backdoor de 10 toques foi **removido** de `select-role.tsx` — a tela só oferece `hospede`/`anfitriao`.
    - **Promover alguém a `admin` continua sendo só manual no banco** (`UPDATE profiles SET role='admin' WHERE id = '<uuid>'` direto no SQL Editor, com a service role ou como superusuário — o `WITH CHECK` da policy de self-update não bloqueia isso porque quem roda o `UPDATE` manual no SQL Editor não passa pela RLS de `authenticated`). Não existe (de propósito) nenhuma function ou tela que promova outro usuário a admin pelo app.
    - Teste cobrindo o contrato: `services/__tests__/profileService.test.ts` confirma que `updateRole` chama o RPC e nunca `.from('profiles').update(...)`.
12. **[RESOLVIDA] RF-007 (login Google) travava sempre no "Concluindo login com Google…"** — esse era o bug de verdade por trás do bloqueio, não a limitação do Expo Go (essa continua real, mas é outra coisa — ver seção 9). Causa raiz, achada em 03/09/2026 depurando num development build Android real (EAS + emulador Android 14, não Expo Go): `supabase.auth.exchangeCodeForSession()` espera **só o código de autorização** (ex.: `'34e770dd-9ff9-...'`), não a URL de retorno inteira — ver o exemplo na própria tipagem do SDK (`node_modules/@supabase/auth-js/dist/main/GoTrueClient.d.ts`, linha ~605). Tanto `app/login.tsx` quanto `app/oauth-callback.tsx` chamavam `exchangeCodeForSession(url)` passando a URL `reservago://oauth-callback?code=xxx` inteira como se fosse o código — o servidor sempre respondia `"invalid flow state, no valid flow state found"` porque a URL inteira não batia com nenhum `flow_state` real (o código em si sempre esteve certo: confirmado isolando o problema com uma troca manual via `curl`, direto no endpoint `/auth/v1/token?grant_type=pkce`, usando o código extraído manualmente — deu HTTP 200 com sessão completa).
    - **Correção**: os dois arquivos agora extraem o `code` da URL (regex `/[?&]code=([^&]+)/` + `decodeURIComponent`) antes de chamar `exchangeCodeForSession`.
    - `app/login.tsx` faz a troca direto ali (na resposta de `WebBrowser.openAuthSessionAsync`), em vez de depender só de `app/oauth-callback.tsx` pegar a URL depois via `useURL()` — no Android, a tela de callback pode montar (via deep link do SO) antes desse retorno estar disponível pra ela, e `useURL()` fica `null` pra sempre, travando a tela no spinner independentemente do bug do código. `app/oauth-callback.tsx` recebeu a mesma correção, pra continuar funcionando se o app for aberto via deep link externo.
    - Validado de ponta a ponta: login completo com conta Google real, sessão criada, perfil carregado (nome/e-mail/avatar do Google), sessão persistindo entre reinícios do app.
    - Aviso paralelo, não bloqueante, registrado pra referência futura: `expo-secure-store` loga `"Value being stored in SecureStore is larger than 2048 bytes"` ao salvar a sessão (o token JWT + metadados do usuário passam do limite). Funcionou e persistiu mesmo assim (testado), mas o próprio aviso diz que uma versão futura do SDK pode lançar erro em vez de só avisar — se isso quebrar um dia, a solução padrão é um adapter tipo "LargeSecureStore" (chave simétrica pequena no SecureStore, valor grande de verdade no AsyncStorage).

---

## 9. Development Build — por que o Expo Go não serve pro login com Google

Investigado e confirmado na branch `feature/oauth-google`: o fluxo de login com Google via
`WebBrowser.openAuthSessionAsync` abre a URL de autorização do Supabase normalmente e o Google
autentica — mas o redirect de volta pra `exp://<ip>:8081/--/oauth-callback` falha, com o erro
"Safari não pode abrir a página porque não pode se conectar ao servidor". Foi conferido e
descartado: Supabase acessível, provider Google configurado corretamente, `reservago://oauth-callback`
já cadastrado na allowlist de Redirect URLs, `flowType: 'pkce'` correto em `lib/supabase.ts`. A
causa é uma limitação do próprio **Expo Go no iOS**: quem está registrado no sistema operacional
pra receber esse deep link é o app Expo Go, não o ReservaGO — a `ASWebAuthenticationSession` do
iOS não consegue devolver o controle pro app de forma confiável nesse cenário.

**[VALIDADO em 03/09/2026]** Gerado o development build Android via EAS e testado num emulador
(Android 14, `Pixel_5` API 34): o login com Google **completa de ponta a ponta** nesse ambiente —
sessão real criada, perfil carregado. Achado nesse processo um bug real e separado que também
travava o login (item 12 da seção 8, já corrigido) — não era só a limitação do Expo Go. iOS
continua pendente (sem conta Apple Developer, ver abaixo).

**Solução: testar o login com Google num development build (`expo-dev-client`), não no Expo Go.**
Com um dev build, o app roda com o scheme próprio (`reservago://`) registrado de verdade no
sistema — o mesmo scheme que `app/login.tsx` já gera via `Linking.createURL('oauth-callback')`
(isso não exige nenhuma mudança de código: em Expo Go resolve pra `exp://IP:8081/--/oauth-callback`,
num dev build resolve direto pra `reservago://oauth-callback`).

### ⚠️ iOS pendente — sem conta Apple Developer

Não há conta Apple Developer Program (paga) neste projeto. Build de development/internal
distribution pra iPhone físico exige registrar o UDID do aparelho, o que exige essa conta. Por
isso o `eas.json` está configurado só com `android` nos profiles `development`/`preview` — **a
validação do fluxo de OAuth vai ser feita em Android primeiro**. O build iOS (e a confirmação
final de que o dev build resolve o bug relatado no iPhone do Junior) fica pendente até haver uma
conta Apple Developer Program disponível.

### Como gerar e instalar o dev build Android (PowerShell)

```powershell
# 1. Login na conta Expo/EAS (uma vez só, por máquina)
npx eas-cli login

# 2. Gerar o build de desenvolvimento (perfil "development" do eas.json, Android/.apk)
npx eas-cli build --profile development --platform android

# 3. Quando o build terminar, baixar e instalar o .apk pelo link/QR code que o EAS mostra

# 4. Rodar o Metro apontando pro dev build (não pro Expo Go)
npx expo start --dev-client --clear
```

### Checklist da allowlist do Supabase (Authentication → URL Configuration → Redirect URLs)

- `reservago://oauth-callback` — necessário pro dev build / build de produção. **Já cadastrado.**
- `exp://<IP-da-máquina>:8081/--/oauth-callback` — só serve pra testar o resto do app no Expo Go
  (não o login Google). Muda toda vez que o IP da rede muda.

---

## 10. Requisitos do TCC — numeração oficial

Esta numeração vem do documento oficial do TCC (não deste repositório), confirmada em 2026-08-22.
Registrada aqui como referência canônica, pra não haver divergência de numeração. O status de cada
um (conectado/mock/bloqueado) é o que muda ao longo do desenvolvimento — ver `docs/material-tcc.md`
para o status atualizado; esta tabela é só a numeração/texto, que não muda.

### Requisitos Funcionais (RF)

| ID | Requisito |
|---|---|
| RF-001 | Explorar hospedagens por categoria (praia, campo, cachoeira) |
| RF-002 | Buscar hospedagens por nome, localização ou tipo de ambiente |
| RF-003 | Visualizar detalhes da hospedagem com fotos, preço e descrição |
| RF-004 | Realizar reservas diretamente pelo aplicativo |
| RF-005 | Salvar hospedagens como favoritas |
| RF-006 | Enviar e receber mensagens entre hóspedes e anfitriões |
| RF-007 | Fazer login com conta Google |
| RF-008 | Editar perfil e trocar foto de perfil |
| RF-009 | Avaliar hospedagens após estadia |
| RF-010 | Administradores gerenciarem denúncias e aprovações de anúncios |

### Requisitos Não Funcionais (RNF)

| ID | Requisito |
|---|---|
| RNF-001 | Usabilidade — acessível a diferentes níveis de familiaridade |
| RNF-002 | Manter dados locais (reservas e favoritos) mesmo offline |
| RNF-003 | Garantir segurança básica de autenticação e login |
| RNF-004 | Carregar rapidamente, evitar travamentos (meta < 300ms) |
| RNF-005 | Consistência visual entre modo claro e escuro |
| RNF-006 | Comunicação confiável e rastreável entre usuários |
| RNF-007 | Preparado para integração com banco de dados Supabase |

---

## 11. Convenções ao mexer no projeto

- Nunca inventar nomes de tabelas ou colunas — conferir sempre no `supabase/schema.sql`.
- Comandos de terminal são em PowerShell (Windows).
- Strings de negócio em português (`'reservada'`, `'hospede'`, `'anfitriao'`), consistente entre o schema SQL e o front-end.
