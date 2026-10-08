import React from 'react';
import { Inbox } from 'lucide-react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import EmptyRow from '../EmptyRow';

it('shows the title and body', () => {
  render(<EmptyRow icon={Inbox} title="No proposals yet" body="Providers who match your job will send proposals here." />);
  expect(screen.getByText('No proposals yet')).toBeTruthy();
  expect(screen.getByText('Providers who match your job will send proposals here.')).toBeTruthy();
});

it('renders the icon it is given', () => {
  render(<EmptyRow icon={Inbox} title="Nothing here yet" />);
  expect(screen.UNSAFE_getByType(Inbox)).toBeTruthy();
});

it('shows an action link under the body and calls onAction when pressed', () => {
  const onAction = jest.fn();
  render(<EmptyRow icon={Inbox} title="No jobs yet" body="Post a job to get started." actionLabel="Post a job" onAction={onAction} />);
  fireEvent.press(screen.getByRole('button', { name: 'Post a job' }));
  expect(onAction).toHaveBeenCalledTimes(1);
});

it('has no action link without an action label', () => {
  render(<EmptyRow icon={Inbox} title="No jobs yet" body="Post a job to get started." />);
  expect(screen.queryByRole('button')).toBeNull();
});
