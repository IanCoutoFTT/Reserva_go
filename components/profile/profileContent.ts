import {
  AlertCircle, Ban, Calendar, Clock, CreditCard, Database, Home, Info, Lock,
  Scale, Share2, ShieldCheck, Star, Target, Trash2, UserCheck, Users, Wallet,
} from 'lucide-react-native';

export type InfoSection = { icon: React.ComponentType<any>; title: string; body: string };

// PAST_TRIPS (mock de "Refúgio das Pedras"/"Cabana Suíça") removido - o
// GuestDashboard agora recebe as viagens concluídas de verdade via prop
// `pastTrips`, montada em app/(tabs)/profile.tsx a partir de
// bookingService.getBookingsByGuest (RF-008).

export const ALL_INTERESTS = [
  'Atividades ao ar livre', 'Esportes aquáticos', 'Gastronomia',
  'Vinho', 'Trilhas', 'Neve', 'Praia', 'Isolamento',
];

/** Data da última revisão dos textos abaixo. Atualize junto com qualquer mudança neles. */
export const LEGAL_UPDATED = '15 de novembro de 2026';

/**
 * Canal para o titular exercer os direitos da LGPD. Enquanto a equipe não tiver um
 * e-mail próprio do projeto, o texto aponta para o documento do TCC (nunca invente
 * um endereço). Troque por um e-mail real quando houver.
 */
export const LEGAL_CONTACT = 'a equipe do projeto ReservaGO, pelos contatos informados no documento do TCC';

// Os textos abaixo descrevem o que o app FAZ de verdade (confira com o código e o
// banco antes de mudar qualquer promessa: não prometa reembolso, criptografia ou
// recurso que não existe).
export const PRIVACY_SECTIONS: InfoSection[] = [
  {
    icon: Info,
    title: 'Sobre este projeto',
    body: 'O ReservaGO é um projeto acadêmico (Trabalho de Conclusão de Curso) em fase de testes. Os pagamentos rodam em modo de teste: nenhum dinheiro real é cobrado. Mesmo assim, tratamos seus dados com o cuidado exigido pela Lei Geral de Proteção de Dados (LGPD, Lei nº 13.709/2018).',
  },
  {
    icon: Database,
    title: 'Dados que coletamos',
    body: 'Conta: nome, e-mail e foto vindos do login com Google. Perfil: biografia, interesses e telefone, se você informar. Uso: reservas, favoritos, avaliações, mensagens, notificações e denúncias que você fizer. Anfitriões: nome completo, CPF e chave Pix, para receber os repasses. Pagamentos: valor, forma de pagamento (Pix ou cartão) e situação, sem dados de cartão.',
  },
  {
    icon: CreditCard,
    title: 'Dados de cartão',
    body: 'O ReservaGO não coleta, não vê e não guarda número de cartão, validade ou código de segurança. Eles são digitados na tela segura da Stripe, nossa processadora de pagamento, e vão direto para ela. Só recebemos de volta o resultado do pagamento.',
  },
  {
    icon: Target,
    title: 'Para que usamos seus dados',
    body: 'Para criar e manter sua conta; realizar reservas e pagamentos; permitir o contato entre hóspede e anfitrião; mostrar avaliações; repassar valores ao anfitrião; moderar anúncios e denúncias; e proteger a plataforma contra fraude e abuso. Não usamos seus dados para publicidade e nunca os vendemos.',
  },
  {
    icon: Scale,
    title: 'Base legal',
    body: 'Tratamos os dados para executar o serviço que você pediu (reservar, hospedar, pagar e receber), com o seu consentimento ao criar a conta, para cumprir obrigações legais e para a segurança e prevenção a fraudes da plataforma (art. 7º da LGPD).',
  },
  {
    icon: Share2,
    title: 'Com quem compartilhamos',
    body: 'Google (login). Supabase (hospedagem do banco de dados e dos arquivos). Stripe e provedor de Pix (pagamentos). O anfitrião vê seu nome, foto e as mensagens da sua reserva. Os administradores acessam dados para moderar anúncios e denúncias. Fora isso, não compartilhamos seus dados com terceiros.',
  },
  {
    icon: Wallet,
    title: 'Dados de recebimento dos anfitriões',
    body: 'Nome completo, CPF e chave Pix servem somente para repassar o valor das diárias. Ficam visíveis apenas para você e para o sistema de pagamento no servidor, e você é avisado por notificação sempre que eles forem criados ou alterados.',
  },
  {
    icon: Lock,
    title: 'Como protegemos',
    body: 'A comunicação usa conexão segura (HTTPS). As regras de acesso ficam no banco de dados, e não só no aplicativo: cada pessoa só lê e altera o que é seu. Valores, divisão do pagamento e confirmações são calculados no servidor, e as chaves secretas nunca estão no app. Não usamos criptografia de ponta a ponta nas mensagens. Nenhum sistema é 100% seguro, e por isso o projeto passou por rodadas de testes de segurança.',
  },
  {
    icon: Clock,
    title: 'Por quanto tempo guardamos',
    body: 'Enquanto a sua conta existir. Ao excluir a conta: seu telefone, biografia e interesses são apagados, suas cabanas saem do ar e suas reservas futuras são canceladas. Registros de reservas, pagamentos e avaliações já realizados podem ser mantidos pelo tempo necessário para segurança e obrigações legais.',
  },
  {
    icon: UserCheck,
    title: 'Seus direitos',
    body: 'Você pode confirmar que tratamos seus dados, acessá-los e baixar uma cópia (Perfil > Baixar meus dados), corrigi-los (Perfil > Editar Perfil), pedir a eliminação (Perfil > Excluir conta), saber com quem os compartilhamos e revogar o consentimento. Para os pedidos que o app ainda não faz sozinho, fale com ' + LEGAL_CONTACT + '.',
  },
  {
    icon: Users,
    title: 'Menores de idade',
    body: 'O ReservaGO é destinado a maiores de 18 anos. Não coletamos dados de menores de forma intencional.',
  },
];

export const TERMS_SECTIONS: InfoSection[] = [
  {
    icon: Info,
    title: 'Sobre o ReservaGO',
    body: 'O ReservaGO conecta hóspedes e anfitriões de cabanas e chalés. Esta é uma versão de demonstração de um projeto acadêmico: os pagamentos são de teste, os anúncios de demonstração são fictícios e nenhuma hospedagem real é garantida por esta versão.',
  },
  {
    icon: UserCheck,
    title: 'Conta e uso',
    body: 'Você entra com a sua conta Google, deve ter 18 anos ou mais e se responsabiliza por manter os seus dados verdadeiros e pelo que fizer na sua conta. É proibido usar o app para fraude, assédio, spam ou qualquer atividade ilegal.',
  },
  {
    icon: Home,
    title: 'Anfitriões e anúncios',
    body: 'Todo anúncio passa por aprovação da equipe antes de aparecer, e mudanças no texto ou nas fotos voltam para análise. O anfitrião garante que as informações são verdadeiras e responde pela segurança, pela manutenção e pela legalidade do imóvel. Para receber, precisa cadastrar os dados para receber (nome completo, CPF e chave Pix).',
  },
  {
    icon: CreditCard,
    title: 'Reservas e pagamento',
    body: 'Com o pagamento ligado, a reserva fica aguardando o pagamento por até 30 minutos. Se não for paga nesse prazo, é cancelada e as datas voltam a ficar livres. O Pix tem 5% de desconto. Você recebe um aviso ao reservar e um lembrete perto do vencimento. Do valor pago, as diárias vão para o anfitrião e a taxa de serviço fica com a plataforma.',
  },
  {
    icon: Calendar,
    title: 'Cancelamentos e reembolsos',
    body: 'O hóspede pode cancelar a reserva até o dia do check-in. Nesta versão não há reembolso automático: o valor de uma reserva já paga e depois cancelada é tratado pela equipe caso a caso. Se o hóspede não comparecer, o anfitrião pode registrar o não comparecimento depois do dia do check-in: o hóspede é avisado, a reserva não pode ser avaliada e não há devolução automática. Em caso de engano, a marcação pode ser desfeita pelo anfitrião em até 48 horas ou pela equipe.',
  },
  {
    icon: Star,
    title: 'Avaliações',
    body: 'Só avalia quem tem uma reserva sua, não cancelada, já encerrada naquela cabana, e uma avaliação por reserva. Avaliações devem ser honestas e respeitosas, e podem ser moderadas se violarem estes termos.',
  },
  {
    icon: Ban,
    title: 'Denúncias e moderação',
    body: 'Qualquer pessoa pode denunciar um anúncio ou usuário. A equipe analisa e pode reprovar anúncios e tomar as medidas cabíveis contra conteúdo que descumpra estes termos.',
  },
  {
    icon: AlertCircle,
    title: 'Responsabilidades',
    body: 'O ReservaGO é um intermediário: não é dono dos imóveis nem responde por danos, perdas ou desentendimentos entre hóspedes e anfitriões, nem por indisponibilidades do serviço, que pode ser interrompido durante os testes.',
  },
  {
    icon: ShieldCheck,
    title: 'Privacidade e mudanças',
    body: 'O tratamento dos seus dados está descrito na Política de Privacidade. Estes termos podem mudar; a data da última revisão aparece no fim desta tela. Seguem a lei brasileira.',
  },
];
