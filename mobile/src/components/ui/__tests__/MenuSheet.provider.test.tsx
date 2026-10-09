import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Flag, FileWarning } from 'lucide-react-native';
import MenuSheet from '../MenuSheet';
import { lightPalette } from '../../../constants/palettes';

const flatStyle = (style: unknown) => StyleSheet.flatten(style as never) as Record<string, unknown>;

describe('MenuSheet', () => {
  it('shows the job title and every action when visible', () => {
    render(
      <MenuSheet
        visible
        title="Fix the sink"
        items={[
          { label: 'File a Complaint', icon: Flag, onPress: jest.fn() },
          { label: 'View Complaint Status', icon: FileWarning, onPress: jest.fn() },
        ]}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByText('Fix the sink').props.accessibilityRole).toBe('header');
    expect(screen.getByRole('button', { name: 'File a Complaint' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'View Complaint Status' })).toBeTruthy();
  });

  it('shows nothing while hidden', () => {
    render(
      <MenuSheet
        visible={false}
        title="Fix the sink"
        items={[{ label: 'File a Complaint', icon: Flag, onPress: jest.fn() }]}
        onClose={jest.fn()}
      />,
    );

    expect(screen.queryByText('Fix the sink')).toBeNull();
    expect(screen.queryByRole('button', { name: 'File a Complaint' })).toBeNull();
  });

  it('closes the sheet first, then runs the chosen action', () => {
    const onClose = jest.fn();
    const onPress = jest.fn();
    render(
      <MenuSheet visible title="Fix the sink" items={[{ label: 'File a Complaint', icon: Flag, onPress }]} onClose={onClose} />,
    );

    fireEvent.press(screen.getByRole('button', { name: 'File a Complaint' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onClose.mock.invocationCallOrder[0]).toBeLessThan(onPress.mock.invocationCallOrder[0]);
  });

  it('paints a danger row in the danger colour and shows its hint underneath', () => {
    render(
      <MenuSheet
        visible
        title="Fix the sink"
        items={[
          {
            label: 'Cancel job',
            icon: Flag,
            tone: 'danger',
            hint: 'Cancelling after hiring asks the provider to agree. Your money comes back once they do.',
            onPress: jest.fn(),
          },
        ]}
        onClose={jest.fn()}
      />,
    );

    expect(flatStyle(screen.getByText('Cancel job').props.style).color).toBe(lightPalette.Colors.dangerText);
    expect(
      screen.getByText('Cancelling after hiring asks the provider to agree. Your money comes back once they do.'),
    ).toBeTruthy();
  });

  it('keeps a default row in the normal text colour and without a hint', () => {
    render(
      <MenuSheet visible title="Fix the sink" items={[{ label: 'File a Complaint', icon: Flag, onPress: jest.fn() }]} onClose={jest.fn()} />,
    );

    expect(flatStyle(screen.getByText('File a Complaint').props.style).color).not.toBe(lightPalette.Colors.dangerText);
    expect(screen.queryByText(/Cancelling after hiring/)).toBeNull();
  });
});
