import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import Profile from '../HOProfile';
import { api } from '../../../../src/lib/api';
import { useAuth } from '../../../../src/context/AuthContext';
import { clearAsyncDataCache } from '../../../../src/hooks/useAsyncData';

jest.mock('../../../../src/lib/api', () => ({
  api: { myJobs: jest.fn(), wallet: jest.fn() },
}));

jest.mock('../../../../src/context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../../../src/components/OwnAvatar', () => () => null);

beforeEach(() => {
  jest.clearAllMocks();
  clearAsyncDataCache();
  (useAuth as jest.Mock).mockReturnValue({
    profile: { full_name: 'Testo Homeowner', email: 'homeowner@example.com' },
  });
  // Left pending: the stats loader would otherwise update state after each test ends.
  (api.myJobs as jest.Mock).mockReturnValue(new Promise(() => {}));
  (api.wallet as jest.Mock).mockReturnValue(new Promise(() => {}));
});

it('has no back arrow on the Profile tab, where onBack is not passed', () => {
  render(<Profile onNavigate={jest.fn()} onLogout={jest.fn()} />);

  expect(screen.queryByLabelText('Back to Home')).toBeNull();
});

it('shows the back arrow when pushed from another screen, and runs onBack', () => {
  const onBack = jest.fn();
  render(<Profile onNavigate={jest.fn()} onLogout={jest.fn()} onBack={onBack} />);

  fireEvent.press(screen.getByLabelText('Back to Home'));

  expect(onBack).toHaveBeenCalledTimes(1);
});
