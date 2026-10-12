import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { lightPalette } from '../../../constants/palettes';
import ContentSkeleton from '../ContentSkeleton';

describe('ContentSkeleton hero variant', () => {
  it('draws the same sky-blue card as the Home hero, with no text in it', () => {
    render(<ContentSkeleton variant="hero" />);

    const card = screen.toJSON();
    if (!card || Array.isArray(card)) throw new Error('the hero skeleton should render one card');
    expect(StyleSheet.flatten(card.props.style)).toMatchObject({
      backgroundColor: lightPalette.Colors.hero,
      borderRadius: 20,
      padding: 18,
    });
    expect(screen.queryByText(/./)).toBeNull();
  });
});
