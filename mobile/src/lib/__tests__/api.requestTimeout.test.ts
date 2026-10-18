import { api, ApiError, configureApiAuth } from '../api';

/**
 * rawRequest has a 30 s deadline covering the fetch and the body read. On
 * timeout it must raise the same status-0 "cannot reach the server" ApiError
 * that every other no-response failure raises.
 */
describe('api request deadline (F7)', () => {
  const NO_RESPONSE_MESSAGE = 'Cannot reach the server. Check your connection and try again.';

  const jsonResponse = (status: number, body: unknown) =>
    ({
      ok: status >= 200 && status < 300,
      status,
      text: () => Promise.resolve(JSON.stringify(body)),
    }) as Response;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.useFakeTimers();
    configureApiAuth(() => 'token', async () => null);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('rejects with the no-response ApiError after 30 s when fetch never settles', async () => {
    // A fetch that ignores its abort signal, as React Native's can.
    jest.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>(() => {}));

    const pending = api.myApplications().then(
      () => {
        throw new Error('expected rejection');
      },
      (err: unknown) => err,
    );

    await jest.advanceTimersByTimeAsync(29_999);
    expect(jest.getTimerCount()).toBeGreaterThan(0);

    await jest.advanceTimersByTimeAsync(1);
    const err = await pending;

    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ message: NO_RESPONSE_MESSAGE, status: 0 });
  });

  it('aborts the underlying fetch when the deadline fires', async () => {
    let capturedSignal: AbortSignal | undefined;
    jest.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      capturedSignal = (init as RequestInit).signal ?? undefined;
      return new Promise<Response>(() => {});
    });

    const pending = api.myApplications().catch((err: unknown) => err);
    await jest.advanceTimersByTimeAsync(30_000);
    await pending;

    expect(capturedSignal?.aborted).toBe(true);
  });

  it('a normal response returns the parsed body and clears the timer', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => Promise.resolve(jsonResponse(200, [{ id: 1 }])));

    await expect(api.myApplications()).resolves.toEqual([{ id: 1 }]);

    // No deadline left pending once the request has completed.
    expect(jest.getTimerCount()).toBe(0);
  });

  it('a server error response still surfaces its own status, not the timeout error', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => Promise.resolve(jsonResponse(500, { message: 'Boom' })));

    await expect(api.myApplications()).rejects.toMatchObject({ message: 'Boom', status: 500 });
    expect(jest.getTimerCount()).toBe(0);
  });
});
