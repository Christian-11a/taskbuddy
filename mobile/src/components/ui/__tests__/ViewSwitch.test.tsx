import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import ViewSwitch from '../ViewSwitch';
import { lightPalette } from '../../../constants/palettes';

const OPTIONS = [{ key: 'list', label: 'List' }, { key: 'calendar', label: 'Calendar' }] as const;

/** The colours a host element is drawn with: its style, flattened. */
function styleOf(element: { props: Record<string, any> }): Record<string, any> {
  return StyleSheet.flatten(element.props.style) ?? {};
}

it('fills only the picked segment with the surface, and the other segment is transparent', () => {
  render(<ViewSwitch options={OPTIONS} value="list" onChange={jest.fn()} />);

  expect(styleOf(screen.getByRole('tab', { name: 'List' })).backgroundColor).toBe(lightPalette.V6Colors.surface);
  expect(styleOf(screen.getByRole('tab', { name: 'Calendar' })).backgroundColor).toBe('transparent');
  expect(styleOf(screen.getByText('List')).color).toBe(lightPalette.Colors.link);
  expect(styleOf(screen.getByText('Calendar')).color).toBe(lightPalette.V6Colors.ink500);
});

it('moves the surface to the newly picked segment, which is recreated so Android repaints it', () => {
  const onChange = jest.fn();
  const view = render(<ViewSwitch options={OPTIONS} value="list" onChange={onChange} />);
  const before = screen.getByRole('tab', { name: 'Calendar' });

  view.rerender(<ViewSwitch options={OPTIONS} value="calendar" onChange={onChange} />);

  expect(styleOf(screen.getByRole('tab', { name: 'Calendar' })).backgroundColor).toBe(lightPalette.V6Colors.surface);
  expect(styleOf(screen.getByRole('tab', { name: 'List' })).backgroundColor).toBe('transparent');
  expect(screen.getByRole('tab', { name: 'Calendar' })).not.toBe(before);
});

it('reports the segment that was pressed', () => {
  const onChange = jest.fn();
  render(<ViewSwitch options={OPTIONS} value="list" onChange={onChange} />);

  fireEvent.press(screen.getByRole('tab', { name: 'Calendar' }));

  expect(onChange).toHaveBeenCalledWith('calendar');
});
