import React from 'react';
import { render } from '@testing-library/react-native';
import SPEditProfileScreen from '../SPEditProfileScreen';
import { api } from '../../../../src/lib/api';
import { useAuth } from '../../../../src/context/AuthContext';
import { clearAsyncDataCache } from '../../../../src/hooks/useAsyncData';
import { expectSavedCopyIgnored } from '../../../../src/testing/savedCopy';

jest.mock('../../../../src/context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../../../src/lib/api', () => ({
  api: {
    categories: jest.fn(),
    updateProfile: jest.fn(),
    upsertProviderProfile: jest.fn(),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  clearAsyncDataCache();
  (useAuth as jest.Mock).mockReturnValue({
    profile: { id: 'sp-sam', full_name: 'Sam Reyes', email: 'sam@example.com', phone: null, city: 'Cebu', address: null },
    providerProfile: {
      category_id: 1,
      service_categories: { id: 1, name: 'Plumbing' },
      service_radius_km: 25,
      bio: null,
      years_experience: null,
    },
    refreshProfile: jest.fn(),
  });
});

it('a saved service list of the wrong shape is ignored, and the screen loads as it does with nothing saved', async () => {
  (api.categories as jest.Mock).mockReturnValue(new Promise(() => {}));

  await expectSavedCopyIgnored('categories', {}, () =>
    render(<SPEditProfileScreen onBack={jest.fn()} onSave={jest.fn()} onManageServices={jest.fn()} />),
  );
});
