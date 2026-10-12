import { api, ApiError, configureApiAuth } from '../api';

/**
 * Every failed request passes through one place in the client, so the server's
 * validation output is read in plain words there. The status and the raw body
 * are kept as they were, for any caller that needs them.
 */
describe('api errors read in plain words', () => {
  const jsonResponse = (status: number, body: unknown) =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      text: () => Promise.resolve(JSON.stringify(body)),
    } as Response);

  beforeEach(() => {
    jest.restoreAllMocks();
    configureApiAuth(() => 'token', jest.fn());
  });

  it('rewrites the first validation message and keeps the status and the raw body', async () => {
    const body = {
      statusCode: 400,
      message: ['new_password must be longer than or equal to 8 characters', 'current_password should not be empty'],
      error: 'Bad Request',
    };
    jest.spyOn(globalThis, 'fetch').mockImplementation(() => jsonResponse(400, body));

    const failure: unknown = await api
      .changePassword({ current_password: 'current', new_password: 'short' })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({
      message: 'New password must be at least 8 characters.',
      status: 400,
      details: body,
    });
  });

  it('leaves a sentence the backend wrote unchanged', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(() => jsonResponse(400, { message: 'Insufficient wallet balance' }));

    await expect(
      api.changePassword({ current_password: 'current', new_password: 'new-password-1' }),
    ).rejects.toMatchObject({ message: 'Insufficient wallet balance', status: 400 });
  });
});
