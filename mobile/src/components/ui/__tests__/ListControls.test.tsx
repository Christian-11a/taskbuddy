import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import SectionHeader from '../SectionHeader';
import FilterPill from '../FilterPill';
import ViewSwitch from '../ViewSwitch';

it('SectionHeader shows count and link', () => {
  const onLink = jest.fn();
  render(<SectionHeader title="Active jobs" count={5} linkLabel="See all" onLinkPress={onLink} />);
  expect(screen.getByRole('header', { name: 'Active jobs' })).toBeTruthy();
  expect(screen.getByText('5')).toBeTruthy();
  fireEvent.press(screen.getByText('See all'));
  expect(onLink).toHaveBeenCalled();
});

it('FilterPill reports selection and has a 48dp touch area', () => {
  const onPress = jest.fn();
  render(<FilterPill label="Needs you" count={1} selected={false} onPress={onPress} />);
  const pill = screen.getByRole('button', { name: 'Needs you, 1' });
  expect(pill.props.accessibilityState).toEqual(expect.objectContaining({ selected: false }));
  expect(pill.props.hitSlop).toEqual({ top: 7, bottom: 7 });
  fireEvent.press(pill);
  expect(onPress).toHaveBeenCalled();
});

it('ViewSwitch changes value', () => {
  const onChange = jest.fn();
  render(<ViewSwitch options={[{ key: 'list', label: 'List' }, { key: 'calendar', label: 'Calendar' }] as const}
    value="list" onChange={onChange} />);
  expect(screen.getByRole('tab', { name: 'List' }).props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
  fireEvent.press(screen.getByRole('tab', { name: 'Calendar' }));
  expect(onChange).toHaveBeenCalledWith('calendar');
});
