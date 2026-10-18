import React from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import AddressField from '../../components/AddressField';
import { useScrollToFirstError } from '../useScrollToFirstError';

jest.mock('../../lib/api', () => ({
  api: { addressSuggestions: jest.fn().mockResolvedValue([]), reverseGeocode: jest.fn() },
}));
jest.mock('../../lib/permissions', () => ({ requestAppPermission: jest.fn() }));
jest.mock('expo-location', () => ({ Accuracy: { Balanced: 3 }, getCurrentPositionAsync: jest.fn() }));

const ORDER = ['first', 'address'] as const;
let check: (errors: Partial<Record<(typeof ORDER)[number], string>>) => string | null;

function Form() {
  const { scrollRef, fieldLayout, inputRef, scrollToFirstError } = useScrollToFirstError(ORDER);
  check = scrollToFirstError;
  return (
    <ScrollView ref={scrollRef} testID="scroll">
      <View onLayout={fieldLayout('first')}>
        <TextInput ref={inputRef('first')} testID="first" />
      </View>
      <View onLayout={fieldLayout('address')}>
        <AddressField ref={inputRef('address')} testID="address" value="" onChangeText={jest.fn()} onResolve={jest.fn()} />
      </View>
    </ScrollView>
  );
}

describe('useScrollToFirstError', () => {
  it('scrolls to the topmost field with an error and focuses it, whatever order the errors were found in', () => {
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => {});
    const focus = jest.spyOn(TextInput.prototype, 'focus').mockImplementation(() => {});
    render(<Form />);
    fireEvent(screen.getByTestId('first').parent!, 'layout', { nativeEvent: { layout: { y: 100 } } });

    expect(check({ address: 'bad', first: 'bad' })).toBe('first');

    expect(scrollTo).toHaveBeenCalledWith({ y: 88, animated: true });
    expect(focus.mock.instances[0]).toMatchObject({ props: { testID: 'first' } });
    scrollTo.mockRestore();
    focus.mockRestore();
  });

  it('reaches the input inside AddressField through its ref', () => {
    const focus = jest.spyOn(TextInput.prototype, 'focus').mockImplementation(() => {});
    render(<Form />);

    expect(check({ address: 'bad' })).toBe('address');

    expect(focus.mock.instances[0]).toMatchObject({ props: { testID: 'address' } });
    focus.mockRestore();
  });

  it('does nothing when there are no errors', () => {
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => {});
    render(<Form />);
    scrollTo.mockClear();

    expect(check({})).toBeNull();

    expect(scrollTo).not.toHaveBeenCalled();
    scrollTo.mockRestore();
  });
});
