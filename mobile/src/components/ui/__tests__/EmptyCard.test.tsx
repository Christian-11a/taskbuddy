import React from 'react';
import { Inbox } from 'lucide-react-native';
import { render, screen, within } from '@testing-library/react-native';
import EmptyCard from '../EmptyCard';
import EmptyRow from '../EmptyRow';

it('wraps an empty row in the card, under the empty-card test id', () => {
  render(
    <EmptyCard>
      <EmptyRow icon={Inbox} title="No jobs yet" body="Post a job to get started." />
    </EmptyCard>,
  );
  expect(within(screen.getByTestId('empty-card')).getByText('No jobs yet')).toBeTruthy();
});

it('takes its own test id when a screen names the card', () => {
  render(
    <EmptyCard testID="error-card">
      <EmptyRow icon={Inbox} title="Couldn't load your jobs" />
    </EmptyCard>,
  );
  expect(within(screen.getByTestId('error-card')).getByText("Couldn't load your jobs")).toBeTruthy();
  expect(screen.queryByTestId('empty-card')).toBeNull();
});
