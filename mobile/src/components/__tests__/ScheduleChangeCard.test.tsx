import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import ScheduleChangeCard from '../ScheduleChangeCard';
import { api, type JobChangeRequest } from '../../lib/api';

jest.mock('../../lib/api', () => ({ api: { decideJobChange: jest.fn() } }));

const req: JobChangeRequest = {
  id: 'r1', job_id: 'j1', requested_by: 'c1', type: 'schedule', new_scheduled_at: '2026-10-21T06:00:00Z',
  new_budget: null, reason: 'Late shift', status: 'pending', created_at: '2026-10-17T00:00:00Z',
  expires_at: '2026-10-20T00:00:00Z', decided_at: null,
};

describe('ScheduleChangeCard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows Accept and Decline to the receiver and sends the decision', async () => {
    (api.decideJobChange as jest.Mock).mockResolvedValue({ ...req, status: 'accepted' });
    const onDecided = jest.fn();
    render(<ScheduleChangeCard request={req} userId="p1" otherName="Ana Cruz" onDecided={onDecided} />);
    expect(screen.getByText(/^Ana asked to move this job to/)).toBeTruthy();
    expect(screen.getByText('Reason: Late shift')).toBeTruthy();
    expect(screen.queryByLabelText('Withdraw')).toBeNull();
    fireEvent.press(screen.getByLabelText('Accept'));
    await waitFor(() => expect(onDecided).toHaveBeenCalledWith({ ...req, status: 'accepted' }));
    expect(api.decideJobChange).toHaveBeenCalledWith('r1', 'accepted');
  });

  it('shows only Withdraw to the sender', () => {
    render(<ScheduleChangeCard request={req} userId="c1" otherName="Ana" onDecided={jest.fn()} />);
    expect(screen.getByLabelText('Withdraw')).toBeTruthy();
    expect(screen.queryByLabelText('Accept')).toBeNull();
  });

  it('shows the server error when a decision fails', async () => {
    (api.decideJobChange as jest.Mock).mockRejectedValue(new Error('Change request is no longer pending'));
    render(<ScheduleChangeCard request={req} userId="p1" otherName="Ana" onDecided={jest.fn()} />);
    fireEvent.press(screen.getByLabelText('Decline'));
    await screen.findByText(/no longer pending/);
  });

  it('shows a result line for a decided request', () => {
    render(<ScheduleChangeCard request={{ ...req, status: 'declined' }} userId="c1" otherName="Ana" onDecided={jest.fn()} />);
    expect(screen.getByText(/declined/)).toBeTruthy();
  });
});
