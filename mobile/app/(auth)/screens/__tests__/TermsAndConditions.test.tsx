import React from 'react';
import { Modal, ScrollView, StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import TermsAndConditions from '../TermsAndConditions';

const agreeLabel = (doc: 'Terms & Conditions' | 'Privacy Policy') => `I agree to the ${doc}`;
const agreeButton = (doc: 'Terms & Conditions' | 'Privacy Policy') =>
  screen.getByRole('button', { name: agreeLabel(doc) });
const body = () => screen.getByTestId('terms-body');

/** The text is scrolled down to its end, with a 400 dp viewport over 1400 dp of text. */
function scrollToEnd() {
  fireEvent.scroll(body(), {
    nativeEvent: { contentOffset: { y: 1000 }, layoutMeasurement: { height: 400 }, contentSize: { height: 1400 } },
  });
}

function renderPopup(props: Partial<React.ComponentProps<typeof TermsAndConditions>> = {}) {
  const onBack = jest.fn();
  const onAccept = jest.fn();
  const view = render(
    <TermsAndConditions visible mode="terms" onBack={onBack} onAccept={onAccept} {...props} />,
  );
  return { view, onBack, onAccept };
}

it('keeps every privacy section in a scrollable body, with a close action that does not accept', () => {
  const { onBack, onAccept } = renderPopup({ mode: 'privacy' });
  expect(StyleSheet.flatten(screen.UNSAFE_getByType(ScrollView).props.style)).toMatchObject({ flex: 1, minHeight: 0 });
  for (const heading of ['What We Collect', 'How We Use Your Data', 'Data Storage & Security', 'Your Rights (RA 10173)', 'Retention']) {
    expect(screen.getByText(heading)).toBeTruthy();
  }
  fireEvent(screen.UNSAFE_getByType(Modal), 'requestClose');
  expect(onBack).toHaveBeenCalledTimes(1);
  expect(onAccept).not.toHaveBeenCalled();
});

it('has a Terms tab and a Privacy tab, and opens on the one it was asked for', () => {
  renderPopup({ mode: 'privacy' });
  expect(screen.getByRole('tab', { name: 'Terms' }).props.accessibilityState).toMatchObject({ selected: false });
  expect(screen.getByRole('tab', { name: 'Privacy' }).props.accessibilityState).toMatchObject({ selected: true });
  expect(screen.getByText('Your Rights (RA 10173)')).toBeTruthy();
});

it('keeps the button disabled until the text has been scrolled to the end', () => {
  const { onAccept } = renderPopup();
  expect(agreeButton('Terms & Conditions').props.accessibilityState).toMatchObject({ disabled: true });
  expect(screen.getByText('Scroll to the end to continue')).toBeTruthy();

  fireEvent.press(agreeButton('Terms & Conditions'));
  expect(onAccept).not.toHaveBeenCalled();
  expect(screen.queryByText('Scroll to the end to continue')).toBeTruthy();

  fireEvent.scroll(body(), {
    nativeEvent: { contentOffset: { y: 500 }, layoutMeasurement: { height: 400 }, contentSize: { height: 1400 } },
  });
  expect(agreeButton('Terms & Conditions').props.accessibilityState).toMatchObject({ disabled: true });

  scrollToEnd();
  expect(agreeButton('Terms & Conditions').props.accessibilityState).toMatchObject({ disabled: false });
  expect(screen.queryByText('Scroll to the end to continue')).toBeNull();
});

/** A long text in a 400 dp viewport, reported at the given offset by the given scroll event. */
function reportAt(eventName: 'scroll' | 'scrollEndDrag' | 'momentumScrollEnd', y: number) {
  fireEvent(body(), eventName, {
    nativeEvent: { contentOffset: { y }, layoutMeasurement: { height: 400 }, contentSize: { height: 1400 } },
  });
}

it('treats text within 48 dp of its end as read', () => {
  renderPopup();
  reportAt('scroll', 960);
  expect(agreeButton('Terms & Conditions').props.accessibilityState).toMatchObject({ disabled: false });
});

it('does not treat text 100 dp short of its end as read', () => {
  renderPopup();
  reportAt('scroll', 900);
  expect(agreeButton('Terms & Conditions').props.accessibilityState).toMatchObject({ disabled: true });
});

it('reads to the end when the resting position is only reported at momentum end', () => {
  renderPopup();
  fireEvent(body(), 'layout', { nativeEvent: { layout: { height: 400 } } });
  fireEvent(body(), 'contentSizeChange', 300, 1400);
  reportAt('momentumScrollEnd', 1000);
  expect(agreeButton('Terms & Conditions').props.accessibilityState).toMatchObject({ disabled: false });
});

it('reads to the end when the resting position is only reported at the end of a drag', () => {
  renderPopup();
  fireEvent(body(), 'layout', { nativeEvent: { layout: { height: 400 } } });
  fireEvent(body(), 'contentSizeChange', 300, 1400);
  reportAt('scrollEndDrag', 1000);
  expect(agreeButton('Terms & Conditions').props.accessibilityState).toMatchObject({ disabled: false });
});

it('does not read a long text from its layout alone, before any scroll', () => {
  renderPopup();
  fireEvent(body(), 'layout', { nativeEvent: { layout: { height: 400 } } });
  fireEvent(body(), 'contentSizeChange', 300, 1400);
  expect(agreeButton('Terms & Conditions').props.accessibilityState).toMatchObject({ disabled: true });
});

it('enables a short text at once, because it fits the viewport', () => {
  renderPopup();
  fireEvent(body(), 'layout', { nativeEvent: { layout: { height: 600 } } });
  fireEvent(body(), 'contentSizeChange', 300, 300);
  expect(agreeButton('Terms & Conditions').props.accessibilityState).toMatchObject({ disabled: false });
});

it('a screen reader can mark the text read with the Mark as read action', () => {
  renderPopup();
  fireEvent(body(), 'accessibilityAction', { nativeEvent: { actionName: 'markAsRead' } });
  expect(agreeButton('Terms & Conditions').props.accessibilityState).toMatchObject({ disabled: false });
});

it('accepting terms puts a check mark on the tab and moves on to privacy', () => {
  const onAccept = jest.fn();
  const { view } = renderPopup({ onAccept });
  scrollToEnd();
  fireEvent.press(agreeButton('Terms & Conditions'));

  expect(onAccept).toHaveBeenCalledWith('terms');
  view.rerender(
    <TermsAndConditions
      visible mode="terms" onBack={jest.fn()} onAccept={onAccept} accepted={{ terms: true, privacy: false }}
    />,
  );
  expect(screen.getByRole('tab', { name: 'Terms ✓' })).toBeTruthy();
  expect(screen.getByRole('tab', { name: 'Privacy' }).props.accessibilityState).toMatchObject({ selected: true });
  expect(screen.getByText('Your Rights (RA 10173)')).toBeTruthy();
});

it('the privacy text starts unread even after terms was accepted', () => {
  renderPopup({ accepted: { terms: true, privacy: false }, mode: 'privacy' });
  expect(agreeButton('Privacy Policy').props.accessibilityState).toMatchObject({ disabled: true });
});

it('accepting the last document closes the pop-up', () => {
  const onAccept = jest.fn();
  const onBack = jest.fn();
  renderPopup({ mode: 'privacy', accepted: { terms: true, privacy: false }, onAccept, onBack });
  scrollToEnd();
  fireEvent.press(agreeButton('Privacy Policy'));

  expect(onAccept).toHaveBeenCalledWith('privacy');
  expect(onBack).toHaveBeenCalledTimes(1);
});

it('tabs can be tapped freely, and a document accepted earlier counts as read', () => {
  renderPopup({ accepted: { terms: true, privacy: false } });
  fireEvent.press(screen.getByRole('tab', { name: 'Privacy' }));
  expect(screen.getByText('Your Rights (RA 10173)')).toBeTruthy();
  fireEvent.press(screen.getByRole('tab', { name: 'Terms ✓' }));
  expect(agreeButton('Terms & Conditions').props.accessibilityState).toMatchObject({ disabled: false });
});

it('closing only closes: nothing is accepted by it', () => {
  const onBack = jest.fn();
  const onAccept = jest.fn();
  renderPopup({ onBack, onAccept, accepted: { terms: true, privacy: false } });
  fireEvent.press(screen.getByRole('button', { name: 'Close' }));
  expect(onBack).toHaveBeenCalledTimes(1);
  expect(onAccept).not.toHaveBeenCalled();
});

it('reopening opens on the tab it is asked for', () => {
  const props = { onBack: jest.fn(), onAccept: jest.fn(), accepted: { terms: true, privacy: false } };
  const { view } = renderPopup({ ...props, mode: 'terms' });
  fireEvent.press(screen.getByRole('tab', { name: 'Privacy' }));
  view.rerender(<TermsAndConditions visible={false} mode="privacy" {...props} />);
  view.rerender(<TermsAndConditions visible mode="privacy" {...props} />);
  expect(screen.getByRole('tab', { name: 'Privacy' }).props.accessibilityState).toMatchObject({ selected: true });
});

const headerTexts = () => screen.queryAllByRole('header').map((h) => String(h.props.children));

it('opens the Terms on the intro paragraph, with no version line above it', () => {
  renderPopup();
  expect(screen.getByText(/^These Terms govern your use of TaskBuddy\./)).toBeTruthy();
  const headers = headerTexts();
  expect(headers[0]).toBe('1. Nature of the platform');
  expect(headers).toHaveLength(12);
  for (const h of headers) {
    expect(h).not.toMatch(/version/i);
    expect(h).not.toContain('October 17, 2026');
  }
  expect(screen.queryByText(/Terms of Use \(version/)).toBeNull();
});
