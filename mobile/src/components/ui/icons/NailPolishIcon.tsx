/**
 * NailPolishIcon.tsx
 *
 * A nail-polish bottle in the outline style of the Lucide icons: a 24 grid, a
 * 2 stroke with round caps and joins, and no fill. It takes the props the Lucide
 * icons take, so a service category can use either.
 */

import React from 'react';
import Svg, { Path } from 'react-native-svg';
import type { IconProps } from './types';

export default function NailPolishIcon({ size = 24, color = 'currentColor', strokeWidth = 2 }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M9.5 3a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v5h-5z" />
      <Path d="M10 8v3" />
      <Path d="M14 8v3" />
      <Path d="M8 11h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z" />
      <Path d="M10 15.5v3" />
    </Svg>
  );
}
