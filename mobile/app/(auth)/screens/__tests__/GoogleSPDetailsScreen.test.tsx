import React from 'react';
import { ScrollView } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import GoogleSPDetailsScreen from '../GoogleSPDetailsScreen';
it('completes Google provider onboarding with the same three signup consents', async () => {
  const complete = jest.fn().mockResolvedValue(undefined);
  render(<GoogleSPDetailsScreen onBack={jest.fn()} onComplete={complete} />);
  fireEvent.press(screen.getByText('Select your skill…'));
  fireEvent.press(screen.getByText('Plumbing'));
  fireEvent.press(screen.getByTestId('chk-gsp-terms-privacy'));
  for (const doc of ['Terms & Conditions', 'Privacy Policy']) {
    fireEvent.scroll(screen.getByTestId('terms-body'), {
      nativeEvent: { contentOffset: { y: 1000 }, layoutMeasurement: { height: 400 }, contentSize: { height: 1400 } },
    });
    fireEvent.press(screen.getByText(`I agree to the ${doc}`));
  }
  expect(screen.getByRole('checkbox', { name: /Terms and Conditions and the Privacy Policy/ }).props.accessibilityState)
    .toMatchObject({ checked: true });
  fireEvent.press(screen.getByTestId('chk-gsp-data'));
  expect(screen.queryByTestId('chk-gsp-biometric')).toBeNull();
  await act(async () => fireEvent.press(screen.getByText('Complete Registration')));
  expect(complete).toHaveBeenCalledWith({categoryId: 1, consentedTerms: true,
    consentedPrivacy: true, consentedDataCollection: true});
});

it('collects the same three consents for a client, without a skill category', async () => {
  const complete = jest.fn().mockResolvedValue(undefined);
  render(<GoogleSPDetailsScreen role="client" onBack={jest.fn()} onComplete={complete} />);
  expect(screen.queryByText('Select your skill…')).toBeNull();
  await act(async () => fireEvent.press(screen.getByText('Complete Registration')));
  expect(complete).not.toHaveBeenCalled();
  fireEvent.press(screen.getByTestId('chk-gsp-terms-privacy'));
  for (const doc of ['Terms & Conditions', 'Privacy Policy']) {
    fireEvent.scroll(screen.getByTestId('terms-body'), {
      nativeEvent: { contentOffset: { y: 1000 }, layoutMeasurement: { height: 400 }, contentSize: { height: 1400 } },
    });
    fireEvent.press(screen.getByTestId('terms-agree'));
  }
  fireEvent.press(screen.getByTestId('chk-gsp-data'));
  await act(async () => fireEvent.press(screen.getByText('Complete Registration')));
  expect(complete).toHaveBeenCalledWith({ consentedTerms: true, consentedPrivacy: true, consentedDataCollection: true });
});

it('scrolls to the consents when a client submits without ticking them', async () => {
  const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => {});
  render(<GoogleSPDetailsScreen role="client" onBack={jest.fn()} onComplete={jest.fn()} />);
  scrollTo.mockClear();
  await act(async () => fireEvent.press(screen.getByText('Complete Registration')));
  expect(scrollTo).toHaveBeenCalledTimes(1);
  scrollTo.mockRestore();
});

it('scrolls to the skill category first when a provider submits with nothing filled', async () => {
  const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => {});
  render(<GoogleSPDetailsScreen onBack={jest.fn()} onComplete={jest.fn()} />);
  scrollTo.mockClear();
  await act(async () => fireEvent.press(screen.getByText('Complete Registration')));
  expect(scrollTo).toHaveBeenCalledTimes(1);
  scrollTo.mockRestore();
});
