import React from 'react';
import { render, screen } from '@testing-library/react-native';
import DateBlock from '../DateBlock';

it('shows weekday and day for a date', () => {
  // Oct 9, 2026 is a real Friday (Oct 10, 2026 is a Saturday).
  render(<DateBlock date="2026-10-09T19:10:00+08:00" />);
  expect(screen.getByText('FRI')).toBeTruthy();
  expect(screen.getByText('9')).toBeTruthy();
  expect(screen.getByLabelText('Friday, October 9')).toBeTruthy();
});

it('shows NO DATE when empty', () => {
  render(<DateBlock date={null} />);
  expect(screen.getByText('NO')).toBeTruthy();
  expect(screen.getByText('DATE')).toBeTruthy();
  expect(screen.getByLabelText('No date yet')).toBeTruthy();
});
