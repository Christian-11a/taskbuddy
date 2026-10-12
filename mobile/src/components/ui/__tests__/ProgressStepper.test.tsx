import React from 'react';
import { render, screen } from '@testing-library/react-native';
import ProgressStepper from '../ProgressStepper';

it('names the current step and its position', () => {
  render(<ProgressStepper step="hired" />);
  expect(screen.getByRole('progressbar', { name: 'Job progress: Hired, step 2 of 4' })).toBeTruthy();
});

it.each([
  ['posted', 'Posted', 1],
  ['hired', 'Hired', 2],
  ['working', 'Working', 3],
  ['done', 'Done', 4],
] as const)('reads %s as %s, step %i of 4', (step, label, position) => {
  render(<ProgressStepper step={step} />);
  expect(screen.getByRole('progressbar', { name: `Job progress: ${label}, step ${position} of 4` })).toBeTruthy();
});

it('shows the four step labels in order', () => {
  render(<ProgressStepper step="working" />);
  for (const label of ['Posted', 'Hired', 'Working', 'Done']) {
    expect(screen.getByText(label)).toBeTruthy();
  }
});

it('says Cancelled in place of Working and names the step it was cancelled after', () => {
  render(<ProgressStepper step="cancelled" />);
  expect(screen.getByRole('progressbar', { name: 'Job progress: Cancelled after Hired' })).toBeTruthy();
  expect(screen.getByText('Cancelled')).toBeTruthy();
  expect(screen.queryByText('Working')).toBeNull();
});
