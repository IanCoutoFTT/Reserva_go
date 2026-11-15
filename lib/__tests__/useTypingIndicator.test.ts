import { act, renderHook } from '@testing-library/react-native';
import { shouldSendTyping, TYPING_THROTTLE_MS, TYPING_TTL_MS } from '../typing';
import { useTypingIndicator } from '../useTypingIndicator';
import * as typingService from '../../services/typingService';

// o cliente real do Supabase não cria no Node 20 (sem WebSocket nativo); estes testes não precisam dele
jest.mock('../supabase', () => ({ supabase: {} }));
jest.mock('../../services/typingService');
const mocked = typingService as jest.Mocked<typeof typingService>;

describe('shouldSendTyping', () => {
  it('só avisa de novo depois do intervalo', () => {
    expect(shouldSendTyping(0, 1000)).toBe(false);
    expect(shouldSendTyping(0, TYPING_THROTTLE_MS)).toBe(true);
    expect(shouldSendTyping(0, 99_999)).toBe(true);
  });
});

describe('useTypingIndicator', () => {
  let onOther: () => void;
  const sendTyping = jest.fn();
  const leave = jest.fn();

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-12-01T12:00:00Z'));
    jest.clearAllMocks();
    mocked.joinTyping.mockImplementation((_c, _u, cb) => {
      onOther = cb;
      return { sendTyping, leave };
    });
  });
  afterEach(() => jest.useRealTimers());

  it('sem conversa ou sem usuário não entra em canal nenhum', () => {
    renderHook(() => useTypingIndicator(null, 'u1'));
    renderHook(() => useTypingIndicator('c1', null));
    expect(mocked.joinTyping).not.toHaveBeenCalled();
  });

  it('entra no canal da conversa e sai ao desmontar', () => {
    const { unmount } = renderHook(() => useTypingIndicator('c1', 'u1'));
    expect(mocked.joinTyping).toHaveBeenCalledWith('c1', 'u1', expect.any(Function));
    unmount();
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it('a outra pessoa digitando acende o indicador e ele apaga sozinho depois do prazo', () => {
    const { result } = renderHook(() => useTypingIndicator('c1', 'u1'));
    expect(result.current.otherTyping).toBe(false);
    act(() => onOther());
    expect(result.current.otherTyping).toBe(true);
    act(() => jest.advanceTimersByTime(TYPING_TTL_MS - 100));
    expect(result.current.otherTyping).toBe(true);
    act(() => jest.advanceTimersByTime(200));
    expect(result.current.otherTyping).toBe(false);
  });

  it('novos avisos renovam o prazo', () => {
    const { result } = renderHook(() => useTypingIndicator('c1', 'u1'));
    act(() => onOther());
    act(() => jest.advanceTimersByTime(3000));
    act(() => onOther());
    act(() => jest.advanceTimersByTime(3000));
    expect(result.current.otherTyping).toBe(true);
    act(() => jest.advanceTimersByTime(2000));
    expect(result.current.otherTyping).toBe(false);
  });

  it('notifyTyping avisa a outra ponta, no máximo uma vez por intervalo', () => {
    const { result } = renderHook(() => useTypingIndicator('c1', 'u1'));
    act(() => result.current.notifyTyping());
    act(() => result.current.notifyTyping());
    act(() => result.current.notifyTyping());
    expect(sendTyping).toHaveBeenCalledTimes(1);
    act(() => jest.advanceTimersByTime(TYPING_THROTTLE_MS + 10));
    act(() => result.current.notifyTyping());
    expect(sendTyping).toHaveBeenCalledTimes(2);
  });

  it('trocar de conversa zera o indicador e entra no novo canal', () => {
    const { result, rerender } = renderHook(({ c }: { c: string }) => useTypingIndicator(c, 'u1'), { initialProps: { c: 'c1' } });
    act(() => onOther());
    expect(result.current.otherTyping).toBe(true);
    rerender({ c: 'c2' });
    expect(result.current.otherTyping).toBe(false);
    expect(leave).toHaveBeenCalledTimes(1);
    expect(mocked.joinTyping).toHaveBeenLastCalledWith('c2', 'u1', expect.any(Function));
  });
});
