import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import SPSkillRequestScreen from '../../../app/(provider)/screens/SPSkillRequestScreen';
import { useNotifications } from '../NotificationsContext';
import { useAuth } from '../AuthContext';
import { api } from '../../lib/api';
jest.mock('../NotificationsContext', () => ({ useNotifications: jest.fn() }));
jest.mock('../AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../lib/api', () => ({
  api: { categories: jest.fn(), mySkillRequests: jest.fn() },
}));
it('refreshes requests after a decision and the profile on entry', async () => {
  const refresh = jest.fn().mockResolvedValue(undefined);
  (useAuth as jest.Mock).mockReturnValue({
    providerProfile: {
      category_id: 1,
      service_categories: { name: 'Plumbing' },
    },
    refreshProfile: refresh,
  });
  (useNotifications as jest.Mock).mockReturnValue({ notifications: [] });
  (api.categories as jest.Mock).mockResolvedValue([]);
  (api.mySkillRequests as jest.Mock).mockResolvedValue([]);
  const view = render(<SPSkillRequestScreen onBack={jest.fn()} />);
  await waitFor(() => expect(api.mySkillRequests).toHaveBeenCalledTimes(1));
  (useNotifications as jest.Mock).mockReturnValue({
    notifications: [{ id: 'decision-1', data: { request_id: 'r1' } }],
  });
  view.rerender(<SPSkillRequestScreen onBack={jest.fn()} />);
  await waitFor(() => expect(api.mySkillRequests).toHaveBeenCalledTimes(2));
  expect(refresh).toHaveBeenCalledTimes(1);
});
