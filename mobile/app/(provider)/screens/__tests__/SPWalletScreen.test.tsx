import { findUnnamedControls } from '../../../../src/testing/a11yAudit';
import React from 'react';
import {StyleSheet} from 'react-native';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react-native';
import SPWalletScreen from '../SPWalletScreen';
import {lightPalette} from '../../../../src/constants/palettes';
import {api} from '../../../../src/lib/api';
import {showToast} from '../../../../src/components/Toast';
import {clearAsyncDataCache} from '../../../../src/hooks/useAsyncData';
jest.mock('../../../../src/lib/api', () => ({api:{wallet:jest.fn(),cancelWithdrawal:jest.fn(),connectStatus:jest.fn()}}));
jest.mock('../../../../src/context/AuthContext', () => ({useAuth:() => ({providerProfile:{cached_completed_jobs:1}})}));
jest.mock('../../../../src/components/WithdrawModal', () => () => null);
jest.mock('../../../../src/components/Toast', () => ({showToast:jest.fn()}));
const transaction = (id:string, status:'pending'|'completed'|'failed', kind = 'withdrawal') => ({
  id, profile_id:'p1',direction:'debit',status,kind,amount:350,title:id,job_id:null,created_at:'2026-10-04T00:00:00Z',
});
const wallet = (transactions:unknown[]) => ({balance:650,available:300,pending:350,pending_withdrawals:350,total_credited:1000,total_debited:350,in_escrow:0,transactions});
/** The colours a host element is drawn with: its style, flattened. */
function styleOf(element: {props: Record<string, any>}): Record<string, any> {
  return StyleSheet.flatten(element.props.style) ?? {};
}
/** Stripe Connect status: payouts are either set up and enabled, or not. */
const stripe = (payouts_enabled:boolean) => ({
  state: payouts_enabled ? 'active' : 'not_started', country: 'PH', details_submitted: payouts_enabled,
  payouts_enabled, transfers_active: payouts_enabled, requirements_due: [], disabled_reason: null,
});
beforeEach(() => {
  jest.clearAllMocks();
  clearAsyncDataCache();
  (api.connectStatus as jest.Mock).mockResolvedValue(stripe(true));
});
it('shows settlement and Stripe references without calling a pending request delivered money', async () => {
  (api.wallet as jest.Mock).mockResolvedValue(wallet([
    transaction('pending-request','pending'),
    {...transaction('settled-request','completed'),review_note:'GC-001'},
    {...transaction('stripe-request','completed','connect_transfer'),stripe_transfer_id:'tr_001'},
    {...transaction('failed-request','failed','connect_transfer'),review_note:'Transfer refused'},
  ]));
  render(<SPWalletScreen onNavigate={jest.fn()} />);
  expect(await screen.findByText('Settlement reference: GC-001')).toBeTruthy();
  expect(screen.getByText('Stripe transfer: tr_001')).toBeTruthy();
  expect(screen.getByText(/Not sent — kept in wallet/)).toBeTruthy();
  expect(screen.getByText('Transaction: pending-request')).toBeTruthy();
  expect(screen.getByText(/Requested .* · Pending/)).toBeTruthy();
  expect(screen.getAllByText('-₱350.00')).toHaveLength(3);
});
it('reports load failure instead of claiming the account has no money', async () => {
  (api.wallet as jest.Mock).mockRejectedValue(new Error('Wallet unavailable'));
  render(<SPWalletScreen onNavigate={jest.fn()} />);
  await screen.findByText('Wallet unavailable');
  fireEvent.press(screen.getByText('Withdraw'));
  expect(showToast).toHaveBeenCalledWith('Could not load your wallet. Please try again.','error');
});
it('reports cancellation failure and retains the pending request', async () => {
  (api.wallet as jest.Mock).mockResolvedValue(wallet([transaction('pending-request','pending')]));
  (api.cancelWithdrawal as jest.Mock).mockRejectedValue(new Error('Already being settled'));
  render(<SPWalletScreen onNavigate={jest.fn()} />);
  await screen.findByText('Transaction: pending-request');
  await act(async () => fireEvent.press(screen.getByText('Cancel')));
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('Already being settled','error'));
  expect(screen.getByText('Transaction: pending-request')).toBeTruthy();
  expect(api.wallet).toHaveBeenCalledTimes(1);
});
it('shows the escrow hold and the total earned, with the jobs done under it', async () => {
  (api.wallet as jest.Mock).mockResolvedValue({...wallet([]), in_escrow:120, total_credited:1000});
  render(<SPWalletScreen onNavigate={jest.fn()} />);
  expect(await screen.findByText('₱120.00')).toBeTruthy();
  expect(screen.getByText('On hold')).toBeTruthy();
  expect(screen.getByText('₱1,000.00')).toBeTruthy();
  expect(screen.getByText('Earned so far')).toBeTruthy();
  expect(screen.getByText('1 job done')).toBeTruthy();
});
it('signs money coming in with a plus, and leaves a refused payout unsigned', async () => {
  (api.wallet as jest.Mock).mockResolvedValue(wallet([
    {...transaction('paid-job','completed','connect_transfer'),direction:'credit',amount:425,title:'Paid: Plumbing'},
    transaction('refused-payout','failed','connect_transfer'),
  ]));
  render(<SPWalletScreen onNavigate={jest.fn()} />);
  expect(await screen.findByText('+₱425.00')).toBeTruthy();
  expect(screen.getByText('₱350.00')).toBeTruthy();
});
it('says card payments need payouts set up when Stripe payouts are off, and Set up opens Payouts', async () => {
  (api.wallet as jest.Mock).mockResolvedValue(wallet([]));
  (api.connectStatus as jest.Mock).mockResolvedValue(stripe(false));
  const onNavigate = jest.fn();
  render(<SPWalletScreen onNavigate={onNavigate} />);
  expect(await screen.findByText('Card payments need Payouts set up.')).toBeTruthy();
  expect(screen.queryByText(/Card-paid earnings become eligible/)).toBeNull();
  fireEvent.press(screen.getByRole('button', {name: 'Set up'}));
  expect(onNavigate).toHaveBeenCalledWith('Payouts');
});
it('hides the payouts notice once Stripe payouts are enabled', async () => {
  (api.wallet as jest.Mock).mockResolvedValue(wallet([]));
  (api.connectStatus as jest.Mock).mockResolvedValue(stripe(true));
  render(<SPWalletScreen onNavigate={jest.fn()} />);
  await screen.findByText('₱300.00');
  await act(async () => {});
  expect(api.connectStatus).toHaveBeenCalled();
  expect(screen.queryByText('Card payments need Payouts set up.')).toBeNull();
});
it('does not show the payouts notice while the payout status is still loading', async () => {
  (api.wallet as jest.Mock).mockResolvedValue(wallet([]));
  (api.connectStatus as jest.Mock).mockReturnValue(new Promise(() => {}));
  render(<SPWalletScreen onNavigate={jest.fn()} />);
  expect(await screen.findByText('₱300.00')).toBeTruthy();
  expect(screen.queryByText('Card payments need Payouts set up.')).toBeNull();
});
it('leaves the payouts notice out when the status fails, without holding up the wallet', async () => {
  (api.wallet as jest.Mock).mockResolvedValue(wallet([]));
  (api.connectStatus as jest.Mock).mockRejectedValue(new Error('Stripe unavailable'));
  render(<SPWalletScreen onNavigate={jest.fn()} />);
  expect(await screen.findByText('₱300.00')).toBeTruthy();
  await act(async () => {});
  expect(screen.queryByText('Card payments need Payouts set up.')).toBeNull();
  expect(screen.getByRole('button', {name: 'Withdraw'})).toBeTruthy();
});
it('recreates the Withdraw button when its funds arrive, so Android repaints its fill and label', async () => {
  (api.wallet as jest.Mock).mockResolvedValue(wallet([]));
  render(<SPWalletScreen onNavigate={jest.fn()} />);
  const before = screen.getByRole('button', {name: 'Withdraw'});
  await screen.findByText('₱300.00');
  expect(screen.getByRole('button', {name: 'Withdraw'})).not.toBe(before);
});
it('draws the Withdraw label in the primary colour on the white button once funds are available', async () => {
  (api.wallet as jest.Mock).mockResolvedValue(wallet([]));
  render(<SPWalletScreen onNavigate={jest.fn()} />);
  await screen.findByText('₱300.00');
  expect(styleOf(screen.getByRole('button', {name: 'Withdraw'})).backgroundColor).toBe(lightPalette.Colors.onPrimary);
  expect(styleOf(screen.getByText('Withdraw')).color).toBe(lightPalette.Colors.primary);
});
it('keeps the Withdraw label visible on the translucent button when nothing can be withdrawn', async () => {
  (api.wallet as jest.Mock).mockResolvedValue({...wallet([]), available: 0});
  render(<SPWalletScreen onNavigate={jest.fn()} />);
  await waitFor(() => expect(api.wallet).toHaveBeenCalled());
  await act(async () => {});
  expect(styleOf(screen.getByRole('button', {name: 'Withdraw'})).backgroundColor).toBe(lightPalette.Colors.heroCard);
  expect(styleOf(screen.getByText('Withdraw')).color).toBe(lightPalette.Colors.onPrimary);
});

it('every control has an accessible name: header, pending withdrawal and its cancel button', async () => {
  (api.wallet as jest.Mock).mockResolvedValue(wallet([transaction('pending-request', 'pending')]));
  render(<SPWalletScreen onNavigate={jest.fn()} />);
  await screen.findByText('Transaction: pending-request');
  expect(findUnnamedControls(screen.UNSAFE_root)).toEqual([]);
});
