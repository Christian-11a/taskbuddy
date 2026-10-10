/**
 * editProfileChanges.ts — what counts as unsaved on the Edit profile screens.
 *
 * Each screen takes a snapshot of the values it loaded and compares the current
 * values with it. Text is compared trimmed, because saving trims it too, so a
 * stray space is not a change worth a question.
 */

export type DraftValue = string | number | boolean | null | undefined;

function comparable(value: DraftValue): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

/** The keys of `loaded` whose current value differs from the value that was loaded. */
export function changedFields<K extends string>(
  loaded: Record<K, DraftValue>,
  current: Record<K, DraftValue>,
): K[] {
  return (Object.keys(loaded) as K[]).filter(
    (key) => comparable(loaded[key]) !== comparable(current[key]),
  );
}

/** The words the leave question uses for each field. */
const LABELS: Record<string, string> = {
  name: 'name',
  phone: 'phone number',
  address: 'address',
  // A picked suggestion changes the address's location even when its text does not change.
  pickedAddress: 'address',
  city: 'city',
  bio: 'bio',
  radius: 'service radius',
  service: 'service',
};

/**
 * "You changed your phone number. If you leave now, that change is lost."
 * Several fields are listed, and the message then says those changes are lost.
 */
export function leaveMessageFor(changedKeys: readonly string[]): string {
  const labels = [...new Set(changedKeys.map((key) => LABELS[key] ?? key))];
  if (labels.length === 0) return '';
  const list =
    labels.length === 1
      ? labels[0]
      : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
  const loss = labels.length > 1 ? 'those changes are lost' : 'that change is lost';
  return `You changed your ${list}. If you leave now, ${loss}.`;
}
