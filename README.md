# ReservaGO 🏕️

Aplicativo mobile de reserva de cabanas e hospedagens desenvolvido como Projeto Final de Curso (TCC) — 7º Período.

---

## Sobre o projeto

O ReservaGO permite que usuários busquem, visualizem e reservem cabanas diretamente pelo celular. O app conta com autenticação real via Google, banco de dados em nuvem e uma interface mobile moderna inspirada no Airbnb.

O sistema suporta dois tipos de usuário:
- **Hóspede** — busca, filtra, favorita e reserva cabanas
- **Anfitrião** — cadastra e gerencia seus próprios anúncios

---

## Tecnologias utilizadas

### Frontend (Mobile)
- React Native + Expo SDK 54
- TypeScript
- Expo Router (navegação baseada em arquivos)
- Lucide React Native (ícones)
- Expo Web Browser / Expo Linking (OAuth)

### Backend / Banco de Dados
- Supabase (PostgreSQL gerenciado)
- Supabase Auth (autenticação com Google OAuth)
- Supabase Storage (imagens)
- Row Level Security (RLS) para proteção de dados

### Infraestrutura de desenvolvimento
- expo-dev-client + EAS Build (development build para testar OAuth fora do Expo Go)
- GitHub Actions (CI/CD)

---

## Pré-requisitos

Antes de rodar o projeto, instale:

- [Node.js](https://nodejs.org/) (versão 18 ou superior)
- [Git](https://git-scm.com/)
- [Expo Go](https://expo.dev/go) no celular (Android ou iOS) — suficiente pro app em geral; o login com Google exige um development build (ver seção "Autenticação")

---

## Como rodar localmente

```bash
# 1. Clonar o repositório
git clone https://github.com/JuniorPrado99/ReservaGO.git
cd ReservaGO

# 2. Instalar dependências
npm install

# 3. Criar o arquivo de variáveis de ambiente
cp .env.example .env
# Preencha o .env com as chaves do Supabase (peça ao time)

# 4. Iniciar o Expo
npx expo start --clear
```

Após iniciar, escaneie o QR Code com o Expo Go (Android) ou com a câmera (iOS).

> ⚠️ O login com Google **não funciona dentro do Expo Go** (limitação do redirecionamento OAuth do próprio Expo Go — ver `PROJETO.md`, seção 9). Pra testar esse fluxo é necessário um development build (`expo-dev-client` + EAS Build, já configurado em `eas.json`). `ngrok` não faz mais parte do fluxo atual.

---

## Variáveis de ambiente

Crie um arquivo `.env` na raiz do projeto com o seguinte conteúdo (solicite os valores ao time):

```
EXPO_PUBLIC_SUPABASE_URL=sua_url_aqui
EXPO_PUBLIC_SUPABASE_ANON_KEY=sua_chave_aqui
```

> O arquivo `.env` está no `.gitignore` e nunca deve ser commitado.

---

## Dependências principais

| Pacote | Motivo |
|--------|--------|
| `@react-native-async-storage/async-storage` | Persistência local de sessão entre aberturas do app |
| `expo-web-browser` | Abertura do browser nativo para OAuth |
| `expo-linking` | Deep links para retorno após autenticação |
| `expo-constants` | Detecção de ambiente (Expo Go vs build) |
| `react-native-url-polyfill` | Compatibilidade de URL no React Native |

Para instalar dependências nativas sempre use:
```bash
npx expo install <pacote>
```

---

## Estrutura do projeto

```
ReservaGO/
├── app/                    # Telas e rotas (Expo Router)
│   ├── (tabs)/             # Abas principais (Explorar, Favoritos, Viagens, Perfil)
│   ├── oauth-callback.tsx  # Rota de callback OAuth (Supabase Auth, PKCE)
│   ├── _layout.tsx         # Layout raiz com providers
│   ├── login.tsx           # Tela de autenticação
│   ├── details.tsx         # Detalhes da cabana + reserva
│   ├── create-listing.tsx  # Cadastro de anúncio (anfitrião)
│   └── my-cabins.tsx       # Painel do anfitrião
├── context/                # Estado global
│   ├── AuthContext.tsx     # Autenticação com Supabase + Google OAuth
│   ├── BookingContext.tsx  # Reservas do usuário
│   ├── ListingContext.tsx  # Anúncios do anfitrião
│   └── NotificationContext.tsx
├── lib/
│   └── supabase.ts         # Cliente Supabase configurado
├── components/             # Componentes reutilizáveis
├── constants/              # Cores, fontes, textos fixos
├── assets/                 # Imagens e ícones
├── .env.example            # Modelo de variáveis de ambiente
├── app.json                # Configuração do Expo (scheme: reservago)
├── package.json            # Dependências
└── tsconfig.json           # Configuração TypeScript
```

---

## Autenticação

O login é feito via **Google OAuth** integrado ao Supabase. O fluxo:

1. App abre o browser nativo via `WebBrowser.openAuthSessionAsync`
2. Usuário autentica no Google
3. Google redireciona para o Supabase (`/auth/v1/callback`)
4. Supabase redireciona para o app via deep link (`reservago://oauth-callback`)
5. App captura o token e cria a sessão
6. Trigger `handle_new_user` cria automaticamente o perfil na tabela `profiles`

---

## Banco de dados

O projeto usa **Supabase** com as seguintes tabelas principais:

| Tabela | Descrição |
|--------|-----------|
| `profiles` | Dados do usuário (nome, email, role, avatar) |
| `properties` | Cabanas cadastradas pelos anfitriões |
| `bookings` | Reservas feitas pelos hóspedes |
| `notifications` | Notificações do sistema |

---

## Testes

```bash
# Rodar toda a suíte de testes
npm test

# Modo watch (reroda ao salvar)
npm run test:watch
```

O projeto usa **Jest** (`jest-expo` + Testing Library) — hoje com 12 suítes e 62 testes, cobrindo os `context/` principais (`AuthContext`, `BookingContext`, `FavoritesContext`) e quase toda a camada `services/` de acesso ao Supabase (todos os testes mockam o Supabase, nenhum bate em rede/banco real).

---

## Equipe

| Nome | GitHub |
|------|--------|
| Junior Prado | [@JuniorPrado99](https://github.com/JuniorPrado99) |
| Arthur Caixeta | [@ArthurCaixet0](https://github.com/ArthurCaixet0) |
| Ian Couto | [@IanCoutoFTT](https://github.com/IanCoutoFTT) |

---

## Licença

MIT License — veja o arquivo [LICENSE](LICENSE) para detalhes.
