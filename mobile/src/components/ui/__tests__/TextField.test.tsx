import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import TextField from '../TextField';

const EMAIL_ERROR = 'Enter an email address like name@example.com';

describe('TextField error timing', () => {
  it('does not show the error before the field is left', () => {
    render(<TextField label="Email" value="ana" onChangeText={jest.fn()} error={EMAIL_ERROR} />);

    expect(screen.queryByText(EMAIL_ERROR)).toBeNull();
  });

  it('shows the error after the field is left', () => {
    render(<TextField label="Email" value="ana" onChangeText={jest.fn()} error={EMAIL_ERROR} />);

    fireEvent(screen.getByLabelText('Email'), 'blur');

    expect(screen.getByText(EMAIL_ERROR)).toBeTruthy();
  });

  it('shows the error after a submit attempt even if the field was never left', () => {
    render(<TextField label="Email" value="ana" onChangeText={jest.fn()} error={EMAIL_ERROR} submitted />);

    expect(screen.getByText(EMAIL_ERROR)).toBeTruthy();
  });

  it('hides the error as soon as the caller stops passing one', () => {
    const { rerender } = render(
      <TextField label="Email" value="ana" onChangeText={jest.fn()} error={EMAIL_ERROR} submitted />,
    );
    expect(screen.getByText(EMAIL_ERROR)).toBeTruthy();

    rerender(<TextField label="Email" value="ana@example.com" onChangeText={jest.fn()} submitted />);

    expect(screen.queryByText(EMAIL_ERROR)).toBeNull();
  });

  it('hides the helper text while an error shows', () => {
    render(
      <TextField
        label="Email"
        value="ana"
        onChangeText={jest.fn()}
        helper="We never share it."
        error={EMAIL_ERROR}
        submitted
      />,
    );

    expect(screen.queryByText('We never share it.')).toBeNull();
    expect(screen.getByText(EMAIL_ERROR)).toBeTruthy();
  });

  it('shows the helper text when there is no error', () => {
    render(<TextField label="Email" value="" onChangeText={jest.fn()} helper="We never share it." />);

    expect(screen.getByText('We never share it.')).toBeTruthy();
  });

  it('gives the input the error as its hint, and announces the error politely', () => {
    render(<TextField label="Email" value="ana" onChangeText={jest.fn()} error={EMAIL_ERROR} submitted />);

    expect(screen.getByLabelText('Email').props.accessibilityHint).toBe(EMAIL_ERROR);
    expect(screen.getByText(EMAIL_ERROR).props.accessibilityLiveRegion).toBe('polite');
  });

  it('has no hint when there is no error to show', () => {
    render(<TextField label="Email" value="ana" onChangeText={jest.fn()} error={EMAIL_ERROR} />);

    expect(screen.getByLabelText('Email').props.accessibilityHint).toBeUndefined();
  });
});

describe('TextField', () => {
  it('reports typed text and still calls the caller blur handler', () => {
    const onChangeText = jest.fn();
    const onBlur = jest.fn();
    render(<TextField label="Email" value="" onChangeText={onChangeText} onBlur={onBlur} />);

    fireEvent.changeText(screen.getByLabelText('Email'), 'ana');
    fireEvent(screen.getByLabelText('Email'), 'blur');

    expect(onChangeText).toHaveBeenCalledWith('ana');
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it('passes the placeholder and keyboard type through to the input', () => {
    render(
      <TextField label="Phone" value="" onChangeText={jest.fn()} placeholder="0917 000 0000" keyboardType="phone-pad" />,
    );

    const input = screen.getByLabelText('Phone');
    expect(input.props.placeholder).toBe('0917 000 0000');
    expect(input.props.keyboardType).toBe('phone-pad');
  });
});

describe('TextField counter', () => {
  it('shows the counter when one is passed, and not otherwise', () => {
    const { rerender } = render(<TextField label="Bio" value="Hi" onChangeText={jest.fn()} />);
    expect(screen.queryByText('2 / 400')).toBeNull();

    rerender(<TextField label="Bio" value="Hi" onChangeText={jest.fn()} counter="2 / 400" />);

    expect(screen.getByText('2 / 400')).toBeTruthy();
  });

  it('keeps the counter on screen while an error shows, where the helper would hide', () => {
    render(
      <TextField
        label="Bio"
        value="Too short"
        onChangeText={jest.fn()}
        helper="Tell clients what you do"
        error="Bio must be at least 20 characters."
        counter="9 / 400"
        submitted
      />,
    );

    expect(screen.getByText('9 / 400')).toBeTruthy();
    expect(screen.getByText('Bio must be at least 20 characters.')).toBeTruthy();
    expect(screen.queryByText('Tell clients what you do')).toBeNull();
  });
});
