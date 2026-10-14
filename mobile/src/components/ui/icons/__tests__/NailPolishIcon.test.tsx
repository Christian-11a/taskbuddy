import React from 'react';
import { render, screen } from '@testing-library/react-native';
import NailPolishIcon from '../NailPolishIcon';

describe('NailPolishIcon', () => {
  it('draws in the Lucide outline style: 24 grid, round caps and joins, no fill, with the props given', () => {
    render(<NailPolishIcon size={20} color="#123456" strokeWidth={1.5} />);

    const svg = screen.UNSAFE_getByProps({ viewBox: '0 0 24 24' });
    expect(svg.props).toMatchObject({
      width: 20,
      height: 20,
      fill: 'none',
      stroke: '#123456',
      strokeWidth: 1.5,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    });
  });

  it('draws the cap, the neck, the bottle and the drop of polish as its five outline paths', () => {
    const { UNSAFE_root } = render(<NailPolishIcon />);

    // Each path shows up on its host element and on the component that renders it; the set keeps one of each.
    const paths = [...new Set(UNSAFE_root.findAll((node) => typeof node.props.d === 'string').map((node) => node.props.d as string))];

    expect(paths).toEqual([
      'M9.5 3a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v5h-5z',
      'M10 8v3',
      'M14 8v3',
      'M8 11h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z',
      'M10 15.5v3',
    ]);
  });

  it('defaults to a 24 point icon with stroke 2 in the current colour, like the Lucide icons', () => {
    render(<NailPolishIcon />);

    expect(screen.UNSAFE_getByProps({ viewBox: '0 0 24 24' }).props).toMatchObject({
      width: 24,
      height: 24,
      stroke: 'currentColor',
      strokeWidth: 2,
    });
  });
});
