import React from 'react';
import { Keyboard } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import DeclineBookingModal, { DECLINE_REASON_MAX, declineReason, noteLimitFor } from '../DeclineBookingModal';

const REASONS = [
  'Already booked at that time',
  'Too far from my service area',
  'Job needs skills I do not offer',
  'Budget is too low for this work',
];

describe('DeclineBookingModal — keyboard dismissal on outside tap (#7/#17)', () => {
  it('dismisses the keyboard, but does not close the dialog, when the dialog body is tapped', () => {
    const dismissSpy = jest.spyOn(Keyboard, 'dismiss');
    const onCancel = jest.fn();
    const onConfirm = jest.fn();

    render(
      <DeclineBookingModal
        visible
        jobTitle="Fix the sink"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    // Press the dialog's own Pressable directly (empty space), not a
    // descendant — this must not bubble to the backdrop's onCancel.
    fireEvent.press(screen.getByTestId('decline-dialog'), { stopPropagation: jest.fn() });

    expect(dismissSpy).toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();

    dismissSpy.mockRestore();
  });
});

describe('declineReason and noteLimitFor', () => {
  it('sends the chosen reason alone, or with the trimmed note after it', () => {
    expect(declineReason(REASONS[0], '   ')).toBe(REASONS[0]);
    expect(declineReason(REASONS[0], '  Free on Friday  ')).toBe(`${REASONS[0]}. Free on Friday`);
  });

  it('leaves room for the reason, so the whole reason stays within 200 characters', () => {
    expect(DECLINE_REASON_MAX).toBe(200);
    expect(noteLimitFor(null)).toBe(200);
    expect(noteLimitFor(REASONS[0])).toBe(200 - (REASONS[0].length + 2));
    expect(declineReason(REASONS[0], 'x'.repeat(noteLimitFor(REASONS[0]))).length).toBeLessThanOrEqual(200);
  });
});

describe('DeclineBookingModal — reason choices, an optional note and Keep booking', () => {
  const renderModal = (props: Partial<React.ComponentProps<typeof DeclineBookingModal>> = {}) => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    render(
      <DeclineBookingModal visible jobTitle="Fix the sink" onCancel={onCancel} onConfirm={onConfirm} {...props} />,
    );
    return { onConfirm, onCancel };
  };
  const decline = () => screen.getByRole('button', { name: 'Decline booking' });
  const pick = (reason: string) => fireEvent.press(screen.getByRole('radio', { name: reason }));
  const note = () => screen.getByLabelText('Add a note (optional)');

  it('offers the four reasons as choices, worded as before', () => {
    renderModal();

    for (const reason of REASONS) {
      expect(screen.getByRole('radio', { name: reason })).toBeTruthy();
    }
  });

  it('keeps Decline booking disabled until a reason is chosen', () => {
    const { onConfirm } = renderModal();
    expect(decline().props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(decline());
    expect(onConfirm).not.toHaveBeenCalled();

    pick(REASONS[1]);
    expect(decline().props.accessibilityState?.disabled).toBe(false);
  });

  it('declines with exactly the chosen reason', () => {
    const { onConfirm } = renderModal();

    pick(REASONS[1]);
    fireEvent.press(decline());

    expect(onConfirm).toHaveBeenCalledWith('Too far from my service area');
  });

  it('adds an optional note after the chosen reason', () => {
    const { onConfirm } = renderModal();

    pick(REASONS[0]);
    fireEvent.changeText(note(), '  Free on Friday  ');
    fireEvent.press(decline());

    expect(onConfirm).toHaveBeenCalledWith('Already booked at that time. Free on Friday');
  });

  it('picking a reason keeps the whole note, and the counter shows the room the reason leaves', () => {
    renderModal();

    fireEvent.changeText(note(), 'Free on Friday');
    pick(REASONS[0]);

    expect(note().props.value).toBe('Free on Friday');
    expect(note().props.maxLength).toBe(DECLINE_REASON_MAX);
    expect(screen.getByText(`14/${noteLimitFor(REASONS[0])}`)).toBeTruthy();
  });

  it('a typed note alone is a reason: Decline booking is enabled and sends the trimmed note', () => {
    const { onConfirm } = renderModal();

    fireEvent.changeText(note(), '  Out of town that week  ');
    expect(decline().props.accessibilityState?.disabled).toBe(false);
    fireEvent.press(decline());

    expect(onConfirm).toHaveBeenCalledWith('Out of town that week');
  });

  it('spaces alone are not a reason, and clearing a typed note takes the reason away again', () => {
    const { onConfirm } = renderModal();

    fireEvent.changeText(note(), '    ');
    expect(decline().props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(decline());
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.changeText(note(), 'Out of town');
    expect(decline().props.accessibilityState?.disabled).toBe(false);
    fireEvent.changeText(note(), '');
    expect(decline().props.accessibilityState?.disabled).toBe(true);
  });

  it('picking a reason after a long note never cuts the note', () => {
    const { onConfirm } = renderModal();

    fireEvent.changeText(note(), 'x'.repeat(190));
    pick(REASONS[0]);

    expect(note().props.value).toBe('x'.repeat(190));
    expect(decline().props.accessibilityState?.disabled).toBe(true);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('when the reason and note together are too long, says how much to cut and waits for a shorter note', () => {
    const { onConfirm } = renderModal();

    pick(REASONS[0]);
    fireEvent.changeText(note(), 'x'.repeat(190));

    // 27 + 2 + 190 is 219 characters: 19 over the 200 the API accepts.
    expect(screen.getByText('Shorten your reason by 19 characters.')).toBeTruthy();
    expect(screen.getByText(`190/${noteLimitFor(REASONS[0])}`)).toBeTruthy();
    expect(decline().props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(decline());
    expect(onConfirm).not.toHaveBeenCalled();

    // 27 + 2 + 171 is exactly 200, so the note fits and the reason goes through whole.
    fireEvent.changeText(note(), 'x'.repeat(171));
    expect(screen.queryByText(/Shorten your reason/)).toBeNull();
    expect(decline().props.accessibilityState?.disabled).toBe(false);
    fireEvent.press(decline());
    expect(onConfirm).toHaveBeenCalledWith(`${REASONS[0]}. ${'x'.repeat(171)}`);
  });

  it('keeps booking without declining', () => {
    const { onCancel, onConfirm } = renderModal();

    fireEvent.press(screen.getByRole('button', { name: 'Keep booking' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('shows the error and locks the choices while declining', () => {
    renderModal({ submitting: true, error: 'Could not decline this booking.' });

    expect(screen.getByText('Could not decline this booking.')).toBeTruthy();
    expect(screen.getByRole('radio', { name: REASONS[0] }).props.accessibilityState?.disabled).toBe(true);
    expect(decline().props.accessibilityState?.disabled).toBe(true);
  });

  it('starts with nothing chosen when it opens for another booking', () => {
    const onCancel = jest.fn();
    const onConfirm = jest.fn();
    const { rerender } = render(<DeclineBookingModal visible onCancel={onCancel} onConfirm={onConfirm} />);

    pick(REASONS[0]);
    rerender(<DeclineBookingModal visible={false} onCancel={onCancel} onConfirm={onConfirm} />);
    rerender(<DeclineBookingModal visible onCancel={onCancel} onConfirm={onConfirm} />);

    expect(screen.getByRole('radio', { name: REASONS[0] }).props.accessibilityState?.checked).toBe(false);
  });
});

describe('DeclineBookingModal — a note of spaces is not a reason', () => {
  const renderOpen = () => {
    const onConfirm = jest.fn();
    render(<DeclineBookingModal visible jobTitle="Fix the sink" onCancel={jest.fn()} onConfirm={onConfirm} />);
    return { onConfirm };
  };
  const note = () => screen.getByPlaceholderText('Anything the client should know');
  const decline = () => screen.getByRole('button', { name: 'Decline booking' });

  it('keeps Decline booking off for a note of spaces alone, and says a reason is needed once the note is left', () => {
    renderOpen();
    fireEvent.changeText(note(), '   ');

    expect(decline().props.accessibilityState?.disabled).toBe(true);
    expect(screen.queryByText('Pick a reason above, or write one here.')).toBeNull();
    fireEvent(note(), 'blur');
    expect(screen.getByText('Pick a reason above, or write one here.')).toBeTruthy();
  });

  it('with a reason picked, spaces in the note are not sent after the reason', () => {
    const { onConfirm } = renderOpen();
    fireEvent.press(screen.getByRole('radio', { name: 'Too far from my service area' }));
    fireEvent.changeText(note(), '   \n\n  ');

    fireEvent.press(decline());

    expect(onConfirm).toHaveBeenCalledWith('Too far from my service area');
  });
});
