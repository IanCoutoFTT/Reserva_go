# ReservaGO — Material para o Documento do TCC

> Escrito em 2026-08-22 a partir da leitura direta do código-fonte na branch
> `feature/oauth-google` (não do README, que ainda descreve um estado antigo
> do projeto — ver `PROJETO.md`, seção "Divergências"). Todo o conteúdo abaixo
> descreve o que **existe de fato no código**, não o que foi planejado.
>
> As seções 5 e 6 usam a numeração oficial de RF/RNF do documento do TCC
> (ver `PROJETO.md`, seção "Requisitos do TCC — numeração oficial").
>
> **Atualizado em 2026-09-04** (branch `feature/perfil-admin`): RF-008
> (editar perfil) fechado — era o único RF ainda não conectado ao Supabase,
> ver seção 5. Painel admin também ganhou ranking real, histórico de
> aprovações e destaques reais nessa mesma branch.

---

## 1. Estrutura de pastas

```
ReservaGO/
├── app/                          # Rotas (Expo Router — cada arquivo/pasta = uma tela)
│   ├── (tabs)/                   # Grupo de rotas da tab bar inferior
│   │   ├── _layout.tsx           # Configuração das 5 abas
│   │   ├── index.tsx             # Aba "Explorar" — busca, filtros, carrosséis (Supabase)
│   │   ├── favorites.tsx         # Aba "Favoritos" (Supabase + cache AsyncStorage)
│   │   ├── bookings.tsx          # Aba "Viagens" — reservas reais + locais (Supabase + fallback)
│   │   ├── messages.tsx          # Aba "Mensagens" (Supabase + Realtime)
│   │   └── profile.tsx           # Aba "Perfil" (edição conectada ao Supabase - RF-008, 04/09/2026)
│   ├── oauth-callback.tsx        # Callback do fluxo de login com Google (Supabase Auth, PKCE)
│   ├── login.tsx                 # Login (Google real + fallback estático em __DEV__)
│   ├── select-role.tsx           # Escolha hóspede/anfitrião (grava via RPC set_own_role)
│   ├── details.tsx               # Detalhes da cabana + fluxo de reserva (Supabase)
│   ├── review.tsx                # Avaliar uma estadia concluída (Supabase)
│   ├── create-listing.tsx        # Cadastro E edição de cabana pelo anfitrião (Supabase + upload de imagem)
│   ├── my-cabins.tsx             # Painel do anfitrião — lista, edita, exclui (soft delete), status de aprovação
│   ├── admin-dashboard.tsx       # Painel admin — estatísticas, aprovações, denúncias (Supabase)
│   ├── notifications.tsx         # Notificações (Supabase + Realtime)
│   ├── +not-found.tsx, +html.tsx # Utilitários do template Expo Router
│   └── _layout.tsx               # Layout raiz: SafeAreaProvider + 5 Providers + Stack navigator
├── context/                      # Estado global via React Context — 5 contexts (ver seção 2)
├── components/                   # Componentes reutilizáveis
│   ├── PropertyCard.tsx, Themed.tsx, StyledText.tsx
│   ├── explorer/                 # Pedaços extraídos de app/(tabs)/index.tsx (SearchHeader, FilterModal, constantes)
│   ├── profile/                  # Pedaços extraídos de app/(tabs)/profile.tsx (MenuItem, InfoModal, EditProfileModal, GuestDashboard)
│   └── __tests__/                # Testes de componente
├── services/                     # ★ Camada de acesso ao Supabase — toda query do app passa por aqui
│   ├── types.ts                  # Enums, interfaces de linha por tabela, ServiceResult<T>
│   ├── propertyService.ts        # CRUD completo (incl. update/delete) + upload de imagem (Storage)
│   ├── bookingService.ts         # Disponibilidade (RPC), criar/listar/cancelar reservas
│   ├── reviewService.ts          # Criar/listar avaliações, checar duplicidade
│   ├── favoriteService.ts        # Favoritar/desfavoritar, listar
│   ├── notificationService.ts    # Notificações + RPCs do banco + assinatura Realtime
│   ├── messageService.ts         # Conversas/mensagens + assinatura Realtime
│   ├── profileService.ts         # Perfil, troca de role (via RPC), exclusão de conta (soft delete)
│   ├── adminService.ts           # Estatísticas, aprovação de anúncios, denúncias
│   └── __tests__/                # Testes de service (mock do Supabase) - todos exceto messageService
├── lib/
│   └── supabase.ts               # Client Supabase único (SecureStore, PKCE, validação de env vars)
├── constants/
│   └── Colors.ts                 # Paleta light/dark
├── supabase/
│   ├── schema.sql                # Schema completo do banco — fonte da verdade
│   ├── seed.sql                  # Dados de desenvolvimento (não aplicado automaticamente)
│   └── migrations/               # Migrações versionadas (ex.: correção de RLS)
├── .github/workflows/ci.yml      # CI — type-check + testes a cada push/PR
├── docs/
│   └── material-tcc.md           # Este arquivo
├── assets/                       # Fontes e imagens
├── app.json, eas.json            # Config do Expo e do EAS Build (dev client)
├── .env.example                  # Template das variáveis de ambiente necessárias
└── PROJETO.md                    # Documentação viva da estrutura do projeto
```

**Novidade central desta fase**: a pasta `services/`, que centraliza 100% do acesso ao Supabase.
Nenhuma tela importa `lib/supabase.ts` diretamente — toda leitura/escrita no banco passa por uma
função de `services/`, com retorno uniforme `{ data, error }`.

---

## 2. Contexts (`context/`) — são 5, não 4

Providers React puros, montados em `app/_layout.tsx` nesta ordem:
`AuthProvider > BookingProvider > FavoritesProvider > NotificationProvider > ListingProvider`.

| Context | O que gerencia | Persistência | Conectado ao Supabase? |
|---|---|---|---|
| `AuthContext` | Sessão do usuário (login Google real via Supabase Auth + fallback estático em `__DEV__`), troca de role, exclusão de conta | SecureStore (sessão) via SDK | **Sim** — login, perfil e troca de role (via RPC `set_own_role`) |
| `BookingContext` | Reservas feitas **localmente** (usuário estático, ou fallback quando o Supabase falha) | AsyncStorage | Indiretamente — é o "modo offline/fallback"; reservas reais vivem no banco, lidas via `bookingService` direto pelas telas |
| `FavoritesContext` | Cabanas favoritadas | AsyncStorage como cache offline | **Sim** — via `favoriteService`, com fallback pro cache local |
| `ListingContext` | Catálogo de cabanas **local** (8 hardcoded) — usado como fallback quando `propertyService` falha ou o usuário é estático | Memória | Não — é o fallback da tela Explorar e do painel do anfitrião |
| `NotificationContext` | Notificações do usuário | Memória (mock) / Supabase quando conectado | **Sim** — via `notificationService`, com Realtime e `refresh()` exposto pra outras telas |

---

## 3. Estratégia de testes

**Ferramentas**: `jest` (29.7.0) com o preset `jest-expo` (54.0.18, alinhado ao Expo SDK 54) +
`@testing-library/react-native` (13.3.3, compatível com React 19/`react-test-renderer` 19.1.0
já usados no projeto) + `@types/jest`.

**Por que Testing Library e não `react-test-renderer` puro**: o teste original do template
(`react-test-renderer.create(...).toJSON()`) "passava" com um snapshot `null` — o Scheduler
assíncrono do React 19 ainda não tinha comitado a árvore no momento do `toJSON()`. Testing Library
usa `act()` internamente e resolve isso corretamente.

**Cobertura atual**: 11 suítes de teste, 53 testes, 0 pendências (`it.todo`).

| Suíte | O que cobre |
|---|---|
| `components/__tests__/StyledText-test.js` | Renderização do componente `MonoText` |
| `components/__tests__/PropertyCard.test.tsx` | Renderização, toque no favorito (sem navegar), toque no card (navega pra `/details`) |
| `context/__tests__/AuthContext.test.tsx` | Estado inicial sem sessão, login com role correta, login inválido, logout |
| `context/__tests__/BookingContext.test.tsx` | Criar reserva válida, rejeitar `check_out <= check_in`, persistência com desconto Pix, persistência por usuário, cancelamento |
| `context/__tests__/FavoritesContext.test.tsx` | Adicionar/remover favorito, persistência por usuário |
| `services/__tests__/profileService.test.ts` | Confirma que a troca de role usa o RPC `set_own_role` e nunca um `UPDATE` direto |
| `services/__tests__/propertyService.test.ts` | CRUD completo, upload de imagem, `approveProperty` mapeando pra `ativo`/`inativo` |
| `services/__tests__/bookingService.test.ts` | `checkAvailability` usa o RPC `is_property_available` (não reimplementa a lógica no client), `getBookingsByHost` via `properties!inner` |
| `services/__tests__/reviewService.test.ts` | Criar/listar (com embed de autor), `hasReviewed` |
| `services/__tests__/favoriteService.test.ts` | Adicionar/remover/checar favorito |
| `services/__tests__/notificationService.test.ts` | RPCs do banco (`get_unread_notifications_count`, `mark_all_notifications_read`), assinatura Realtime com filtro server-side |

Todo acesso ao Supabase nos testes é mockado (`jest.mock('@supabase/supabase-js', ...)` e o mock
oficial de `@react-native-async-storage/async-storage`) — nenhum teste bate em rede ou em banco real.

**Como executar**:
```powershell
npm test              # roda a suíte inteira uma vez
npm run test:watch    # modo watch, reroda ao salvar
```

**Lacuna conhecida**: `messageService.ts` ainda não tem teste próprio (não foi pedido explicitamente
nesta fase). Os outros 6 arquivos de service estão cobertos.

---

## 4. Pipeline de CI/CD

`.github/workflows/ci.yml`, executa em todo `push` e `pull_request`:

1. `actions/checkout@v4`
2. `actions/setup-node@v4` — Node 20, com cache de `npm`
3. `npm ci` — instalação limpa a partir do `package-lock.json`
4. `npx tsc --noEmit` — type-check completo do projeto
5. `npm test -- --ci` — roda a suíte de testes em modo CI (não escreve snapshots novos silenciosamente; snapshot divergente = falha)

Não há, até o momento, um job de build/deploy automatizado (nem publicação em loja, nem build EAS
via CI) — o pipeline cobre só qualidade de código (tipos + testes).

---

## 5. Requisitos Funcionais (RF) — status real

| ID | Requisito (texto oficial do TCC) | Status | Onde |
|---|---|---|---|
| RF-001 | Explorar hospedagens por categoria (praia, campo, cachoeira) | ✅ Conectado ao Supabase | `app/(tabs)/index.tsx` → `propertyService.getProperties()` |
| RF-002 | Buscar hospedagens por nome, localização ou tipo de ambiente | ✅ Conectado ao Supabase | `app/(tabs)/index.tsx` — busca por título/localização (`ilike`) + filtro por nível de isolamento, sobre dados reais |
| RF-003 | Visualizar detalhes da hospedagem com fotos, preço e descrição | ✅ Conectado ao Supabase | `app/details.tsx` → `propertyService.getPropertyById()` |
| RF-004 | Realizar reservas diretamente pelo aplicativo | ✅ Conectado ao Supabase | `app/details.tsx` → `bookingService.checkAvailability()` + `createBooking()`, desconto PIX 5% mantido |
| RF-005 | Salvar hospedagens como favoritas | ✅ Conectado ao Supabase | `FavoritesContext` → `services/favoriteService.ts`. AsyncStorage virou cache offline (não mais fonte única) |
| RF-006 | Enviar e receber mensagens entre hóspedes e anfitriões | ✅ Conectado ao Supabase | `app/(tabs)/messages.tsx` → `messageService` (conversas, histórico, envio, Realtime com dedupe, marca como lida ao abrir) |
| RF-007 | Fazer login com conta Google | ✅ Conectado ao Supabase, validado de ponta a ponta | `app/login.tsx`, `app/oauth-callback.tsx`, `AuthContext` — Supabase Auth (PKCE) num development build Android real (EAS + emulador). Bug corrigido em 03/09/2026: `exchangeCodeForSession` esperava só o código de autorização, não a URL de retorno inteira — ver `PROJETO.md`, item 12. Continua verdade que o Expo Go não serve pra esse fluxo (seção 9 do `PROJETO.md`) — só o dev build funciona |
| RF-008 | Editar perfil e trocar foto de perfil | ✅ Conectado ao Supabase (branch `feature/perfil-admin`, 04/09/2026) | `app/(tabs)/profile.tsx` → `profileService.updateProfile()` grava nome/bio/interesses; foto sobe pro bucket `avatars` via nova `profileService.uploadAvatar()` (mesmo padrão de `uploadPropertyImage`). `AuthContext` passou a carregar `bio/interests/phone/created_at` de `profiles` e ganhou `refreshUser()`. `GuestDashboard` trocou os 3 números fixos ("Avaliação 4.9/Viagens 12/Membro desde 2023", iguais pra qualquer hóspede) por dados reais (avaliações escritas, reservas concluídas, ano de cadastro) |
| RF-009 | Avaliar hospedagens após estadia | ✅ Conectado ao Supabase | `app/review.tsx`, botão "Avaliar" em `app/(tabs)/bookings.tsx`, reviews reais exibidas em `app/details.tsx` |
| RF-010 | Administradores gerenciarem denúncias e aprovações de anúncios | ✅ Conectado ao Supabase | `app/admin-dashboard.tsx` → `adminService` — estatísticas, aprovação de anúncios e denúncias reais. Ranking de mais reservadas (`getTopProperties`), histórico Aprovadas/Reprovadas e toggle de destaque (`setFeatured`, coluna `properties.featured`) conectados em 04/09/2026 (branch `feature/perfil-admin`) — só a Explorar ainda não *consome* `featured` pro hóspede ver (deliberadamente fora do escopo dessa branch) |

**Resumo**: 10 de 10 requisitos funcionais conectados ao Supabase de ponta a ponta (RF-008 fechado em
04/09/2026, branch `feature/perfil-admin`, junto com o ranking/histórico/destaques reais do painel
admin). Pendência conhecida, fora do escopo de RF: a tela Explorar ainda não usa `properties.featured`
pra destacar cabanas pro hóspede — só o lado admin (marcar/desmarcar) está pronto.

---

## 6. Requisitos Não Funcionais (RNF) — status real

| ID | Requisito (texto oficial do TCC) | Status | Evidência |
|---|---|---|---|
| RNF-001 | Usabilidade — acessível a diferentes níveis de familiaridade | ⚠️ Parcial | Loading/erro/vazio tratados nas telas conectadas ao Supabase (Explorar, Detalhes, Anfitrião, Avaliações, Admin); ausente nas telas ainda não conectadas (Mensagens, Notificações, Favoritos, Perfil) |
| RNF-002 | Manter dados locais (reservas e favoritos) mesmo offline | ✅ Implementado | `BookingContext` e `FavoritesContext` guardam AsyncStorage como cache offline; ambos sincronizam com o Supabase quando online e caem pro cache local quando a query falha ou o usuário é o estático de dev |
| RNF-003 | Garantir segurança básica de autenticação e login | ✅ Implementado, com uma ressalva conhecida | RLS habilitado em todas as tabelas; migração fechando escalação de privilégio via `profiles.role` (troca de role só via RPC `set_own_role`); segredos fora do versionamento. Ressalva: PKCE usa `code_challenge_method=plain` em vez de `s256` por limitação do runtime RN/Hermes (não bloqueante, documentado em `PROJETO.md`) |
| RNF-004 | Carregar rapidamente, evitar travamentos (meta < 300ms) | ⚠️ Não medido formalmente | Filtros da Explorar memoizados (`useMemo`); banco com índices (`gin`/`trgm` para busca textual, `btree` para preço/status/isolamento) — mas sem testes de carga ou medição de tempo de resposta feitos até agora |
| RNF-005 | Consistência visual entre modo claro e escuro | ❌ Não implementado de fato | `constants/Colors.ts` define paletas light/dark e `components/Themed.tsx` existe, mas a maioria das telas usa cores fixas (`#2D5A27` etc.) direto no `StyleSheet`, não os tokens de tema — não há alternância funcional de tema no app |
| RNF-006 | Comunicação confiável e rastreável entre usuários | ✅ Implementado | Chat real (RF-006) com Realtime (mensagens chegam na hora, com dedupe do eco da própria mensagem), leitura marcada por mensagem (`read_at`) e integrada ao contador de notificações |
| RNF-007 | Preparado para integração com banco de dados Supabase | ✅ Implementado | Schema completo com RLS, camada `services/` isolando todo acesso a dados, client único em `lib/supabase.ts`, seed de dados de exemplo (`supabase/seed.sql`) |

---

## 7. Tecnologias em uso (real, a partir de `package.json`)

| Categoria | Tecnologia | Versão |
|---|---|---|
| Framework | Expo SDK | ~54.0.33 |
| Roteamento | expo-router (file-based) | ~6.0.23 |
| UI | React | 19.1.0 |
| UI | React Native | 0.81.5 |
| Linguagem | TypeScript (`strict: true`) | ~5.9.2 |
| Backend / BaaS | Supabase (`@supabase/supabase-js`) — Auth, Postgres, Storage, Realtime | ^2.105.4 |
| Autenticação | Supabase Auth (OAuth Google, fluxo PKCE) | — |
| Persistência local | `@react-native-async-storage/async-storage` (reservas/favoritos locais) | 2.2.0 |
| Persistência de sessão | `expo-secure-store` | ~15.0.8 |
| Ícones | `lucide-react-native` (telas novas) + `@expo/vector-icons` (tab bar/login) | ^1.7.0 / ^15.0.3 |
| Seleção de imagem | `expo-image-picker` | ~17.0.11 |
| Navegador in-app / deep link | `expo-web-browser`, `expo-linking` | ~15.0.11 / ~8.0.11 |
| Animações/gestos | `react-native-reanimated`, `react-native-worklets`, `react-native-screens`, `react-native-safe-area-context` | ~4.1.1 / 0.5.1 / ~4.16.0 / ~5.6.0 |
| Build nativo (dev/preview) | `expo-dev-client` + EAS Build | ~6.0.21 |
| Testes | `jest`, `jest-expo`, `@testing-library/react-native`, `@types/jest` | 29.7.0 / 54.0.18 / 13.3.3 / ^29.5.9 |
| CI | GitHub Actions | — |
| Web (suporte, não é o foco do produto) | `react-native-web`, Metro bundler | ~0.21.0 |

**Removido da lista em relação a documentações antigas** (README/anteprojeto, se citavam):
`ngrok` — chegou a ser necessário num fluxo de OAuth anterior (túnel local), mas o fluxo atual usa
deep link nativo (`reservago://` em dev build, `exp://` no Expo Go) e não depende mais dele.
