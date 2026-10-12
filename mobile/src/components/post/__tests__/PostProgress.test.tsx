import React from 'react';
import { render, screen } from '@testing-library/react-native';
import PostProgress from '../PostProgress';

it('names the step in a caption, in capitals', () => {
  render(<PostProgress step={2} total={5} label="Where" />);
  expect(screen.getByText('STEP 2 OF 5 · WHERE')).toBeTruthy();
});

it('reads as a progress bar that says where the user is', () => {
  render(<PostProgress step={3} total={5} label="Tasks" />);
  expect(screen.getByRole('progressbar', { name: 'Step 3 of 5: Tasks' })).toBeTruthy();
});
