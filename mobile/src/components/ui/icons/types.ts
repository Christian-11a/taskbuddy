import type { ComponentType } from 'react';

/** The props every category icon takes. Lucide icons and the custom icons in this folder both accept them. */
export interface IconProps {
  size?: number | string;
  color?: string;
  strokeWidth?: number | string;
}

/** A Lucide icon or a custom icon from this folder, so either can be used where a category icon is needed. */
export type IconComponent = ComponentType<IconProps>;
