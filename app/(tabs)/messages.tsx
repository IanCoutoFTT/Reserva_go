import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, StyleSheet, Text, View, FlatList, Image,
  TouchableOpacity, Modal, TextInput, KeyboardAvoidingView,
  Platform, ScrollView,
} from 'react-native';
import { Mail, ChevronRight, Send, X, ShieldCheck, Plus, MessageCircle } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { getBookingsByGuest } from '../../services/bookingService';
import {
  getConversations,
  getMessages,
  getOrCreateConversation,
  getUnreadConversationIds,
  markAsRead as markMessagesRead,
  sendMessage as sendMessageRemote,
  subscribeToMessages,
} from '../../services/messageService';
import { markMessageNotificationsAsRead } from '../../services/notificationService';
import { getProfilesByIds } from '../../services/profileService';
import { getOrCreateSupportConversation, getSupportAdminId } from '../../services/supportService';
import type { ConversationWithParticipants, Message as DbMessage } from '../../services/types';

type Message = {
  id: string;
  from: 'me' | 'them';
  text: string;
};

type Chat = {
  id: string;
  hostName: string;
  lastMessage: string;
  time: string;
  avatar: string | null;
  unread: boolean;
  isSupport: boolean;
  messages: Message[];
  /** true = veio do Supabase (conversations reais); ausente/false = mock local ou fallback. */
  isReal?: boolean;
};

/**
 * Anfitrião com quem o hóspede já teve reserva - opção pra "iniciar nova
 * conversa" (botão "+" da aba Mensagens). Montado a partir de
 * getBookingsByGuest (bookings.properties.owner_id), sem tabela nova: um
 * anfitrião só aparece aqui se o hóspede já reservou uma cabana dele.
 */
type HostOption = {
  hostId: string;
  hostName: string;
  avatar: string | null;
  propertyId: string;
  propertyTitle: string;
};

// Suporte é sempre local/simulado (resposta automática, sem backend/IA por
// trás - ver SUPPORT_REPLY) - fixado no topo da lista pra QUALQUER usuário,
// conectado ou não (ver loadConversations abaixo). Extraído como constante
// pra não duplicar entre o fallback (INITIAL_CHATS) e o merge com conversas
// reais.
const SUPPORT_CHAT: Chat = {
  id: 'support',
  hostName: 'Suporte ReservaGO',
  lastMessage: 'Olá! Como podemos te ajudar hoje?',
  time: 'Agora',
  avatar: null,
  unread: true,
  isSupport: true,
  messages: [
    { id: '1', from: 'them', text: 'Olá! Bem-vindo ao suporte ReservaGO. Como podemos te ajudar hoje?' },
  ],
};

// Usado só como fallback: usuário estático de dev, ou quando getConversations falha.
const INITIAL_CHATS: Chat[] = [
  SUPPORT_CHAT,
  {
    id: '1',
    hostName: 'Carlos (Cabana do Lago)',
    lastMessage: 'Olá! O check-in está liberado a partir das 14h.',
    time: '10:30',
    avatar: 'https://i.pravatar.cc/100?img=12',
    unread: true,
    isSupport: false,
    messages: [
      { id: '1', from: 'them', text: 'Olá! Seja bem-vindo à Cabana do Lago Azul! 🌿' },
      { id: '2', from: 'them', text: 'O check-in está liberado a partir das 14h.' },
    ],
  },
  {
    id: '2',
    hostName: 'Ana (Refúgio na Montanha)',
    lastMessage: 'A senha do Wi-Fi é montanha2024.',
    time: 'Ontem',
    avatar: 'https://i.pravatar.cc/100?img=5',
    unread: false,
    isSupport: false,
    messages: [
      { id: '1', from: 'them', text: 'Boa tarde! Tudo pronto para a sua chegada.' },
      { id: '2', from: 'them', text: 'A senha do Wi-Fi é montanha2024.' },
    ],
  },
];

const SUPPORT_REPLY: Message = {
  id: '',
  from: 'them',
  text: 'Obrigado por entrar em contato! Nossa equipe responderá em breve. Tempo médio: 15 minutos. 🌿',
};

function formatTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Agora';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Ontem';
  return `${days}d`;
}

/**
 * `supportAdminId` (services/supportService.ts) identifica, do lado de quem
 * é hóspede numa conversa, se o "anfitrião" dessa conversa é na verdade a
 * conta admin de suporte - nesse caso mostra "Suporte ReservaGO" em vez do
 * nome real do admin. Do lado do PRÓPRIO admin (isGuest sempre false pra
 * conversas de suporte, já que ele é o host_id), o hóspede real aparece
 * normalmente - o admin vê cada conversa como qualquer anfitrião veria.
 */
function mapConversation(
  conv: ConversationWithParticipants,
  userId: string,
  unreadIds: Set<string>,
  supportAdminId: string | null
): Chat {
  const isGuest = conv.guest_id === userId;
  const other = isGuest ? conv.host : conv.guest;
  const isSupport = isGuest && !!supportAdminId && conv.host_id === supportAdminId;
  return {
    id: conv.id,
    hostName: isSupport ? 'Suporte ReservaGO' : other?.name || 'Usuário removido',
    lastMessage: conv.last_message ?? 'Conversa iniciada',
    time: conv.last_message_at ? formatTime(conv.last_message_at) : '',
    avatar: isSupport ? null : other?.avatar_url ?? null,
    unread: unreadIds.has(conv.id),
    isSupport,
    messages: [],
    isReal: true,
  };
}

function mapMessage(m: DbMessage, userId: string): Message {
  return { id: m.id, from: m.sender_id === userId ? 'me' : 'them', text: m.content };
}

export default function MessagesScreen() {
  const { user } = useAuth();
  const { refresh: refreshNotifications } = useNotifications();
  // Aberto direto numa conversa específica (ex.: botão "Contato" em
  // app/details.tsx, que acabou de criar/achar essa conversa e já sabe o
  // id dela) - ver useEffect de auto-abertura mais abaixo.
  const { conversationId: openConversationId } = useLocalSearchParams<{ conversationId?: string }>();

  // Usuário estático (__DEV__) não existe em profiles/auth - fica só no
  // mock local, como sempre funcionou.
  const isStaticUser = !!user?.id && user.id.startsWith('static-');
  const isConnected = !!user?.id && !isStaticUser;
  // O admin de suporte não "fala com o suporte" - ele É o suporte, então não
  // recebe a entrada fixada no topo (ver loadConversations/openChat).
  const isSupportAgent = user?.role === 'admin';

  const router = useRouter();
  // Conversas de exemplo (INITIAL_CHATS) só pro login estático de teste visual.
  // Visitante vê um convite de login e usuário real vê só dados reais (ou um
  // erro com "tentar de novo") - antes todo mundo via "Carlos"/"Ana" falsos.
  const [chats, setChats] = useState<Chat[]>(isStaticUser ? INITIAL_CHATS : []);
  const [loading, setLoading] = useState(isConnected);
  const [loadError, setLoadError] = useState(false);
  const hasLoadedConversationsRef = useRef(false);
  const messagesScrollRef = useRef<ScrollView>(null);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [inputText, setInputText] = useState('');
  const activeChatIdRef = useRef<string | null>(null);
  const autoOpenedIdRef = useRef<string | null>(null);
  const autoOpenRetriedRef = useRef<string | null>(null);

  // "+" nova conversa - lista de anfitriões do histórico de reservas do
  // hóspede (ver HostOption acima).
  const [newChatVisible, setNewChatVisible] = useState(false);
  const [hostOptions, setHostOptions] = useState<HostOption[]>([]);
  const [loadingHosts, setLoadingHosts] = useState(false);
  const [startingChatId, setStartingChatId] = useState<string | null>(null);

  useEffect(() => {
    activeChatIdRef.current = activeChat?.id ?? null;
  }, [activeChat?.id]);

  // Troca de conta/modo (ex.: sair do login estático): recomeça a lista do zero.
  useEffect(() => {
    hasLoadedConversationsRef.current = false;
    setLoadError(false);
    setChats(isStaticUser ? INITIAL_CHATS : []);
  }, [user?.id, isStaticUser]);

  const loadConversations = () => {
    if (!isConnected || !user?.id) {
      setLoading(false);
      return;
    }
    // Só mostra o spinner de tela cheia na primeira carga - recarregar a cada
    // mensagem recebida (Realtime) fazia a lista inteira piscar.
    if (!hasLoadedConversationsRef.current) setLoading(true);
    Promise.all([getConversations(user.id), getUnreadConversationIds(user.id), getSupportAdminId()]).then(
      ([convResult, unreadResult, adminResult]) => {
        if (convResult.error || !convResult.data) {
          console.log('[messages] getConversations falhou ->', convResult.error);
          if (!hasLoadedConversationsRef.current) setLoadError(true);
          setLoading(false);
          return;
        }
        hasLoadedConversationsRef.current = true;
        setLoadError(false);
        const unreadIds = new Set(unreadResult.data ?? []);
        const supportAdminId = adminResult.data;
        const realChats = convResult.data.map((c) => mapConversation(c, user.id, unreadIds, supportAdminId));

        if (isSupportAgent) {
          // O admin não vê "Suporte" fixado apontando pra ele mesmo - só a
          // lista normal de conversas (cada hóspede real que já falou com o suporte).
          setChats(realChats);
          setLoading(false);
          return;
        }

        // Suporte sempre no topo, mesmo pra quem ainda não tem nenhuma
        // conversa real - antes, assim que getConversations trazia a lista
        // real (mesmo vazia), ela substituía tudo e o Suporte sumia pra
        // qualquer usuário conectado.
        //
        // A conversa de suporte já pode existir de verdade em `realChats`
        // (isSupport:true, primeiro contato feito em outra sessão) - nesse
        // caso ela toma o lugar do placeholder local. Sem conversa real
        // ainda, reaproveita o placeholder que já estava em `chats` (pra não
        // perder mensagens locais desta sessão) ou cai no SUPPORT_CHAT.
        const realSupport = realChats.find((c) => c.isSupport);
        const otherChats = realChats.filter((c) => !c.isSupport);
        setChats((prevChats) => {
          const pinnedSupport = realSupport ?? prevChats.find((c) => c.id === 'support') ?? SUPPORT_CHAT;
          return [pinnedSupport, ...otherChats];
        });
        setLoading(false);
      }
    );
  };

  useEffect(() => {
    loadConversations();
    if (!isConnected || !user?.id) return;

    const unsubscribe = subscribeToMessages(user.id, (message) => {
      if (message.conversation_id === activeChatIdRef.current) {
        setActiveChat((prev) => {
          if (!prev) return prev;
          if (prev.messages.some((m) => m.id === message.id)) return prev; // eco da própria mensagem
          return { ...prev, messages: [...prev.messages, mapMessage(message, user.id)] };
        });
        if (message.sender_id !== user.id) {
          markMessagesRead([message.id]);
          markMessageNotificationsAsRead([message.id]);
          refreshNotifications();
        }
      }
      // Recarrega a lista (last_message/hora/badge de não lida) - mais
      // simples e confiável do que remendar o estado local aqui.
      loadConversations();
    });

    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, user?.id]);

  const openChat = (chat: Chat) => {
    setChats((prev) => prev.map((c) => (c.id === chat.id ? { ...c, unread: false } : c)));

    // Primeiro toque no Suporte (ainda é só o placeholder local, "id"
    // literal 'support') - acha/cria a conversa real com o admin configurado
    // (services/supportService.ts) e a partir daí segue pelo fluxo real
    // normal, como qualquer outra conversa. Sem admin configurado ainda
    // (ou erro de rede), cai pro fallback local mesmo (mock com resposta
    // automática) em vez de travar a tela.
    if (chat.id === 'support' && !chat.isReal && isConnected && user?.id) {
      setActiveChat({ ...chat, unread: false });
      getOrCreateSupportConversation(user.id).then(({ data: conversationId, error }) => {
        if (error || !conversationId) {
          console.log('[messages] getOrCreateSupportConversation falhou, mantendo suporte local ->', error);
          return;
        }
        const realSupportChat: Chat = {
          id: conversationId,
          hostName: 'Suporte ReservaGO',
          lastMessage: '',
          time: '',
          avatar: null,
          unread: false,
          isSupport: true,
          messages: [],
          isReal: true,
        };
        setChats((prev) => prev.map((c) => (c.id === 'support' ? realSupportChat : c)));
        openChat(realSupportChat);
      });
      return;
    }

    if (!chat.isReal || !user?.id) {
      setActiveChat({ ...chat, unread: false });
      return;
    }

    setActiveChat({ ...chat, unread: false, messages: [] });

    getMessages(chat.id).then(({ data, error }) => {
      if (error || !data) {
        console.log('[messages] getMessages falhou ->', error);
        return;
      }
      const mapped = data.map((m) => mapMessage(m, user.id));
      setActiveChat((prev) => (prev && prev.id === chat.id ? { ...prev, messages: mapped } : prev));

      const unreadIncoming = data.filter((m) => m.sender_id !== user.id && !m.read_at).map((m) => m.id);
      if (unreadIncoming.length > 0) {
        markMessagesRead(unreadIncoming);
        markMessageNotificationsAsRead(unreadIncoming);
        refreshNotifications();
      }
    });
  };

  // Monta as opções de "nova conversa" a partir do histórico real de
  // reservas do hóspede (bookings.properties.owner_id) - só abre a lista
  // quando o modal é aberto, não precisa carregar isso toda vez que a aba
  // monta.
  const loadHostOptions = () => {
    if (!isConnected || !user?.id) return;
    setLoadingHosts(true);

    getBookingsByGuest(user.id).then(({ data: bookings, error }) => {
      if (error || !bookings) {
        console.log('[messages] getBookingsByGuest falhou ->', error);
        setLoadingHosts(false);
        return;
      }

      // 1 opção por anfitrião distinto (mais recente primeiro, já que
      // getBookingsByGuest ordena por check_in desc) - ignora reservas sem
      // properties embutido (cabana excluída) e o caso teórico de o próprio
      // usuário aparecer como dono.
      const byHost = new Map<string, { propertyId: string; propertyTitle: string }>();
      for (const b of bookings) {
        const p = b.properties;
        if (!p || !p.owner_id || p.owner_id === user.id) continue;
        if (!byHost.has(p.owner_id)) {
          byHost.set(p.owner_id, { propertyId: b.property_id, propertyTitle: p.title });
        }
      }

      if (byHost.size === 0) {
        setHostOptions([]);
        setLoadingHosts(false);
        return;
      }

      getProfilesByIds(Array.from(byHost.keys())).then(({ data: profiles, error: profilesError }) => {
        if (profilesError || !profiles) {
          console.log('[messages] getProfilesByIds falhou ->', profilesError);
          setLoadingHosts(false);
          return;
        }
        const options: HostOption[] = profiles.map((p) => ({
          hostId: p.id,
          hostName: p.name || 'Anfitrião',
          avatar: p.avatar_url,
          propertyId: byHost.get(p.id)!.propertyId,
          propertyTitle: byHost.get(p.id)!.propertyTitle,
        }));
        setHostOptions(options);
        setLoadingHosts(false);
      });
    });
  };

  const openNewChatModal = () => {
    setNewChatVisible(true);
    loadHostOptions();
  };

  // Acha/cria a conversa com esse anfitrião (getOrCreateConversation já
  // existe - reaproveitado aqui e no botão "Contato" de app/details.tsx) e
  // abre direto, sem precisar navegar pra fora desta tela.
  const startConversationWith = (host: HostOption) => {
    if (!user?.id || startingChatId) return;
    setStartingChatId(host.hostId);

    getOrCreateConversation(user.id, host.hostId, host.propertyId).then(({ data: conversationId, error }) => {
      setStartingChatId(null);
      if (error || !conversationId) {
        console.log('[messages] getOrCreateConversation falhou ->', error);
        return;
      }
      setNewChatVisible(false);
      openChat({
        id: conversationId,
        hostName: host.hostName,
        lastMessage: '',
        time: '',
        avatar: host.avatar,
        unread: false,
        isSupport: false,
        messages: [],
        isReal: true,
      });
      loadConversations();
    });
  };

  // Chegou aqui com ?conversationId=... (botão "Contato" em details.tsx) -
  // abre essa conversa direto, sem o usuário precisar procurar na lista.
  // Se essa tela já estava montada (aba em cache do expo-router) a lista
  // pode estar desatualizada logo na primeira tentativa - por isso recarrega
  // uma vez se não achar de primeira, antes de desistir.
  useEffect(() => {
    if (!openConversationId || autoOpenedIdRef.current === openConversationId) return;

    const chat = chats.find((c) => c.id === openConversationId);
    if (chat) {
      autoOpenedIdRef.current = openConversationId;
      openChat(chat);
      return;
    }

    if (isConnected && autoOpenRetriedRef.current !== openConversationId) {
      autoOpenRetriedRef.current = openConversationId;
      loadConversations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openConversationId, chats, isConnected]);

  const sendMessage = () => {
    const text = inputText.trim();
    if (!text || !activeChat) return;

    if (!activeChat.isReal || !user?.id) {
      // Fluxo local de sempre (mock / usuário estático)
      const newMsg: Message = { id: String(Date.now()), from: 'me', text };
      const updatedChat: Chat = {
        ...activeChat,
        messages: [...activeChat.messages, newMsg],
        lastMessage: text,
        time: 'Agora',
      };
      setActiveChat(updatedChat);
      setChats((prev) => prev.map((c) => (c.id === activeChat.id ? updatedChat : c)));
      setInputText('');

      if (activeChat.isSupport) {
        setTimeout(() => {
          const reply: Message = { ...SUPPORT_REPLY, id: String(Date.now() + 1) };
          setActiveChat((prev) => prev ? { ...prev, messages: [...prev.messages, reply] } : prev);
        }, 1200);
      }
      return;
    }

    setInputText('');
    sendMessageRemote({ conversation_id: activeChat.id, sender_id: user.id, content: text }).then(
      ({ data, error }) => {
        if (error || !data) {
          console.log('[messages] sendMessage falhou ->', error);
          // Devolve o texto pro campo (antes a mensagem sumia sem nenhum aviso).
          setInputText((current) => current || text);
          Alert.alert('Mensagem não enviada', 'Não foi possível enviar agora. Verifique sua conexão e tente de novo.');
          return;
        }
        setActiveChat((prev) => {
          if (!prev || prev.id !== activeChat.id) return prev;
          if (prev.messages.some((m) => m.id === data.id)) return prev; // já chegou via Realtime
          return { ...prev, messages: [...prev.messages, mapMessage(data, user.id)] };
        });
      }
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Mensagens</Text>
        {isConnected && (
          <TouchableOpacity style={styles.addButton} onPress={openNewChatModal}>
            <Plus size={22} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {!user ? (
        <View style={styles.emptyContainer}>
          <Mail size={48} color="#E5E7EB" />
          <Text style={styles.emptyTitle}>Entre para ver suas mensagens</Text>
          <Text style={styles.emptySub}>Faça login para conversar com anfitriões e com o suporte.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => router.push('/login')}>
            <Text style={styles.retryBtnText}>Entrar</Text>
          </TouchableOpacity>
        </View>
      ) : loading ? (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color="#2D5A27" />
        </View>
      ) : loadError ? (
        <View style={styles.emptyContainer}>
          <Mail size={48} color="#E5E7EB" />
          <Text style={styles.emptyTitle}>Não foi possível carregar</Text>
          <Text style={styles.emptySub}>Verifique sua conexão e tente novamente.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadConversations}>
            <Text style={styles.retryBtnText}>Tentar de novo</Text>
          </TouchableOpacity>
        </View>
      ) : chats.length > 0 ? (
        <FlatList
          data={chats}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.chatCard} onPress={() => openChat(item)}>
              {item.isSupport ? (
                <View style={styles.supportAvatar}>
                  <ShieldCheck size={24} color="#2D5A27" />
                </View>
              ) : (
                <Image source={{ uri: item.avatar ?? undefined }} style={styles.avatar} />
              )}

              <View style={styles.chatContent}>
                <View style={styles.chatHeader}>
                  <Text style={[styles.hostName, item.isSupport && { color: '#2D5A27' }]}>
                    {item.hostName}
                    {item.isSupport && '  ✓'}
                  </Text>
                  <Text style={styles.time}>{item.time}</Text>
                </View>
                <Text
                  style={[styles.message, item.unread && styles.unreadText]}
                  numberOfLines={1}
                >
                  {item.lastMessage}
                </Text>
              </View>

              {item.unread && <View style={styles.unreadDot} />}
              <ChevronRight size={18} color="#E5E7EB" />
            </TouchableOpacity>
          )}
        />
      ) : (
        <View style={styles.emptyContainer}>
          <Mail size={48} color="#E5E7EB" />
          <Text style={styles.emptyTitle}>Nenhuma mensagem ainda</Text>
          <Text style={styles.emptySub}>
            Quando você reservar um lugar, as conversas com os anfitriões aparecerão aqui.
          </Text>
        </View>
      )}

      <Modal visible={!!activeChat} animationType="slide" onRequestClose={() => setActiveChat(null)}>
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: '#fff' }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <View style={styles.chatModalHeader}>
            <TouchableOpacity onPress={() => setActiveChat(null)}>
              <X size={24} color="#1F2937" />
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.chatModalTitle}>{activeChat?.hostName}</Text>
              {activeChat?.isSupport && (
                <Text style={styles.chatModalSub}>Equipe oficial ReservaGO</Text>
              )}
            </View>
            {activeChat?.isSupport ? (
              <View style={styles.supportAvatarSm}>
                <ShieldCheck size={18} color="#2D5A27" />
              </View>
            ) : (
              <Image source={{ uri: activeChat?.avatar ?? undefined }} style={styles.chatModalAvatar} />
            )}
          </View>

          <ScrollView
            ref={messagesScrollRef}
            contentContainerStyle={styles.messagesList}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => messagesScrollRef.current?.scrollToEnd({ animated: false })}
          >
            {activeChat?.messages.map((msg) => (
              <View
                key={msg.id}
                style={[styles.bubble, msg.from === 'me' ? styles.bubbleMe : styles.bubbleThem]}
              >
                <Text style={msg.from === 'me' ? styles.bubbleTextMe : styles.bubbleTextThem}>
                  {msg.text}
                </Text>
              </View>
            ))}
          </ScrollView>

          <View style={styles.inputBar}>
            <TextInput
              style={styles.messageInput}
              placeholder="Digite uma mensagem..."
              value={inputText}
              onChangeText={setInputText}
              multiline
            />
            <TouchableOpacity style={styles.sendBtn} onPress={sendMessage}>
              <Send size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={newChatVisible} animationType="slide" onRequestClose={() => setNewChatVisible(false)}>
        <View style={{ flex: 1, backgroundColor: '#fff' }}>
          <View style={styles.chatModalHeader}>
            <TouchableOpacity onPress={() => setNewChatVisible(false)}>
              <X size={24} color="#1F2937" />
            </TouchableOpacity>
            <Text style={[styles.chatModalTitle, { marginLeft: 12 }]}>Nova conversa</Text>
          </View>

          {loadingHosts ? (
            <View style={styles.emptyContainer}>
              <ActivityIndicator size="large" color="#2D5A27" />
            </View>
          ) : hostOptions.length > 0 ? (
            <FlatList
              data={hostOptions}
              keyExtractor={(item) => item.hostId}
              contentContainerStyle={{ paddingVertical: 8 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.chatCard}
                  disabled={!!startingChatId}
                  onPress={() => startConversationWith(item)}
                >
                  {item.avatar ? (
                    <Image source={{ uri: item.avatar }} style={styles.avatar} />
                  ) : (
                    <View style={styles.supportAvatar}>
                      <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#2D5A27' }}>
                        {item.hostName.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={styles.chatContent}>
                    <Text style={styles.hostName}>{item.hostName}</Text>
                    <Text style={styles.message} numberOfLines={1}>
                      Sobre: {item.propertyTitle}
                    </Text>
                  </View>
                  {startingChatId === item.hostId ? (
                    <ActivityIndicator size="small" color="#2D5A27" />
                  ) : (
                    <ChevronRight size={18} color="#E5E7EB" />
                  )}
                </TouchableOpacity>
              )}
            />
          ) : (
            <View style={styles.emptyContainer}>
              <MessageCircle size={48} color="#E5E7EB" />
              <Text style={styles.emptyTitle}>Nenhum anfitrião ainda</Text>
              <Text style={styles.emptySub}>
                Você poderá iniciar uma conversa assim que fizer sua primeira reserva.
              </Text>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  retryBtn: { marginTop: 20, backgroundColor: '#2D5A27', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  retryBtnText: { color: '#fff', fontWeight: 'bold' },
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { fontSize: 26, fontWeight: 'bold', color: '#1F2937' },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2D5A27',
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatCard: {
    flexDirection: 'row',
    padding: 16,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F9FAFB',
  },
  avatar: { width: 52, height: 52, borderRadius: 26, marginRight: 12 },
  supportAvatar: {
    width: 52, height: 52, borderRadius: 26, marginRight: 12,
    backgroundColor: '#F0F7F0', justifyContent: 'center', alignItems: 'center',
  },
  chatContent: { flex: 1 },
  chatHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  hostName: { fontSize: 15, fontWeight: 'bold', color: '#1F2937' },
  time: { fontSize: 12, color: '#9CA3AF' },
  message: { fontSize: 14, color: '#6B7280' },
  unreadText: { color: '#1F2937', fontWeight: '600' },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#2D5A27', marginRight: 10 },
  chatModalHeader: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    backgroundColor: '#fff',
  },
  chatModalTitle: { fontSize: 16, fontWeight: 'bold', color: '#1F2937' },
  chatModalSub: { fontSize: 12, color: '#2D5A27' },
  chatModalAvatar: { width: 40, height: 40, borderRadius: 20 },
  supportAvatarSm: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#F0F7F0', justifyContent: 'center', alignItems: 'center',
  },
  messagesList: { padding: 16, paddingBottom: 20 },
  bubble: {
    maxWidth: '75%',
    padding: 12,
    borderRadius: 16,
    marginBottom: 10,
  },
  bubbleMe: {
    alignSelf: 'flex-end',
    backgroundColor: '#2D5A27',
    borderBottomRightRadius: 4,
  },
  bubbleThem: {
    alignSelf: 'flex-start',
    backgroundColor: '#F3F4F6',
    borderBottomLeftRadius: 4,
  },
  bubbleTextMe: { color: '#fff', fontSize: 14, lineHeight: 20 },
  bubbleTextThem: { color: '#1F2937', fontSize: 14, lineHeight: 20 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    gap: 10,
    backgroundColor: '#fff',
  },
  messageInput: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2D5A27',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#374151', marginTop: 15 },
  emptySub: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginTop: 8 },
});
