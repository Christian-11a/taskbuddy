import React from 'react';
import { render, screen } from '@testing-library/react-native';
import CheckList from '../CheckList';

describe('CheckList', () => {
  it('shows each line of the list', () => {
    render(
      <CheckList
        items={['Place it on a flat, dark surface', 'Keep all 4 corners inside the frame']}
      />,
    );
    expect(screen.getByText('Place it on a flat, dark surface')).toBeTruthy();
    expect(screen.getByText('Keep all 4 corners inside the frame')).toBeTruthy();
  });

  it('draws muted reminders with the same text', () => {
    render(<CheckList items={['No glare or shadows on the text']} muted />);
    expect(screen.getByText('No glare or shadows on the text')).toBeTruthy();
  });
});
