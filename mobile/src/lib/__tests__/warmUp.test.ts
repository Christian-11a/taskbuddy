jest.mock('../api', () => ({ getApiBaseUrl: () => 'https://api.example.test' }));

/** A fresh copy of warmUp.ts, so each test starts a new launch with nothing sent yet. */
function launch(): () => void {
  let warm!: () => void;
  jest.isolateModules(() => {
    warm = (require('../warmUp') as { warmUpServer: () => void }).warmUpServer;
  });
  return warm;
}

describe('warmUpServer', () => {
  const realFetch = globalThis.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn(() => Promise.resolve({ ok: true }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    jest.useRealTimers();
  });

  it('sends one GET to the health route of the API base URL', () => {
    launch()();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/health',
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it('is a no-op after the first call in a launch', () => {
    const warm = launch();

    warm();
    warm();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never throws, when the request fails or fetch itself throws', async () => {
    fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError('Network request failed')));
    expect(() => launch()()).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));

    fetchMock.mockImplementationOnce(() => {
      throw new Error('fetch is unavailable');
    });
    expect(() => launch()()).not.toThrow();
  });

  it('does not retry a request that failed', async () => {
    fetchMock.mockImplementationOnce(() => Promise.reject(new Error('offline')));

    launch()();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up after 15 seconds, aborting the request', () => {
    jest.useFakeTimers();
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementationOnce((_url: string, init: { signal: AbortSignal }) => {
      signal = init.signal;
      return new Promise(() => undefined);
    });

    launch()();

    jest.advanceTimersByTime(14_999);
    expect(signal?.aborted).toBe(false);
    jest.advanceTimersByTime(1);
    expect(signal?.aborted).toBe(true);
  });
});
