import React from 'react';
import {act, fireEvent, render, screen, waitFor, within} from '@testing-library/react-native';
import SPPayoutsScreen, {payoutsCopy} from '../SPPayoutsScreen';
import {api} from '../../../../src/lib/api';
import type {ConnectStatus} from '../../../../src/lib/api';
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
it('a failed status load shows the error in a card, and Try again loads the status', async () => {
  (api.connectSync as jest.Mock).mockRejectedValueOnce(new Error('Payouts unavailable'));
  render(<SPPayoutsScreen onBack={jest.fn()} />);
  const card = await screen.findByTestId('error-card');
  expect(within(card).getByText("Couldn't load payouts")).toBeTruthy();
  expect(within(card).getByText('Payouts unavailable')).toBeTruthy();
  fireEvent.press(within(card).getByRole('button', {name: 'Try again'}));
  expect(await screen.findByTestId('payouts-status-not_started')).toBeTruthy();
});
it('syncs after returning from onboarding instead of treating the redirect as proof of readiness', async () => {
  (api.connectSync as jest.Mock).mockResolvedValueOnce(status('not_started')).mockResolvedValue(status('restricted'));
  render(<SPPayoutsScreen onBack={jest.fn()} />);
  await screen.findByTestId('payouts-status-not_started');
  await waitFor(() => expect(screen.getByRole('button', {name: 'Set up payouts'})).toBeEnabled());
  await act(async () => fireEvent.press(screen.getByRole('button', {name: 'Set up payouts'})));
  expect(await screen.findByTestId('payouts-status-restricted')).toBeTruthy();
  expect(api.connectOnboardingLink).toHaveBeenCalledWith({app_redirect:'taskbuddy://payouts'});
  expect(api.connectSync).toHaveBeenCalledTimes(2);
});
it('replaces an expired link once and reports repeated expiry', async () => {
  (openRedirectSession as jest.Mock).mockResolvedValue({type:'success',url:'taskbuddy://payouts?connect=refresh'});
  render(<SPPayoutsScreen onBack={jest.fn()} />);
  await screen.findByTestId('payouts-status-not_started');
  await waitFor(() => expect(screen.getByRole('button', {name: 'Set up payouts'})).toBeEnabled());
  await act(async () => fireEvent.press(screen.getByRole('button', {name: 'Set up payouts'})));
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

it('shows a neutral not-available card instead of a red error when Stripe will not open accounts here', async () => {
  (api.connectOnboardingLink as jest.Mock).mockRejectedValueOnce(new Error("You can only create new accounts if you've signed up for Connect, which you can do at https://stripe.com/connect."));
  render(<SPPayoutsScreen onBack={jest.fn()} />);
  await screen.findByTestId('payouts-status-not_started');
  await waitFor(() => expect(screen.getByRole('button', {name: 'Set up payouts'})).toBeEnabled());
  await act(async () => fireEvent.press(screen.getByRole('button', {name: 'Set up payouts'})));

  await screen.findByText("Bank payouts aren't available yet");
  expect(within(screen.getByTestId('payouts-status-not_started')).getByText('NOT AVAILABLE YET')).toBeTruthy();
  expect(screen.getByText('Your earnings are safe in your TaskBuddy wallet. Withdraw to GCash or your bank from the Wallet tab.')).toBeTruthy();
  expect(screen.queryByText(/Card payout setup is unavailable/)).toBeNull();
  expect(screen.queryByText(/You can only create new accounts/)).toBeNull();
  expect(screen.queryByRole('button', {name: 'Set up payouts'})).toBeNull();
  expect(screen.queryByText("You'll need")).toBeNull();
  expect(openRedirectSession).not.toHaveBeenCalled();
});

describe('payoutsCopy', () => {
  it.each([
    ['not_started', 'attention', 'Not set up', 'Set up payouts'],
    ['onboarding', 'attention', 'Setup not finished', 'Continue setup'],
    ['restricted', 'attention', 'Action needed', 'Update details'],
    ['active', 'done', 'Payouts on', null],
  ])('%s has tone %s, overline "%s" and action %s', (state, tone, overline, action) => {
    expect(payoutsCopy(state as ConnectStatus['state'])).toMatchObject({tone, overline, action});
  });
});

it('explains both payout routes and keeps bank details with Stripe', async () => {
  render(<SPPayoutsScreen onBack={jest.fn()} />);
  await screen.findByTestId('payouts-status-not_started');
  expect(screen.getByText('Card-paid jobs → your bank')).toBeTruthy();
  expect(screen.getByText('Wallet-paid jobs → your TaskBuddy wallet')).toBeTruthy();
  expect(screen.getByText('A valid ID')).toBeTruthy();
  expect(screen.getByText('Your bank account details')).toBeTruthy();
  expect(screen.getByText("Your bank details are entered on Stripe's pages and never reach TaskBuddy.")).toBeTruthy();
});

it('states no setup duration beyond a few minutes', async () => {
  render(<SPPayoutsScreen onBack={jest.fn()} />);
  await screen.findByTestId('payouts-status-not_started');
  expect(screen.getByText("Setup takes a few minutes on Stripe's pages.")).toBeTruthy();
  expect(screen.queryByText(/\d+\s*minutes?/)).toBeNull();
});

it('keeps the set-up action at the bottom and out of the status card', async () => {
  render(<SPPayoutsScreen onBack={jest.fn()} />);
  const card = await screen.findByTestId('payouts-status-not_started');
  expect(card.findAll((node) => node.props.accessibilityLabel === 'Set up payouts')).toHaveLength(0);
  expect(screen.getByRole('button', {name: 'Set up payouts'})).toBeTruthy();
});

it('active payouts offer the dashboard and no set-up action', async () => {
  (api.connectSync as jest.Mock).mockResolvedValue(status('active'));
  render(<SPPayoutsScreen onBack={jest.fn()} />);
  await screen.findByTestId('payouts-status-active');
  expect(screen.getByText('Open Stripe dashboard')).toBeTruthy();
  expect(screen.queryByRole('button', {name: 'Set up payouts'})).toBeNull();
  expect(screen.queryByText("You'll need")).toBeNull();
});

it('restricted payouts say how many details Stripe is still asking for', async () => {
  (api.connectSync as jest.Mock).mockResolvedValue(status('restricted'));
  render(<SPPayoutsScreen onBack={jest.fn()} />);
  await screen.findByTestId('payouts-status-restricted');
  expect(screen.getByText(/Stripe is asking for 1 more detail/)).toBeTruthy();
  expect(screen.getByRole('button', {name: 'Update details'})).toBeTruthy();
});
