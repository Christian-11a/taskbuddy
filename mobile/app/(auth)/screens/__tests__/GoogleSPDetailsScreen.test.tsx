import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import GoogleSPDetailsScreen from '../GoogleSPDetailsScreen';
it('completes Google provider onboarding with the same three signup consents', async () => {
  const complete = jest.fn().mockResolvedValue(undefined);
  render(<GoogleSPDetailsScreen onBack={jest.fn()} onComplete={complete} />);
  fireEvent.press(screen.getByText('Select your skill…'));
  fireEvent.press(screen.getByText('Plumbing'));
  fireEvent.press(screen.getByTestId('chk-gsp-terms'));
  fireEvent.press(screen.getByText('I agree to the Terms & Conditions'));
  fireEvent.press(screen.getByTestId('chk-gsp-privacy'));
  expect(screen.getByText('Your Rights (RA 10173)')).toBeTruthy();
  fireEvent.press(screen.getByText('I agree to the Privacy Policy'));
  fireEvent.press(screen.getByTestId('chk-gsp-data'));
  expect(screen.queryByTestId('chk-gsp-biometric')).toBeNull();
  await act(async () => fireEvent.press(screen.getByText('Complete Registration')));
  expect(complete).toHaveBeenCalledWith({categoryId: 1, consentedTerms: true,
    consentedPrivacy: true, consentedDataCollection: true});
});
