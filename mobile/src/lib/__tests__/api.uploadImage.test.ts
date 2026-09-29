import { api, ApiError, configureApiAuth } from '../api';

/**
 * Expo's replacement `fetch` (expo/fetch) rejects React Native's
 * `{ uri, name, type }` multipart file part with "Unsupported FormDataPart
 * implementation", which broke every upload (Get Verified step 3, avatars, job
 * photos, chat attachments). The storage PUT must therefore go through
 * XMLHttpRequest, which still uses React Native's native networking.
 */
describe('api.uploadImage — storage PUT via XMLHttpRequest', () => {
  const SIGNED = {
    path: 'profile-1/abc.png',
    upload_url: 'https://storage.example/upload?token=t',
  };

  type FakeXhr = {
    open: jest.Mock;
    send: jest.Mock;
    setRequestHeader: jest.Mock;
    status: number;
    timeout: number;
    onload: (() => void) | null;
    onerror: (() => void) | null;
    ontimeout: (() => void) | null;
  };

  let xhr: FakeXhr;
  let fetchMock: jest.SpyInstance;
  const realXhr = globalThis.XMLHttpRequest;

  const signedUrlResponse = () =>
    Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(SIGNED)),
    } as Response);

  /** Makes `send` settle the request the way a real XHR would. */
  const respondWith = (outcome: 'load' | 'error' | 'timeout', status = 200) => {
    xhr.send.mockImplementation(() => {
      xhr.status = status;
      if (outcome === 'load') xhr.onload?.();
      if (outcome === 'error') xhr.onerror?.();
      if (outcome === 'timeout') xhr.ontimeout?.();
    });
  };

  beforeEach(() => {
    jest.restoreAllMocks();
    xhr = {
      open: jest.fn(),
      send: jest.fn(),
      setRequestHeader: jest.fn(),
      status: 0,
      timeout: 0,
      onload: null,
      onerror: null,
      ontimeout: null,
    };
    (globalThis as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = jest.fn(() => xhr);
    fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(signedUrlResponse);
    configureApiAuth(() => 'token', jest.fn());
  });

  afterAll(() => {
    (globalThis as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = realXhr;
  });

  it('PUTs a typed multipart file part to the signed URL and returns the path', async () => {
    respondWith('load', 200);
    const appendSpy = jest.spyOn(FormData.prototype, 'append');

    await expect(api.uploadImage('verification-docs', 'file:///cache/photo.png')).resolves.toBe(
      SIGNED.path,
    );

    expect(xhr.open).toHaveBeenCalledWith('PUT', SIGNED.upload_url);
    expect(xhr.send.mock.calls[0][0]).toBeInstanceOf(FormData);
    expect(appendSpy).toHaveBeenCalledWith('', {
      uri: 'file:///cache/photo.png',
      name: 'abc.png',
      type: 'image/png',
    });
  });

  it('never uses fetch for the storage PUT (only for the signed-url request)', async () => {
    respondWith('load', 200);

    await api.uploadImage('avatars', 'file:///cache/a.jpg');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/uploads/signed-url');
  });

  it('rejects with the storage status on a non-2xx response', async () => {
    respondWith('load', 403);

    await expect(api.uploadImage('job-photos', 'file:///cache/a.jpg')).rejects.toMatchObject({
      name: 'ApiError',
      status: 403,
      message: 'Could not upload the image. Try again.',
    });
  });

  it('rejects with an ApiError on a network error', async () => {
    respondWith('error');

    const err = await api.uploadImage('job-photos', 'file:///cache/a.jpg').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toMatch(/connection/i);
  });

  it('rejects with an ApiError on a timeout', async () => {
    respondWith('timeout');

    const err = await api.uploadImage('job-photos', 'file:///cache/a.jpg').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toMatch(/connection/i);
  });

  it('does not attempt an upload when the signed-url request fails', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        text: () => Promise.resolve(JSON.stringify({ message: 'boom' })),
      } as Response),
    );

    await expect(api.uploadImage('avatars', 'file:///cache/a.jpg')).rejects.toBeInstanceOf(ApiError);
    expect(xhr.open).not.toHaveBeenCalled();
    expect(xhr.send).not.toHaveBeenCalled();
  });
});
