import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import GoogleRoleSelectionScreen from '../GoogleRoleSelectionScreen';

type Props = React.ComponentProps<typeof GoogleRoleSelectionScreen>;

function renderScreen(overrides: Partial<Props> = {}) {
  const props: Props = {
    onSelectHomeowner: jest.fn().mockResolvedValue(undefined),
    onSelectProvider: jest.fn(),
    email: 'ana@gmail.com',
    ...overrides,
  };
  render(<GoogleRoleSelectionScreen {...props} />);
  return props;
}

describe('GoogleRoleSelectionScreen — the role is confirmed before it is saved', () => {
  it('opens the confirm sheet for the picked role and saves nothing yet', () => {
    const props = renderScreen();

    fireEvent.press(screen.getByText('I need help at home'));

    expect(screen.getByText('Sign up as a client?')).toBeTruthy();
    expect(props.onSelectHomeowner).not.toHaveBeenCalled();
    expect(props.onSelectProvider).not.toHaveBeenCalled();
  });

  it('names the real Google account in the sheet', () => {
    renderScreen();

    fireEvent.press(screen.getByText('I want to work'));

    expect(screen.getByText(/Your Google account ana@gmail\.com will be set up for finding work/)).toBeTruthy();
  });

  it('Choose again closes the sheet and saves nothing', () => {
    const props = renderScreen();
    fireEvent.press(screen.getByText('I need help at home'));

    fireEvent.press(screen.getByText('Choose again'));

    expect(screen.queryByText('Sign up as a client?')).toBeNull();
    expect(props.onSelectHomeowner).not.toHaveBeenCalled();
    expect(props.onSelectProvider).not.toHaveBeenCalled();
  });

  it('Yes saves the homeowner role once, even when it is pressed twice', async () => {
    let finishSave!: () => void;
    const onSelectHomeowner = jest.fn(() => new Promise<void>((resolve) => { finishSave = resolve; }));
    renderScreen({ onSelectHomeowner });
    fireEvent.press(screen.getByText('I need help at home'));

    fireEvent.press(screen.getByText('Yes, I want to hire'));
    fireEvent.press(screen.getByText('Yes, I want to hire'));
    await act(async () => finishSave());

    expect(onSelectHomeowner).toHaveBeenCalledTimes(1);
  });

  it('a failed save shows the message on the screen and closes the sheet', async () => {
    const onSelectHomeowner = jest.fn().mockRejectedValue(new Error('Could not finish your sign-up.'));
    renderScreen({ onSelectHomeowner });
    fireEvent.press(screen.getByText('I need help at home'));

    await act(async () => {
      fireEvent.press(screen.getByText('Yes, I want to hire'));
    });

    expect(screen.getByText('Could not finish your sign-up.')).toBeTruthy();
    expect(screen.queryByText('Sign up as a client?')).toBeNull();
  });

  it('the provider path opens the provider details step and saves nothing', async () => {
    const props = renderScreen();
    fireEvent.press(screen.getByText('I want to work'));

    await act(async () => {
      fireEvent.press(screen.getByText('Yes, I want to work'));
    });

    expect(props.onSelectProvider).toHaveBeenCalledTimes(1);
    expect(props.onSelectHomeowner).not.toHaveBeenCalled();
  });
});

describe('GoogleRoleSelectionScreen — the Google email is shown in full', () => {
  it('does not cut the email to one line, so a long address wraps onto the next line', () => {
    const email = 'maria.dela.cruz.santos.family.account@example-company-mail.com';
    renderScreen({ email });

    expect(screen.getByText(email).props.numberOfLines).toBeUndefined();
  });
});
