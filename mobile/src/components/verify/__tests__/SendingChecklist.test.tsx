import React from 'react';
import { render, screen } from '@testing-library/react-native';
import SendingChecklist from '../SendingChecklist';

describe('SendingChecklist', () => {
  it('says how far each step has got, in words a screen reader can read', () => {
    render(
      <SendingChecklist
        rows={[
          { key: 'id', label: 'ID photo uploaded', status: 'done' },
          { key: 'selfie', label: 'Selfie uploaded', status: 'done' },
          { key: 'check', label: 'Starting the secure check', status: 'active' },
        ]}
      />,
    );

    expect(screen.getByLabelText('ID photo uploaded: done')).toBeTruthy();
    expect(screen.getByLabelText('Selfie uploaded: done')).toBeTruthy();
    expect(screen.getByLabelText('Starting the secure check: in progress')).toBeTruthy();
  });

  it('marks a step that has not started as waiting', () => {
    render(<SendingChecklist rows={[{ key: 'check', label: 'Starting the secure check', status: 'pending' }]} />);

    expect(screen.getByLabelText('Starting the secure check: waiting')).toBeTruthy();
  });
});
