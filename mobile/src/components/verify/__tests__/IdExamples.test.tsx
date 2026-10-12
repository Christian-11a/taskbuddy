import React from 'react';
import { render, screen } from '@testing-library/react-native';
import IdExamples from '../IdExamples';

describe('IdExamples', () => {
  it('shows one clear example and three that will be refused', () => {
    render(<IdExamples />);

    expect(screen.getByLabelText('Good example: clear, all 4 corners visible')).toBeTruthy();
    expect(screen.getAllByLabelText(/^Bad example/)).toHaveLength(3);
    expect(screen.getByLabelText('Bad example: blurry')).toBeTruthy();
    expect(screen.getByLabelText('Bad example: glare across the card')).toBeTruthy();
    expect(screen.getByLabelText('Bad example: a corner cut off')).toBeTruthy();
  });

  it('captions every example in plain words', () => {
    render(<IdExamples />);

    for (const caption of ['Clear, all 4 corners', 'Blurry', 'Glare', 'Cut off']) {
      expect(screen.getByText(caption)).toBeTruthy();
    }
  });
});
