import React from 'react';
import { ActivityIndicator } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import PostingChecklist from '../PostingChecklist';

it('ticks a step that is done', () => {
  render(<PostingChecklist steps={[{ key: 'photos', label: 'Uploading photos', state: 'done' }]} />);
  expect(screen.getByLabelText('Uploading photos: done')).toBeTruthy();
  expect(screen.queryByText('Uploading photos')).toBeTruthy();
});

it('shows a spinner on the step in progress, and not on a finished one', () => {
  render(
    <PostingChecklist
      steps={[
        { key: 'photos', label: 'Uploading photos', state: 'done' },
        { key: 'post', label: 'Posting your job', state: 'active' },
      ]}
    />,
  );
  expect(screen.getByLabelText('Posting your job: in progress', { exact: false })).toBeTruthy();
  expect(screen.UNSAFE_getAllByType(ActivityIndicator)).toHaveLength(1);
});

it('lists only the steps it is given, in the order given', () => {
  render(
    <PostingChecklist
      steps={[
        { key: 'post', label: 'Posting your job', state: 'active' },
      ]}
    />,
  );
  expect(screen.getByLabelText('Posting your job: in progress', { exact: false })).toBeTruthy();
  expect(screen.queryByText('Uploading photos')).toBeNull();
});

it('shows a waiting step as not started yet', () => {
  render(<PostingChecklist steps={[{ key: 'post', label: 'Posting your job', state: 'waiting' }]} />);
  expect(screen.getByLabelText('Posting your job: waiting')).toBeTruthy();
});
