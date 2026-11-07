import { renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { useOnAppActive } from '../useOnAppActive';

type Handler = (state: string) => void;

let handler: Handler;
const remove = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_event: string, cb: Handler) => {
    handler = cb;
    return { remove };
  }) as never);
});

afterEach(() => jest.restoreAllMocks());

describe('useOnAppActive', () => {
  it('chama o callback quando o app volta do segundo plano', () => {
    const callback = jest.fn();
    renderHook(() => useOnAppActive(callback));

    handler('background');
    expect(callback).not.toHaveBeenCalled();

    handler('active');
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('também chama quando volta de "inactive" (tela bloqueada)', () => {
    const callback = jest.fn();
    renderHook(() => useOnAppActive(callback));

    handler('inactive');
    handler('active');
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('não chama repetido se o estado já era "active"', () => {
    // No celular o app já nasce "active"; no ambiente de teste esse valor vem vazio.
    Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
    const callback = jest.fn();
    renderHook(() => useOnAppActive(callback));

    handler('active');
    handler('active');
    expect(callback).not.toHaveBeenCalled();
  });

  it('usa sempre a versão mais recente do callback', () => {
    const first = jest.fn();
    const second = jest.fn();
    const { rerender } = renderHook(({ cb }: { cb: () => void }) => useOnAppActive(cb), {
      initialProps: { cb: first },
    });
    rerender({ cb: second });

    handler('background');
    handler('active');
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('não assina quando desabilitado e remove a assinatura ao desmontar', () => {
    const disabled = renderHook(() => useOnAppActive(jest.fn(), false));
    expect(AppState.addEventListener).not.toHaveBeenCalled();
    disabled.unmount();

    const enabled = renderHook(() => useOnAppActive(jest.fn(), true));
    enabled.unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
