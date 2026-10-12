import React from 'react';
import { Modal, StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { LucideIcon } from 'lucide-react-native';
import ConfirmationModal from '../ConfirmationModal';
import SheetFrame from '../ui/SheetFrame';

describe('ConfirmationModal', () => {
  it('shows the title and message, and calls onConfirm when the confirm button is pressed', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();

    render(
      <ConfirmationModal
        visible
        title="Discard changes?"
        message="Your draft will be lost."
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByText('Discard changes?')).toBeTruthy();
    expect(screen.getByText('Your draft will be lost.')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel when the cancel button is pressed', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();

    render(
      <ConfirmationModal
        visible
        title="Discard changes?"
        message="Your draft will be lost."
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    fireEvent.press(screen.getByLabelText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('disables both buttons while busy', () => {
    render(
      <ConfirmationModal
        visible
        title="Discard changes?"
        message="Your draft will be lost."
        busy
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(screen.getByLabelText('Confirm').props.accessibilityState?.disabled).toBe(true);
    expect(screen.getByLabelText('Cancel').props.accessibilityState?.disabled).toBe(true);
  });

  it('calls onCancel when the Back gesture closes it', () => {
    const onCancel = jest.fn();
    render(
      <ConfirmationModal
        visible
        title="Discard changes?"
        message="Your draft will be lost."
        onConfirm={jest.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent(screen.UNSAFE_getByType(Modal), 'requestClose');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('ignores the Back gesture while busy, so the sheet stays locked', () => {
    const onCancel = jest.fn();
    render(
      <ConfirmationModal
        visible
        busy
        title="Discard changes?"
        message="Your draft will be lost."
        onConfirm={jest.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent(screen.UNSAFE_getByType(Modal), 'requestClose');
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('shows a spinner in place of the confirm label while busy, and keeps the button name', () => {
    render(
      <ConfirmationModal
        visible
        busy
        title="Discard changes?"
        message="Your draft will be lost."
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(screen.getByTestId('confirm-spinner')).toBeTruthy();
    expect(screen.queryByText('Confirm')).toBeNull();
    expect(screen.getByLabelText('Confirm')).toBeTruthy();
  });

  it('shows the confirm label and no spinner when idle', () => {
    render(
      <ConfirmationModal
        visible
        title="Discard changes?"
        message="Your draft will be lost."
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(screen.queryByTestId('confirm-spinner')).toBeNull();
    expect(screen.getByText('Confirm')).toBeTruthy();
  });

  it('draws the icon it is given in place of the default icon', () => {
    const CustomIcon = jest.fn(() => null);
    render(
      <ConfirmationModal
        visible
        icon={CustomIcon as unknown as LucideIcon}
        title="Mark complete?"
        message="This releases funds."
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(CustomIcon).toHaveBeenCalled();
  });

  it('opens as a centered dialog, not a bottom sheet', () => {
    render(
      <ConfirmationModal
        visible
        title="Discard changes?"
        message="Your draft will be lost."
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(screen.UNSAFE_getByType(SheetFrame).props.variant).toBe('dialog');
  });

  it('centers the icon, title, message and cancel link', () => {
    render(
      <ConfirmationModal
        visible
        title="Discard changes?"
        message="Your draft will be lost."
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(StyleSheet.flatten(screen.getByTestId('confirm-icon-circle').props.style).alignSelf).toBe('center');
    expect(StyleSheet.flatten(screen.getByText('Discard changes?').props.style).textAlign).toBe('center');
    expect(StyleSheet.flatten(screen.getByText('Your draft will be lost.').props.style).textAlign).toBe('center');
    expect(StyleSheet.flatten(screen.getByLabelText('Cancel').props.style).alignSelf).toBe('center');
  });

  it('pads the card 24 with a 14 gap between its rows', () => {
    render(
      <ConfirmationModal
        visible
        title="Discard changes?"
        message="Your draft will be lost."
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(StyleSheet.flatten(screen.getByRole('alert').props.style)).toEqual(
      expect.objectContaining({ padding: 24, gap: 14 }),
    );
  });

  it('wires the backdrop tap to onCancel, and removes it while busy', () => {
    const onCancel = jest.fn();
    const { rerender } = render(
      <ConfirmationModal
        visible
        title="Discard changes?"
        message="Your draft will be lost."
        onConfirm={jest.fn()}
        onCancel={onCancel}
      />,
    );

    screen.UNSAFE_getByType(SheetFrame).props.onClose?.();
    expect(onCancel).toHaveBeenCalledTimes(1);

    rerender(
      <ConfirmationModal
        visible
        busy
        title="Discard changes?"
        message="Your draft will be lost."
        onConfirm={jest.fn()}
        onCancel={onCancel}
      />,
    );

    expect(screen.UNSAFE_getByType(SheetFrame).props.onClose).toBeUndefined();
  });

  it('sends Back and the backdrop to onDismiss when one is given, and leaves onCancel alone', () => {
    const onCancel = jest.fn();
    const onDismiss = jest.fn();
    render(
      <ConfirmationModal
        visible
        title="Leave without saving?"
        message="You changed your phone number."
        confirmLabel="Keep editing"
        cancelLabel="Discard changes"
        onConfirm={jest.fn()}
        onCancel={onCancel}
        onDismiss={onDismiss}
      />,
    );

    fireEvent(screen.UNSAFE_getByType(Modal), 'requestClose');
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('keeps the cancel button on onCancel when onDismiss is given', () => {
    const onCancel = jest.fn();
    const onDismiss = jest.fn();
    render(
      <ConfirmationModal
        visible
        title="Leave without saving?"
        message="You changed your phone number."
        confirmLabel="Keep editing"
        cancelLabel="Discard changes"
        onConfirm={jest.fn()}
        onCancel={onCancel}
        onDismiss={onDismiss}
      />,
    );

    fireEvent.press(screen.getByLabelText('Discard changes'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('colours the cancel text for the danger tone only when asked, and leaves the confirm button alone', () => {
    const props = {
      visible: true,
      title: 'Leave without saving?',
      message: 'You changed your phone number.',
      confirmLabel: 'Keep editing',
      cancelLabel: 'Discard changes',
      onConfirm: jest.fn(),
      onCancel: jest.fn(),
    };
    const { unmount } = render(<ConfirmationModal {...props} />);
    const defaultCancelColour = StyleSheet.flatten(screen.getByText('Discard changes').props.style).color;
    const defaultConfirmFill = StyleSheet.flatten(screen.getByLabelText('Keep editing').props.style).backgroundColor;
    unmount();

    render(<ConfirmationModal {...props} cancelTone="danger" />);
    expect(StyleSheet.flatten(screen.getByText('Discard changes').props.style).color).not.toBe(defaultCancelColour);
    expect(StyleSheet.flatten(screen.getByLabelText('Keep editing').props.style).backgroundColor).toBe(
      defaultConfirmFill,
    );
  });
});
