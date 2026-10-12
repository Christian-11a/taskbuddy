import { act, renderHook } from '@testing-library/react-native';
import { useSlowLoad } from '../useSlowLoad';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useSlowLoad', () => {
  it('turns on once a load has run for 8 seconds with nothing to show', () => {
    const { result } = renderHook(() => useSlowLoad(true, false));
    expect(result.current).toBe(false);

    act(() => {
      jest.advanceTimersByTime(7999);
    });
    expect(result.current).toBe(false);

    act(() => {
      jest.advanceTimersByTime(2);
    });
    expect(result.current).toBe(true);
  });

  it('uses the wait it is given instead of 8 seconds', () => {
    const { result } = renderHook(() => useSlowLoad(true, false, 1000));

    act(() => {
      jest.advanceTimersByTime(999);
    });
    expect(result.current).toBe(false);

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current).toBe(true);
  });

  it('stays off while there is data to show, however long the load runs', () => {
    const { result } = renderHook(() => useSlowLoad(true, true));

    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(result.current).toBe(false);
  });

  it('stays off when the load finishes before the wait is up', () => {
    const { result, rerender } = renderHook(
      ({ loading }: { loading: boolean }) => useSlowLoad(loading, false),
      { initialProps: { loading: true } },
    );

    act(() => {
      jest.advanceTimersByTime(4000);
    });
    rerender({ loading: false });
    act(() => {
      jest.advanceTimersByTime(60_000);
    });

    expect(result.current).toBe(false);
  });

  it('turns off as soon as data arrives, and starts the wait again for the next load', () => {
    const { result, rerender } = renderHook(
      ({ loading, hasData }: { loading: boolean; hasData: boolean }) => useSlowLoad(loading, hasData),
      { initialProps: { loading: true, hasData: false } },
    );

    act(() => {
      jest.advanceTimersByTime(8000);
    });
    expect(result.current).toBe(true);

    rerender({ loading: true, hasData: true });
    expect(result.current).toBe(false);

    rerender({ loading: true, hasData: false });
    expect(result.current).toBe(false);
    act(() => {
      jest.advanceTimersByTime(7999);
    });
    expect(result.current).toBe(false);
    act(() => {
      jest.advanceTimersByTime(2);
    });
    expect(result.current).toBe(true);
  });
});
