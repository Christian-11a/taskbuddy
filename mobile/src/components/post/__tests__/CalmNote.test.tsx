import React from 'react';
import { render, screen } from '@testing-library/react-native';
import CalmNote from '../CalmNote';

it('says its one line in plain text', () => {
  render(<CalmNote text="Typing the address works just as well." />);
  expect(screen.getByText('Typing the address works just as well.')).toBeTruthy();
});

it('is information, not a control', () => {
  render(<CalmNote text="Typing the address works just as well." />);
  expect(screen.queryByRole('button')).toBeNull();
});
