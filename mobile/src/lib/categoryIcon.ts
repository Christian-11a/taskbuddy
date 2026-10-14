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
  Wrench,
} from 'lucide-react-native';
import NailPolishIcon from '../components/ui/icons/NailPolishIcon';
import type { IconComponent } from '../components/ui/icons/types';

const CATEGORY_ICON = new Map<string, IconComponent>([
  ['Plumbing', Wrench],
  ['Cleaning', BrushCleaning],
  ['Handyman', Hammer],
  ['Manicure', NailPolishIcon],
  ['Pedicure', Footprints],
]);

export function categoryIcon(
  name: string | null | undefined,
  fallback: IconComponent = Wrench,
): IconComponent {
  return (name ? CATEGORY_ICON.get(name) : undefined) ?? fallback;
}
