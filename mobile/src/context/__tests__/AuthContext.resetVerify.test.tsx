import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider, useAuth } from '../AuthContext';
import { api, ApiError } from '../../lib/api';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-web-browser', () => ({ maybeCompleteAuthSession: jest.fn() }));
jest.mock('../../lib/pushNotifications', () => ({
  requestExpoPushRegistration: jest.fn().mockResolvedValue({ status: 'denied' }),
}));
jest.mock('../../lib/api', () => ({
  ...jest.requireActual('../../lib/api'),
  configureApiAuth: jest.fn(),
  api: {
    me: jest.fn(),
    logout: jest.fn().mockResolvedValue(undefined),
    resetPassword: jest.fn(),
    verifyEmailOtp: jest.fn(),
  },
}));

let auth!: ReturnType<typeof useAuth>;
function Probe() {
  auth = useAuth();
  return null;
}

const session = { access_token: 'new-token', refresh_token: 'new-refresh' };
const me = {
  profile: { id: 'user', full_name: 'Alex', role: 'client' },
  provider_profile: null,
};

function savedSession() {
  const calls = (AsyncStorage.setItem as jest.Mock).mock.calls;
  const call = calls.filter(([key]) => key === 'taskbuddy.session').pop();
  return call ? JSON.parse(call[1] as string) : null;
}

beforeEach(() => {
  jest.clearAllMocks();
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
});

async function mountSignedOut() {
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await waitFor(() => expect(auth).toBeDefined());
  await waitFor(() => expect(auth.initializing).toBe(false));
}

describe.each([
  [
    'resetPassword',
    () => api.resetPassword as jest.Mock,
    () => auth.resetPassword({ email: 'a@b.co', token: '123456', newPassword: 'NewPass1!' }),
  ],
  [
    'verifyEmailOtp',
    () => api.verifyEmailOtp as jest.Mock,
    () => auth.verifyEmailOtp({ email: 'a@b.co', token: '123456' }),
  ],
])('%s', (_name, apiMock, run) => {
  it('signs in and persists the session when /auth/me succeeds', async () => {
    apiMock()
      .mockResolvedValue({ session });
    (api.me as jest.Mock).mockResolvedValue(me);
    await mountSignedOut();

    await act(async () => {
      await run();
    });

    expect(savedSession()).toEqual(session);
    expect(auth.profile?.full_name).toBe('Alex');
  });

  it('keeps the session persisted when /auth/me fails after the code was consumed', async () => {
    apiMock().mockResolvedValue({ session });
    (api.me as jest.Mock).mockRejectedValue(new ApiError('bad request', 400));
    await mountSignedOut();

    await act(async () => {
      await expect(run()).rejects.toBeInstanceOf(ApiError);
    });

    expect(savedSession()).toEqual(session);
  });
});
