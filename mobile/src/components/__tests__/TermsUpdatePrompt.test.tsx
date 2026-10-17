import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import TermsUpdatePrompt from '../TermsUpdatePrompt';
import { api } from '../../lib/api';
import { TERMS_VERSION } from '../../lib/legalText';

jest.mock('../../lib/api', () => ({ api: { acceptTerms: jest.fn() } }));
jest.mock('../Toast', () => ({ showToast: jest.fn() }));
const mockRefreshProfile = jest.fn().mockResolvedValue(undefined);
let mockProfile: Record<string, unknown> | null = null;
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ profile: mockProfile, refreshProfile: mockRefreshProfile }),
}));

it('stays hidden for an account on the current terms', () => {
  mockProfile = { id: 'u1', terms_update_required: false };
  render(<TermsUpdatePrompt />);
  expect(screen.queryByText('I agree to the Terms & Conditions')).toBeNull();
});

it('asks for the new terms and records the current version', async () => {
  mockProfile = { id: 'u1', terms_update_required: true };
  (api.acceptTerms as jest.Mock).mockResolvedValue({ accepted_terms_version: TERMS_VERSION });
  render(<TermsUpdatePrompt />);
  expect(screen.getByText(/6\. Finality of released payments/)).toBeTruthy();
  fireEvent(screen.getByTestId('terms-body'), 'accessibilityAction', { nativeEvent: { actionName: 'markAsRead' } });
  await act(async () => fireEvent.press(screen.getByText('I agree to the Terms & Conditions')));
  expect(api.acceptTerms).toHaveBeenCalledWith(TERMS_VERSION);
  expect(mockRefreshProfile).toHaveBeenCalled();
});
