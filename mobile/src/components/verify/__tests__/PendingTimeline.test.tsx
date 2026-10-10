import React from 'react';
import { render, screen } from '@testing-library/react-native';
import PendingTimeline from '../PendingTimeline';

describe('PendingTimeline', () => {
  it('says which step is done, which is now, and which is still to come', () => {
    render(
      <PendingTimeline
        rows={[
          { key: 'sent', title: 'Documents sent', detail: 'Your ID and selfie reached TaskBuddy.', state: 'done' },
          { key: 'review', title: 'Admin review', detail: 'An admin is reviewing your documents now.', state: 'current' },
          { key: 'apply', title: 'You can apply to jobs', detail: 'After you are approved.', state: 'upcoming' },
        ]}
      />,
    );

    expect(screen.getByLabelText('Documents sent, done. Your ID and selfie reached TaskBuddy.')).toBeTruthy();
    expect(screen.getByLabelText('Admin review, now. An admin is reviewing your documents now.')).toBeTruthy();
    expect(screen.getByLabelText('You can apply to jobs, not yet. After you are approved.')).toBeTruthy();
  });
});
