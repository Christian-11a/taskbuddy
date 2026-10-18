import React from 'react';
import { ScrollView, TextInput } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import HOEditProfileScreen from '../HOEditProfileScreen';

jest.mock('../../../../src/context/AuthContext', () => ({
  useAuth: () => ({
    profile: { full_name: '', phone: '', address: '', city: '', email: 'a@b.co' },
    refreshProfile: jest.fn(),
  }),
}));
jest.mock('../../../../src/lib/api', () => ({
  api: { updateProfile: jest.fn(), addressSuggestions: jest.fn().mockResolvedValue([]), reverseGeocode: jest.fn() },
}));
jest.mock('../../../../src/components/AvatarPicker', () => () => null);

describe('HOEditProfileScreen failed Save', () => {
  it('scrolls to and focuses the first invalid field', () => {
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => {});
    const focus = jest.spyOn(TextInput.prototype, 'focus').mockImplementation(() => {});
    render(<HOEditProfileScreen onBack={jest.fn()} onSave={jest.fn()} />);

    fireEvent.press(screen.getByText('Save changes'));

    // The name is empty, and it is the topmost field.
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus.mock.instances[0]).toMatchObject({ props: { accessibilityLabel: 'Full name' } });
    scrollTo.mockRestore();
    focus.mockRestore();
  });

  it('focuses the address when it is the first invalid field', () => {
    const focus = jest.spyOn(TextInput.prototype, 'focus').mockImplementation(() => {});
    render(<HOEditProfileScreen onBack={jest.fn()} onSave={jest.fn()} />);
    fireEvent.changeText(screen.getByLabelText('Full name'), 'Juan Dela Cruz');
    fireEvent.changeText(screen.getByPlaceholderText('House no., Barangay, Street'), '12');

    fireEvent.press(screen.getByText('Save changes'));

    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus.mock.instances[0]).toMatchObject({ props: { placeholder: 'House no., Barangay, Street' } });
    focus.mockRestore();
  });
});
