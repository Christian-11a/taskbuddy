import React from 'react';
import { Modal, ScrollView, StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import TermsAndConditions from '../TermsAndConditions';
it('keeps all privacy sections in a scrollable body with separate reachable close and accept actions', () => {
  const close = jest.fn(), accept = jest.fn();
  render(<TermsAndConditions visible mode="privacy" onBack={close} onAccept={accept} />);
  const body = screen.UNSAFE_getByType(ScrollView);
  expect(StyleSheet.flatten(body.props.style)).toMatchObject({ flex: 1, minHeight: 0 });
  for (const heading of ['What We Collect', 'How We Use Your Data', 'Data Storage & Security', 'Your Rights (RA 10173)', 'Retention']) {
    expect(screen.getByText(heading)).toBeTruthy();
  }
  expect(screen.getByText('I agree to the Privacy Policy').parent).not.toBe(body);
  fireEvent(screen.UNSAFE_getByType(Modal), 'requestClose');
  expect(close).toHaveBeenCalledTimes(1);
  expect(accept).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('I agree to the Privacy Policy'));
  expect(accept).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledTimes(2);
});
