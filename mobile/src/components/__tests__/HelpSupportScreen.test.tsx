import { findUnnamedControls } from '../../testing/a11yAudit';
import React from 'react';
import { Linking } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import HelpSupportScreen from '../HelpSupportScreen';

describe('HelpSupportScreen — welcome tour replay entry point', () => {
  it('shows a "Replay the welcome tour" card and calls onReplayTour when pressed', () => {
    const onReplayTour = jest.fn();
    render(<HelpSupportScreen role="homeowner" onBack={jest.fn()} onReplayTour={onReplayTour} />);

    fireEvent.press(screen.getByText('Replay the welcome tour'));

    expect(onReplayTour).toHaveBeenCalledTimes(1);
  });

  it('does not show the card when onReplayTour is not provided', () => {
    render(<HelpSupportScreen role="provider" onBack={jest.fn()} />);

    expect(screen.queryByText('Replay the welcome tour')).toBeNull();
  });
});

describe('HelpSupportScreen — report a problem wording', () => {
  it('says where Report a problem sits: the ⋮ menu, or a link once every task is done', () => {
    render(<HelpSupportScreen role="homeowner" onBack={jest.fn()} />);

    fireEvent.press(screen.getByRole('button', { name: 'How do I report a problem with a job?' }));

    expect(screen.getByText(/Open the job and tap Report a problem/)).toBeTruthy();
    expect(screen.getByText(/under the ⋮ menu on a booked or in-progress job/)).toBeTruthy();
    expect(screen.getByText(/a link once the provider has finished every task/)).toBeTruthy();
    expect(screen.getByText(/can be reported during its three-day warranty/)).toBeTruthy();
    expect(screen.queryByText(/File a Complaint/)).toBeNull();
  });
});

describe('HelpSupportScreen — common questions', () => {
  it('shows an answer only while its question is open, and only one at a time', () => {
    render(<HelpSupportScreen role="homeowner" onBack={jest.fn()} />);
    expect(screen.queryByText(/Add money to your Wallet/)).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'How do payments work?' }));
    expect(screen.getByText(/Add money to your Wallet/)).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'How do I hire a provider?' }));
    expect(screen.queryByText(/Add money to your Wallet/)).toBeNull();
    expect(screen.getByText(/Post a job, review proposals/)).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'How do I hire a provider?' }));
    expect(screen.queryByText(/Post a job, review proposals/)).toBeNull();
  });

  it('reports the open question as expanded', () => {
    render(<HelpSupportScreen role="homeowner" onBack={jest.fn()} />);
    const question = screen.getByRole('button', { name: 'How do payments work?' });
    expect(question.props.accessibilityState?.expanded).toBe(false);

    fireEvent.press(question);

    expect(screen.getByRole('button', { name: 'How do payments work?' }).props.accessibilityState?.expanded).toBe(true);
  });
});

describe('HelpSupportScreen — search', () => {
  it('filters the questions as the user types', () => {
    render(<HelpSupportScreen role="homeowner" onBack={jest.fn()} />);

    fireEvent.changeText(screen.getByLabelText('Search help'), 'review');

    expect(screen.getByRole('button', { name: 'How do I leave a review?' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'How do payments work?' })).toBeNull();
  });

  it('says when nothing matches, and keeps Contact support in reach', () => {
    render(<HelpSupportScreen role="homeowner" onBack={jest.fn()} />);

    fireEvent.changeText(screen.getByLabelText('Search help'), 'zebra');

    expect(screen.getByText('No questions match “zebra”.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Contact support' })).toBeTruthy();
  });
});

describe('HelpSupportScreen — provider FAQ', () => {
  it('sends a service change to My services, not Edit profile', () => {
    render(<HelpSupportScreen role="provider" onBack={jest.fn()} />);

    fireEvent.press(screen.getByRole('button', { name: 'How do I change the services I offer?' }));

    expect(screen.getByText(/Profile → My services/)).toBeTruthy();
    expect(screen.queryByText(/Edit profile/)).toBeNull();
  });

  it('points bio and service radius to Edit profile', () => {
    render(<HelpSupportScreen role="provider" onBack={jest.fn()} />);

    fireEvent.press(screen.getByRole('button', { name: 'How do I update my bio or service radius?' }));

    expect(screen.getByText(/Profile → Edit profile to update your bio and service radius/)).toBeTruthy();
  });
});

describe('HelpSupportScreen — contact and credits', () => {
  it('Contact support opens the support mailto link', () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockImplementation(() => Promise.resolve(true));
    render(<HelpSupportScreen role="homeowner" onBack={jest.fn()} />);

    fireEvent.press(screen.getByRole('button', { name: 'Contact support' }));

    expect(openURL).toHaveBeenCalledWith('mailto:support@taskbuddy.ph');
    openURL.mockRestore();
  });

  it('keeps the required address-data credits', () => {
    render(<HelpSupportScreen role="homeowner" onBack={jest.fn()} />);

    expect(screen.getByText('Powered by Geoapify')).toBeTruthy();
    expect(screen.getByText('© OpenStreetMap contributors')).toBeTruthy();
  });
});

it('every control has an accessible name: the back arrow, the questions and the tutorial', () => {
  render(<HelpSupportScreen role="homeowner" onBack={jest.fn()} onReplayTour={jest.fn()} />);

  expect(findUnnamedControls(screen.UNSAFE_root)).toEqual([]);
});

describe('HelpSupportScreen — the search box', () => {
  it('caps the search at 100 characters', () => {
    render(<HelpSupportScreen role="homeowner" onBack={jest.fn()} />);

    expect(screen.getByLabelText('Search help').props.maxLength).toBe(100);
  });

  it('keeps every question when the search is only spaces', () => {
    render(<HelpSupportScreen role="homeowner" onBack={jest.fn()} />);
    fireEvent.changeText(screen.getByLabelText('Search help'), '     ');

    expect(screen.getByText('How do payments work?')).toBeTruthy();
    expect(screen.getByText('How do I hire a provider?')).toBeTruthy();
  });
});
