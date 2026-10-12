import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { CircleX, FileText, TriangleAlert } from 'lucide-react-native';
import MenuSheet from '../MenuSheet';
import { lightPalette } from '../../../constants/palettes';

const colorOf = (label: string) => StyleSheet.flatten(screen.getByText(label).props.style).color;

describe('MenuSheet', () => {
  it('shows the job title and one button per row when open', () => {
    render(
      <MenuSheet
        visible
        title="Plumbing: Fix toilet"
        items={[
          { label: 'Report a problem', icon: TriangleAlert, onPress: jest.fn() },
          { label: 'View case', icon: FileText, onPress: jest.fn() },
        ]}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByText('Plumbing: Fix toilet')).toBeTruthy();
    expect(screen.getByLabelText('Report a problem')).toBeTruthy();
    expect(screen.getByLabelText('View case')).toBeTruthy();
  });

  it('shows nothing while it is closed', () => {
    render(
      <MenuSheet
        visible={false}
        title="Plumbing: Fix toilet"
        items={[{ label: 'Report a problem', icon: TriangleAlert, onPress: jest.fn() }]}
        onClose={jest.fn()}
      />,
    );

    expect(screen.queryByText('Plumbing: Fix toilet')).toBeNull();
    expect(screen.queryByLabelText('Report a problem')).toBeNull();
  });

  it('closes the sheet first, then runs the chosen row', () => {
    const order: string[] = [];
    const onClose = jest.fn(() => order.push('close'));
    const onPress = jest.fn(() => order.push('action'));
    render(
      <MenuSheet
        visible
        title="Plumbing: Fix toilet"
        items={[{ label: 'Report a problem', icon: TriangleAlert, onPress }]}
        onClose={onClose}
      />,
    );

    fireEvent.press(screen.getByLabelText('Report a problem'));

    expect(order).toEqual(['close', 'action']);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('a danger row uses the danger colour, a default row does not', () => {
    render(
      <MenuSheet
        visible
        title="Plumbing: Fix toilet"
        items={[
          { label: 'Report a problem', icon: TriangleAlert, onPress: jest.fn() },
          { label: 'Cancel job', icon: CircleX, tone: 'danger', onPress: jest.fn() },
        ]}
        onClose={jest.fn()}
      />,
    );

    expect(colorOf('Cancel job')).toBe(lightPalette.V6Colors.dangerText);
    expect(colorOf('Report a problem')).toBe(lightPalette.V6Colors.ink900);
  });

  it('shows the hint under a danger row when one is given', () => {
    render(
      <MenuSheet
        visible
        title="Plumbing: Fix toilet"
        items={[
          {
            label: 'Cancel job',
            icon: CircleX,
            tone: 'danger',
            hint: 'Cancelling after hiring asks the provider to agree. Your money comes back once they do.',
            onPress: jest.fn(),
          },
        ]}
        onClose={jest.fn()}
      />,
    );

    expect(
      screen.getByText('Cancelling after hiring asks the provider to agree. Your money comes back once they do.'),
    ).toBeTruthy();
  });

  it('shows no hint when the row has none', () => {
    render(
      <MenuSheet
        visible
        title="Plumbing: Fix toilet"
        items={[{ label: 'Cancel job', icon: CircleX, tone: 'danger', onPress: jest.fn() }]}
        onClose={jest.fn()}
      />,
    );

    expect(screen.queryByText(/Cancelling after hiring/)).toBeNull();
  });

  it('a row with a hint still reads as a button labelled with the action', () => {
    render(
      <MenuSheet
        visible
        title="Plumbing: Fix toilet"
        items={[{ label: 'Cancel job', icon: CircleX, tone: 'danger', hint: 'Your money comes back once they do.', onPress: jest.fn() }]}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Cancel job' })).toBeTruthy();
  });
});
