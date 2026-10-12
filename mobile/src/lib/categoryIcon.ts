/**
 * The icon for a service category, looked up by the category's name from the API.
 *
 * One map for the whole app, so Plumbing is the wrench on every screen that shows a service.
 * A name with no icon here gets the fallback: the wrench, unless the caller passes its own.
 */

import {
  BrushCleaning,
  Footprints,
  Hammer,
  Sparkles,
  Wrench,
  type LucideIcon,
} from 'lucide-react-native';

const CATEGORY_ICON = new Map<string, LucideIcon>([
  ['Plumbing', Wrench],
  ['Cleaning', BrushCleaning],
  ['Handyman', Hammer],
  ['Manicure', Sparkles],
  ['Pedicure', Footprints],
]);

export function categoryIcon(
  name: string | null | undefined,
  fallback: LucideIcon = Wrench,
): LucideIcon {
  return (name ? CATEGORY_ICON.get(name) : undefined) ?? fallback;
}
