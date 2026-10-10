import { BackHandler } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import { isBackBlockedByScreen, useLeaveGuard } from '../useLeaveGuard';

function backPressHandlers(spy: jest.SpyInstance) {
  return spy.mock.calls
    .filter(([eventName]) => eventName === 'hardwareBackPress')
    .map(([, handler]) => handler);
}

describe('useLeaveGuard', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('leaves at once when nothing is unsaved', () => {
    const onLeave = jest.fn();
    const { result } = renderHook(() => useLeaveGuard(false, onLeave));

    act(() => result.current.requestLeave());

    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(result.current.asking).toBe(false);
  });

  it('asks first when something is unsaved, and keeps editing on request', () => {
    const onLeave = jest.fn();
    const { result } = renderHook(() => useLeaveGuard(true, onLeave));

    act(() => result.current.requestLeave());
    expect(result.current.asking).toBe(true);
    expect(onLeave).not.toHaveBeenCalled();

    act(() => result.current.keepEditing());
    expect(result.current.asking).toBe(false);
    expect(onLeave).not.toHaveBeenCalled();
  });

  it('leaves once the person discards the changes', () => {
    const onLeave = jest.fn();
    const { result } = renderHook(() => useLeaveGuard(true, onLeave));

    act(() => result.current.requestLeave());
    act(() => result.current.leave());

    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(result.current.asking).toBe(false);
  });

  it('takes Android back only while something is unsaved', () => {
    const remove = jest.fn();
    const add = jest
      .spyOn(BackHandler, 'addEventListener')
      .mockImplementation(() => ({ remove }) as unknown as ReturnType<typeof BackHandler.addEventListener>);
    const onLeave = jest.fn();
    const { result, rerender } = renderHook(
      ({ dirty }: { dirty: boolean }) => useLeaveGuard(dirty, onLeave),
      { initialProps: { dirty: false } },
    );
    expect(backPressHandlers(add)).toHaveLength(0);

    rerender({ dirty: true });
    const [handler] = backPressHandlers(add);
    let handled: boolean | null | undefined = false;
    act(() => {
      handled = handler();
    });

    expect(handled).toBe(true);
    expect(result.current.asking).toBe(true);
    expect(onLeave).not.toHaveBeenCalled();

    rerender({ dirty: false });
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('reports that back is blocked only while something is unsaved', () => {
    const { rerender, unmount } = renderHook(
      ({ dirty }: { dirty: boolean }) => useLeaveGuard(dirty, jest.fn()),
      { initialProps: { dirty: false } },
    );
    expect(isBackBlockedByScreen()).toBe(false);

    rerender({ dirty: true });
    expect(isBackBlockedByScreen()).toBe(true);

    rerender({ dirty: false });
    expect(isBackBlockedByScreen()).toBe(false);

    rerender({ dirty: true });
    unmount();
    expect(isBackBlockedByScreen()).toBe(false);
  });

  it('stays blocked until every form with unsaved changes has let go', () => {
    const first = renderHook(() => useLeaveGuard(true, jest.fn()));
    const second = renderHook(() => useLeaveGuard(true, jest.fn()));

    first.unmount();
    expect(isBackBlockedByScreen()).toBe(true);

    second.unmount();
    expect(isBackBlockedByScreen()).toBe(false);
  });
});
