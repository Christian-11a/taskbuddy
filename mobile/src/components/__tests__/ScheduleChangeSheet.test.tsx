import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import ScheduleChangeSheet from '../ScheduleChangeSheet';
import { api } from '../../lib/api';

jest.mock('../../lib/api', () => ({ api: { proposeScheduleChange: jest.fn() } }));
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');
jest.mock('react-native-calendars', () => ({ Calendar: 'Calendar' }));

const props = { visible: true, jobId: 'j1', currentScheduledAt: '2026-10-20T06:00:00Z', onClose: jest.fn(), onSent: jest.fn() };

describe('ScheduleChangeSheet', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows the current schedule and blocks sending with no date or reason', () => {
    render(<ScheduleChangeSheet {...props} />);
    expect(screen.getByText('Change date or time')).toBeTruthy();
    expect(screen.getByText('Current schedule')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Send request'));
    expect(screen.getByText('Pick a new date.')).toBeTruthy();
    expect(screen.getByText('Tell them why you need to change it.')).toBeTruthy();
    expect(api.proposeScheduleChange).not.toHaveBeenCalled();
  });

  it('counts the reason out of 300', () => {
    render(<ScheduleChangeSheet {...props} />);
    fireEvent.changeText(screen.getByLabelText('Reason'), 'Late shift');
    expect(screen.getByText('10/300')).toBeTruthy();
  });
});
