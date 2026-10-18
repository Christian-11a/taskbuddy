import React from 'react';
import { Modal, StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import TourFinishCard from '../TourFinishCard';

// The sheet reads the bottom inset from the safe area; the spacing tests set it per case.
const mockInsets = { top: 0, right: 0, bottom: 0, left: 0 };
jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context');
  return { ...actual, useSafeAreaInsets: () => mockInsets };
});

// Confetti's props are recorded (which bursts were asked for), and the real layer is drawn, so its touch setting can be checked.
const mockConfettiActive: boolean[] = [];
jest.mock('../Confetti', () => {
  const React = require('react');
  const Actual = jest.requireActual('../Confetti').default;
  return {
    __esModule: true,
    default: (props: { active: boolean }) => {
      mockConfettiActive.push(props.active);
      return React.createElement(Actual, props);
    },
  };
});

type Props = Partial<React.ComponentProps<typeof TourFinishCard>>;

function renderCard(props: Props = {}) {
  const onAction = jest.fn();
  const base = { role: 'homeowner' as const, verified: false, firstName: 'Juan', firstRun: true, onAction };
  const view = render(<TourFinishCard {...base} {...props} />);
  return { onAction, ...view };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockConfettiActive.length = 0;
});

afterEach(() => {
  mockInsets.bottom = 0;
});

describe('TourFinishCard — the client', () => {
  it('says you are all set by first name, with the checklist and both buttons', () => {
    renderCard();

    expect(screen.getByText("You're all set, Juan")).toBeTruthy();
    expect(screen.getByText('Post a job')).toBeTruthy();
    expect(screen.getByText('Compare proposals')).toBeTruthy();
    expect(screen.getByText('Confirm when the job is done')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Post your first job' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Look around first' })).toBeTruthy();
  });

  it('"Post your first job" asks for the postJob action, once', () => {
    const { onAction } = renderCard();

    fireEvent.press(screen.getByRole('button', { name: 'Post your first job' }));

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith('postJob');
  });

  it('"Look around first" asks for the close action, once', () => {
    const { onAction } = renderCard();

    fireEvent.press(screen.getByRole('button', { name: 'Look around first' }));

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith('close');
  });

  it('a press on the card, away from its buttons, does nothing and does not close the card', () => {
    const { onAction } = renderCard();

    fireEvent.press(screen.getByTestId('tour-finish', { includeHiddenElements: true }));

    expect(onAction).not.toHaveBeenCalled();
  });

  it('the confetti layer ignores touches, so it cannot take a press from the buttons', () => {
    renderCard({ firstRun: true });

    expect(screen.getByTestId('confetti-layer').props.pointerEvents).toBe('none');
  });

  it('names each checklist step with its state for screen readers', () => {
    renderCard();

    expect(screen.getByLabelText('Post a job, next step')).toBeTruthy();
    expect(screen.getByLabelText('Compare proposals, to do')).toBeTruthy();
  });
});

describe('TourFinishCard — the provider', () => {
  const none = { hasAddress: false, hasBio: false, certificate: 'none' as const, hasPayoutAccount: false };

  it('shows the five setup items and a first action that finishes the profile', () => {
    const { onAction } = renderCard({ role: 'provider', verified: false, firstName: 'Ana', ...none });

    expect(screen.getByText("You're all set, Ana")).toBeTruthy();
    for (const label of ['Add your address', 'Add a short bio', 'Verify your ID', 'Upload your certificate', 'Link a payout account']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.queryByRole('button', { name: 'Post your first job' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Finish setting up' }));

    expect(onAction).toHaveBeenCalledWith('setupProfile');
  });

  it('asks to get verified once the address and bio are saved', () => {
    const { onAction } = renderCard({ role: 'provider', verified: false, ...none, hasAddress: true, hasBio: true });

    fireEvent.press(screen.getByRole('button', { name: 'Finish setting up' }));

    expect(onAction).toHaveBeenCalledWith('getVerified');
  });

  it('opens the certificate action when "Upload your certificate" is the next step', () => {
    const { onAction } = renderCard({ role: 'provider', verified: true, ...none, hasAddress: true, hasBio: true });

    expect(screen.getByLabelText('Upload your certificate, next step')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Finish setting up' }));

    expect(onAction).toHaveBeenCalledWith('uploadCertificate');
  });

  it('shows "Waiting for review" under a pending certificate and moves on to the payout account', () => {
    const { onAction } = renderCard({ role: 'provider', verified: true, hasAddress: true, hasBio: true, certificate: 'pending', hasPayoutAccount: false });

    expect(screen.getByText('Waiting for review')).toBeTruthy();
    expect(screen.getByLabelText('Upload your certificate, done, waiting for review')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Finish setting up' }));

    expect(onAction).toHaveBeenCalledWith('linkPayout');
  });

  it('a provider with everything done has one main action, which just closes the card', () => {
    const { onAction } = renderCard({ role: 'provider', verified: true, firstName: 'Ana' });

    expect(screen.queryByRole('button', { name: 'Look around first' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Find my first job' }));

    expect(onAction).toHaveBeenCalledWith('close');
  });
});

describe('TourFinishCard — first run only', () => {
  it('plays confetti and gives one light tap on a first run', () => {
    renderCard({ firstRun: true });

    expect(mockConfettiActive[mockConfettiActive.length - 1]).toBe(true);
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
  });

  it('a replay gets no confetti and no tap', () => {
    renderCard({ firstRun: false });

    expect(mockConfettiActive.length).toBeGreaterThan(0);
    expect(mockConfettiActive.every((active) => active === false)).toBe(true);
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  });

  it('a re-render does not tap again', () => {
    const { rerender, onAction } = renderCard({ firstRun: true });

    rerender(<TourFinishCard role="homeowner" verified={false} firstName="Juan" firstRun onAction={onAction} />);

    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
  });
});

describe('TourFinishCard — the bottom space', () => {
  // The sheet ends at the window's bottom edge, so it clears the navigation bar's inset and keeps 16 dp under the link.
  it.each([
    [0, 16],
    [24, 40],
    [48, 64],
  ])('under a %i dp navigation bar, pads the sheet by %i dp', (bottom, padding) => {
    mockInsets.bottom = bottom;
    renderCard();

    expect(StyleSheet.flatten(screen.getByTestId('tour-finish').props.style).paddingBottom).toBe(padding);
  });
});

describe('TourFinishCard — closing the sheet', () => {
  it('Back closes it as the close action', () => {
    const { onAction, UNSAFE_getByType } = renderCard();

    UNSAFE_getByType(Modal).props.onRequestClose();

    expect(onAction).toHaveBeenCalledWith('close');
  });

  it('a tap outside the sheet closes it as the close action', () => {
    const { onAction } = renderCard();

    // The scrim is hidden from accessibility while the sheet is a modal view, so the query includes hidden elements.
    fireEvent.press(screen.getByTestId('tour-finish-scrim', { includeHiddenElements: true }));

    expect(onAction).toHaveBeenCalledWith('close');
  });
});
