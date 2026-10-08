import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { lightPalette } from '../../constants/palettes';
import ConfirmationModal from '../ConfirmationModal';

describe('ConfirmationModal — destructive styling', () => {
  it('renders the confirm button red when destructive', () => {
    render(
      <ConfirmationModal
        visible
        destructive
        title="Discard changes?"
        message="Your draft will be lost."
        confirmLabel="Discard & Exit"
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    const button = screen.getByLabelText('Discard & Exit');
    const flatStyle = [].concat(button.props.style).reduce(
      (acc: Record<string, unknown>, s: Record<string, unknown>) => ({ ...acc, ...s }),
      {},
    );
    expect(flatStyle.backgroundColor).toBe('#b91c1c');
  });

  it('keeps the default (non-red) style when not destructive', () => {
    render(
      <ConfirmationModal
        visible
        title="Mark complete?"
        message="This releases funds."
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    const button = screen.getByLabelText('Confirm');
    const flatStyle = [].concat(button.props.style).reduce(
      (acc: Record<string, unknown>, s: Record<string, unknown>) => ({ ...acc, ...s }),
      {},
    );
    expect(flatStyle.backgroundColor).not.toBe('#b91c1c');
  });

  it('sets the icon on a danger tint when destructive', () => {
    render(
      <ConfirmationModal
        visible
        destructive
        title="Discard changes?"
        message="Your draft will be lost."
        confirmLabel="Discard & Exit"
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    const circle = screen.getByTestId('confirm-icon-circle');
    expect(StyleSheet.flatten(circle.props.style).backgroundColor).toBe(lightPalette.Colors.dangerSurface);
  });

  it('sets the icon on a brand tint when not destructive', () => {
    render(
      <ConfirmationModal
        visible
        title="Mark complete?"
        message="This releases funds."
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    const circle = screen.getByTestId('confirm-icon-circle');
    expect(StyleSheet.flatten(circle.props.style).backgroundColor).toBe(lightPalette.Colors.primaryTonal);
  });
});
