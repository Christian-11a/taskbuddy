import React from 'react';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react-native';
import SPWalletScreen from '../SPWalletScreen';
import {api} from '../../../../src/lib/api';
import {showToast} from '../../../../src/components/Toast';
import {clearAsyncDataCache} from '../../../../src/hooks/useAsyncData';
jest.mock('../../../../src/lib/api', () => ({api:{wallet:jest.fn(),cancelWithdrawal:jest.fn()}}));
jest.mock('../../../../src/context/AuthContext', () => ({useAuth:() => ({providerProfile:{cached_completed_jobs:1}})}));
jest.mock('../../../../src/components/WithdrawModal', () => () => null);
jest.mock('../../../../src/components/Toast', () => ({showToast:jest.fn()}));
const transaction = (id:string, status:'pending'|'completed'|'failed', kind = 'withdrawal') => ({
  id, profile_id:'p1',direction:'debit',status,kind,amount:350,title:id,job_id:null,created_at:'2026-10-04T00:00:00Z',
});
const wallet = (transactions:unknown[]) => ({balance:650,available:300,pending:350,pending_withdrawals:350,total_credited:1000,total_debited:350,in_escrow:0,transactions});
beforeEach(() => {jest.clearAllMocks();clearAsyncDataCache();});
it('shows settlement and Stripe references without calling a pending request delivered money', async () => {
  (api.wallet as jest.Mock).mockResolvedValue(wallet([
    transaction('pending-request','pending'),
    {...transaction('settled-request','completed'),review_note:'GC-001'},
    {...transaction('stripe-request','completed','connect_transfer'),stripe_transfer_id:'tr_001'},
    {...transaction('failed-request','failed','connect_transfer'),review_note:'Transfer refused'},
  ]));
  render(<SPWalletScreen />);
  expect(await screen.findByText('Settlement reference: GC-001')).toBeTruthy();
  expect(screen.getByText('Stripe transfer: tr_001')).toBeTruthy();
  expect(screen.getByText(/Not sent — kept in wallet/)).toBeTruthy();
  expect(screen.getByText('Transaction: pending-request')).toBeTruthy();
  expect(screen.getByText(/Requested .* · Pending/)).toBeTruthy();
  expect(screen.getAllByText('-₱350.00')).toHaveLength(3);
});
it('reports load failure instead of claiming the account has no money', async () => {
  (api.wallet as jest.Mock).mockRejectedValue(new Error('Wallet unavailable'));
  render(<SPWalletScreen />);
  await screen.findByText('Wallet unavailable');
  fireEvent.press(screen.getByText('Withdraw'));
  expect(showToast).toHaveBeenCalledWith('Could not load your wallet. Please try again.','error');
});
it('reports cancellation failure and retains the pending request', async () => {
  (api.wallet as jest.Mock).mockResolvedValue(wallet([transaction('pending-request','pending')]));
  (api.cancelWithdrawal as jest.Mock).mockRejectedValue(new Error('Already being settled'));
  render(<SPWalletScreen />);
  await screen.findByText('Transaction: pending-request');
  await act(async () => fireEvent.press(screen.getByText('Cancel')));
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('Already being settled','error'));
  expect(screen.getByText('Transaction: pending-request')).toBeTruthy();
  expect(api.wallet).toHaveBeenCalledTimes(1);
});
