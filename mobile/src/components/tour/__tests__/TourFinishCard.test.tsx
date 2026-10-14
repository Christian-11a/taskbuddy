import React from 'react';
import { Modal } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import TourFinishCard from '../TourFinishCard';

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

describe('TourFinishCard — the client', () => {
  it('says you are all set by first name, with the checklist and both buttons', () => {
    renderCard();

    expect(screen.getByText("You're all set, Juan")).toBeTruthy();
    expect(screen.getByText('Account created')).toBeTruthy();
    expect(screen.getByText('Post your first job')).toBeTruthy();
    expect(screen.getByText('Hire a pro')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Post my first job' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Look around first' })).toBeTruthy();
  });

  it('"Post my first job" asks for the postJob action, once', () => {
    const { onAction } = renderCard();

    fireEvent.press(screen.getByRole('button', { name: 'Post my first job' }));

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

    expect(screen.getByLabelText('Account created, done')).toBeTruthy();
    expect(screen.getByLabelText('Post your first job, next step')).toBeTruthy();
    expect(screen.getByLabelText('Hire a pro, to do')).toBeTruthy();
  });
});

describe('TourFinishCard — the provider', () => {
  it('sends an unverified provider to get verified, and keeps a way to look around', () => {
    const { onAction } = renderCard({ role: 'provider', verified: false, firstName: 'Ana' });

    expect(screen.getByText("You're all set, Ana")).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Post my first job' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Get verified' }));

    expect(onAction).toHaveBeenCalledWith('getVerified');
  });

  it('an unverified provider with no service profile is asked to set it up first', () => {
    const { onAction } = renderCard({ role: 'provider', verified: false, hasServiceProfile: false, firstName: 'Ana' });

    expect(screen.getByText('Set up your profile')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Get verified' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Set up my profile' }));

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith('setupProfile');
  });

  it('a verified provider has one main action, which just closes the card', () => {
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
