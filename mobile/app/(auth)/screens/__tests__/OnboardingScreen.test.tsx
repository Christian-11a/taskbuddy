import React from 'react';
import { FlatList } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import OnboardingScreen from '../OnboardingScreen';

function renderOnboarding(role: 'homeowner' | 'provider' | null = 'homeowner') {
  const onFinish = jest.fn();
  const onLogin = jest.fn();
  render(<OnboardingScreen role={role} onFinish={onFinish} onLogin={onLogin} />);
  return { onFinish, onLogin };
}

/** Tells the pager which slide is on screen, as a swipe would. */
function showSlide(index: number) {
  const list = screen.UNSAFE_getByType(FlatList);
  act(() => {
    list.props.onViewableItemsChanged({
      viewableItems: [{ index, item: null, key: String(index), isViewable: true }],
    });
  });
}

describe('OnboardingScreen — homeowner', () => {
  it('first slide points at "What do you need done?" on Home, not the old + button', () => {
    renderOnboarding('homeowner');

    expect(screen.getByText('Post what you need')).toBeTruthy();
    expect(screen.getByText(
      'Tap "What do you need done?" on Home, pick a service and describe the job. It takes about a minute.',
    )).toBeTruthy();
    expect(screen.queryByText(/Tap the \+ button/)).toBeNull();
  });

  it('moves on with Next and finishes with Get started on the last slide', () => {
    const { onFinish } = renderOnboarding('homeowner');
    expect(screen.getByText('Next')).toBeTruthy();

    showSlide(2);
    expect(screen.getByText('Get started')).toBeTruthy();
    fireEvent.press(screen.getByText('Get started'));

    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});

describe('OnboardingScreen — provider', () => {
  it('last slide says a hire confirms the booking and the payment is held until released after the job', () => {
    renderOnboarding('provider');

    expect(screen.getByText('Get hired, get paid safely')).toBeTruthy();
    expect(screen.getByText(
      'When a client hires you, the booking is confirmed automatically. Their payment is held safely and released to you after the job.',
    )).toBeTruthy();
  });

  it('the final button reads Get started and finishes the slides', () => {
    const { onFinish } = renderOnboarding('provider');

    showSlide(2);
    fireEvent.press(screen.getByText('Get started'));

    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});

describe('OnboardingScreen — skip', () => {
  it('Skip is on screen from the first slide and calls the skip handler, not finish', () => {
    const { onLogin, onFinish } = renderOnboarding('homeowner');

    fireEvent.press(screen.getByText('Skip'));

    expect(onLogin).toHaveBeenCalledTimes(1);
    expect(onFinish).not.toHaveBeenCalled();
  });
});
