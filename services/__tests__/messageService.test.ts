jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: { onAuthStateChange: jest.fn(), signOut: jest.fn() },
    from: jest.fn(),
    channel: jest.fn(),
    removeChannel: jest.fn(),
    getChannels: jest.fn(() => []),
  })),
}));

import { supabase } from '../../lib/supabase';
import {
  getConversations,
  getMessages,
  getOrCreateConversation,
  getUnreadConversationIds,
  markAsRead,
  sendMessage,
  subscribeToMessages,
} from '../messageService';

function makeBuilder(result: { data: any; error: any }): any {
  const builder: any = {
    select: jest.fn(() => builder),
    insert: jest.fn(() => builder),
    update: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    neq: jest.fn(() => builder),
    is: jest.fn(() => builder),
    in: jest.fn(() => builder),
    or: jest.fn(() => builder),
    order: jest.fn(() => builder),
    limit: jest.fn(() => builder),
    single: jest.fn(() => Promise.resolve(result)),
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

const mockFrom = supabase.from as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('messageService.getConversations', () => {
  it('embute guest/host de profiles (duas FKs - guest_id e host_id) e filtra por participante', async () => {
    const builder = makeBuilder({ data: [{ id: 'c1' }], error: null });
    mockFrom.mockReturnValue(builder);

    const result = await getConversations('user-1');

    expect(mockFrom).toHaveBeenCalledWith('conversations');
    expect(builder.select).toHaveBeenCalledWith(
      '*, guest:profiles!conversations_guest_id_fkey(name, avatar_url), host:profiles!conversations_host_id_fkey(name, avatar_url)'
    );
    expect(builder.or).toHaveBeenCalledWith('guest_id.eq.user-1,host_id.eq.user-1');
    expect(result).toEqual({ data: [{ id: 'c1' }], error: null });
  });

  it('propaga erro do banco', async () => {
    mockFrom.mockReturnValue(makeBuilder({ data: null, error: { message: 'timeout' } }));

    const result = await getConversations('user-1');

    expect(result).toEqual({ data: null, error: 'timeout' });
  });
});

describe('messageService.getMessages', () => {
  it('filtra por conversation_id, mais antigas primeiro', async () => {
    const builder = makeBuilder({ data: [{ id: 'm1' }, { id: 'm2' }], error: null });
    mockFrom.mockReturnValue(builder);

    const result = await getMessages('conv-1');

    expect(mockFrom).toHaveBeenCalledWith('messages');
    expect(builder.eq).toHaveBeenCalledWith('conversation_id', 'conv-1');
    expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: true });
    expect(result.data).toHaveLength(2);
  });
});

describe('messageService.sendMessage', () => {
  it('insere a mensagem com conversation_id/sender_id/content', async () => {
    const builder = makeBuilder({ data: { id: 'm1', content: 'Oi!' }, error: null });
    mockFrom.mockReturnValue(builder);

    const result = await sendMessage({ conversation_id: 'conv-1', sender_id: 'user-1', content: 'Oi!' });

    expect(builder.insert).toHaveBeenCalledWith({ conversation_id: 'conv-1', sender_id: 'user-1', content: 'Oi!' });
    expect(result.data).toEqual({ id: 'm1', content: 'Oi!' });
  });

  it('propaga erro do banco', async () => {
    mockFrom.mockReturnValue(makeBuilder({ data: null, error: { message: 'RLS negou' } }));

    const result = await sendMessage({ conversation_id: 'conv-1', sender_id: 'user-1', content: 'Oi!' });

    expect(result).toEqual({ data: null, error: 'RLS negou' });
  });
});

describe('messageService.subscribeToMessages', () => {
  it('assina INSERT em messages e devolve uma função de unsubscribe que chama removeChannel', () => {
    const mockOn = jest.fn();
    const mockSubscribe = jest.fn();
    const fakeChannel: any = { on: mockOn, subscribe: mockSubscribe };
    mockOn.mockReturnValue(fakeChannel);
    mockSubscribe.mockReturnValue(fakeChannel);
    (supabase.channel as jest.Mock).mockReturnValue(fakeChannel);
    (supabase.getChannels as jest.Mock).mockReturnValue([]);

    const callback = jest.fn();
    const unsubscribe = subscribeToMessages('user-1', callback);

    expect(supabase.channel).toHaveBeenCalledWith('messages:user-1');
    expect(mockOn).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({ event: 'INSERT', schema: 'public', table: 'messages' }),
      expect.any(Function)
    );
    expect(mockSubscribe).toHaveBeenCalled();

    // O callback passado pro .on() precisa repassar payload.new pro callback do chamador.
    const onHandler = mockOn.mock.calls[0][2];
    onHandler({ new: { id: 'm1', content: 'Oi!' } });
    expect(callback).toHaveBeenCalledWith({ id: 'm1', content: 'Oi!' });

    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
    expect(supabase.removeChannel).toHaveBeenCalledWith(fakeChannel);
  });

  it('remove um channel remanescente do mesmo tópico antes de assinar de novo (bug real: effect roda sem o cleanup anterior ter sido chamado, ex. depois do app voltar do navegador externo do login Google - supabase-js reaproveita o channel já existente e .on() nele depois de já assinado quebra)', () => {
    const staleChannel: any = { topic: 'realtime:messages:user-1' };
    (supabase.getChannels as jest.Mock).mockReturnValue([staleChannel]);

    const mockOn = jest.fn();
    const fakeChannel: any = { on: mockOn };
    mockOn.mockReturnValue(fakeChannel);
    fakeChannel.subscribe = jest.fn(() => fakeChannel);
    (supabase.channel as jest.Mock).mockReturnValue(fakeChannel);

    subscribeToMessages('user-1', jest.fn());

    expect(supabase.getChannels).toHaveBeenCalled();
    expect(supabase.removeChannel).toHaveBeenCalledWith(staleChannel);
  });

  it('não mexe em channels de outros tópicos', () => {
    const otherChannel: any = { topic: 'realtime:messages:outro-user' };
    (supabase.getChannels as jest.Mock).mockReturnValue([otherChannel]);

    const mockOn = jest.fn();
    const fakeChannel: any = { on: mockOn };
    mockOn.mockReturnValue(fakeChannel);
    fakeChannel.subscribe = jest.fn(() => fakeChannel);
    (supabase.channel as jest.Mock).mockReturnValue(fakeChannel);

    subscribeToMessages('user-1', jest.fn());

    expect(supabase.removeChannel).not.toHaveBeenCalledWith(otherChannel);
  });
});

describe('messageService.markAsRead', () => {
  it('grava read_at nos ids passados', async () => {
    const builder = makeBuilder({ data: [{ id: 'm1' }], error: null });
    mockFrom.mockReturnValue(builder);

    await markAsRead(['m1', 'm2']);

    expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({ read_at: expect.any(String) }));
    expect(builder.in).toHaveBeenCalledWith('id', ['m1', 'm2']);
  });

  it('lista vazia não bate no banco', async () => {
    const result = await markAsRead([]);

    expect(mockFrom).not.toHaveBeenCalled();
    expect(result).toEqual({ data: [], error: null });
  });
});

describe('messageService.getOrCreateConversation', () => {
  it('acha uma conversa já existente (guest+host+cabana) e não tenta criar outra', async () => {
    const findBuilder = makeBuilder({ data: [{ id: 'conv-existing' }], error: null });
    mockFrom.mockReturnValueOnce(findBuilder);

    const result = await getOrCreateConversation('guest-1', 'host-1', 'prop-1');

    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(findBuilder.eq).toHaveBeenCalledWith('guest_id', 'guest-1');
    expect(findBuilder.eq).toHaveBeenCalledWith('host_id', 'host-1');
    expect(findBuilder.eq).toHaveBeenCalledWith('property_id', 'prop-1');
    expect(findBuilder.limit).toHaveBeenCalledWith(1);
    expect(result).toEqual({ data: 'conv-existing', error: null });
  });

  it('sem conversa existente, cria uma nova e devolve o id dela', async () => {
    const findBuilder = makeBuilder({ data: [], error: null });
    const insertBuilder = makeBuilder({ data: { id: 'conv-new' }, error: null });
    mockFrom.mockReturnValueOnce(findBuilder).mockReturnValueOnce(insertBuilder);

    const result = await getOrCreateConversation('guest-1', 'host-1');

    expect(insertBuilder.insert).toHaveBeenCalledWith({
      guest_id: 'guest-1',
      host_id: 'host-1',
      property_id: null,
    });
    expect(result).toEqual({ data: 'conv-new', error: null });
  });

  it('propaga erro da busca sem tentar criar', async () => {
    const findBuilder = makeBuilder({ data: null, error: { message: 'falha de conexão' } });
    mockFrom.mockReturnValueOnce(findBuilder);

    const result = await getOrCreateConversation('guest-1', 'host-1');

    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ data: null, error: 'falha de conexão' });
  });

  it('propaga erro da criação (ex.: RLS ainda sem a policy de INSERT)', async () => {
    mockFrom
      .mockReturnValueOnce(makeBuilder({ data: [], error: null }))
      .mockReturnValueOnce(makeBuilder({ data: null, error: { message: 'new row violates row-level security policy' } }));

    const result = await getOrCreateConversation('guest-1', 'host-1');

    expect(result).toEqual({ data: null, error: 'new row violates row-level security policy' });
  });
});

describe('messageService.getUnreadConversationIds', () => {
  it('filtra mensagens recebidas (sender != userId) e ainda não lidas (read_at null), sem duplicar conversation_id', async () => {
    const builder = makeBuilder({
      data: [{ conversation_id: 'c1' }, { conversation_id: 'c1' }, { conversation_id: 'c2' }],
      error: null,
    });
    mockFrom.mockReturnValue(builder);

    const result = await getUnreadConversationIds('user-1');

    expect(builder.neq).toHaveBeenCalledWith('sender_id', 'user-1');
    expect(builder.is).toHaveBeenCalledWith('read_at', null);
    expect(result.data).toEqual(['c1', 'c2']);
  });
});
