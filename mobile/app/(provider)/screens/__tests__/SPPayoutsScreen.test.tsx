import React from 'react';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react-native';
import SPPayoutsScreen from '../SPPayoutsScreen';
import {api} from '../../../../src/lib/api';
import {openRedirectSession} from '../../../../src/lib/appRedirectSession';
jest.mock('../../../../src/lib/api', () => ({api: {
  connectSync: jest.fn(), connectOnboardingLink: jest.fn(), connectDashboardLink: jest.fn(),
}}));
jest.mock('../../../../src/lib/appRedirectSession', () => ({openRedirectSession: jest.fn()}));
jest.mock('expo-auth-session', () => ({makeRedirectUri: () => 'taskbuddy://payouts'}));
const status = (state: string) => ({state, details_submitted: state === 'active', requirements_due: state === 'restricted' ? ['identity'] : [], disabled_reason: null});
beforeEach(() => {
  jest.clearAllMocks();
  (api.connectSync as jest.Mock).mockResolvedValue(status('not_started'));
  (api.connectOnboardingLink as jest.Mock).mockResolvedValue({url:'https://stripe.test/onboard'});
  (openRedirectSession as jest.Mock).mockResolvedValue({type:'success',url:'taskbuddy://payouts?connect=return'});
});
it.each(['not_started','onboarding','restricted','active'])('renders authoritative setup state %s', async state => {
  (api.connectSync as jest.Mock).mockResolvedValue(status(state));
  render(<SPPayoutsScreen onBack={jest.fn()} />);
  expect(await screen.findByTestId(`payouts-status-${state}`)).toBeTruthy();
  expect(screen.getAllByText(/three-day warranty/).length).toBeGreaterThan(0);
});
it('syncs after returning from onboarding instead of treating the redirect as proof of readiness', async () => {
  (api.connectSync as jest.Mock).mockResolvedValueOnce(status('not_started')).mockResolvedValue(status('restricted'));
  render(<SPPayoutsScreen onBack={jest.fn()} />);
  await screen.findByTestId('payouts-status-not_started');
  await waitFor(() => expect(screen.getByTestId('payouts-primary')).toBeEnabled());
  await act(async () => fireEvent.press(screen.getByTestId('payouts-primary')));
  expect(await screen.findByTestId('payouts-status-restricted')).toBeTruthy();
  expect(api.connectOnboardingLink).toHaveBeenCalledWith({app_redirect:'taskbuddy://payouts'});
  expect(api.connectSync).toHaveBeenCalledTimes(2);
});
it('replaces an expired link once and reports repeated expiry', async () => {
  (openRedirectSession as jest.Mock).mockResolvedValue({type:'success',url:'taskbuddy://payouts?connect=refresh'});
  render(<SPPayoutsScreen onBack={jest.fn()} />);
  await screen.findByTestId('payouts-status-not_started');
  await waitFor(() => expect(screen.getByTestId('payouts-primary')).toBeEnabled());
  await act(async () => fireEvent.press(screen.getByTestId('payouts-primary')));
  expect(await screen.findByText('The setup link expired. Please try again.')).toBeTruthy();
  expect(api.connectOnboardingLink).toHaveBeenCalledTimes(2);
  expect(api.connectSync).toHaveBeenCalledTimes(1);
});
it('reports refresh failure while retaining the last known snapshot', async () => {
  (api.connectSync as jest.Mock).mockResolvedValueOnce(status('active')).mockRejectedValue(new Error('Sync failed'));
  render(<SPPayoutsScreen onBack={jest.fn()} />);
  await screen.findByTestId('payouts-status-active');
  await act(async () => fireEvent.press(screen.getByText('Refresh status')));
  expect(await screen.findByText('Sync failed')).toBeTruthy();
  expect(screen.getByTestId('payouts-status-active')).toBeTruthy();
});

it('shows actionable setup failure instead of Stripe platform-administration instructions', async () => {
  (api.connectOnboardingLink as jest.Mock).mockRejectedValueOnce(new Error("You can only create new accounts if you've signed up for Connect, which you can do at https://stripe.com/connect."));
  render(<SPPayoutsScreen onBack={jest.fn()} />);
  await screen.findByTestId('payouts-status-not_started');
  await waitFor(() => expect(screen.getByTestId('payouts-primary')).toBeEnabled());
  await act(async () => fireEvent.press(screen.getByTestId('payouts-primary')));
  expect(await screen.findByText('Card payout setup is unavailable for this platform. Contact TaskBuddy support.')).toBeTruthy();
  expect(screen.getByTestId('payouts-status-not_started')).toBeTruthy();
  expect(screen.getByTestId('payouts-primary')).toBeEnabled();
  expect(openRedirectSession).not.toHaveBeenCalled();
});
