/**
 * Bottom padding for a bar pinned to the bottom of the screen. Android is always edge-to-edge here (Expo SDK 57), so
 * the inset is the navigation bar itself and the bar keeps 16 dp of its own above it. On iOS the inset is the home
 * indicator, which a button may sit just above, so the old rule stays: at least 16 dp, never more than the inset.
 */
export function bottomBarPadding(insetBottom: number, os: string): number {
  const inset = Number.isFinite(insetBottom) && insetBottom > 0 ? insetBottom : 0;
  return os === 'android' ? inset + 16 : Math.max(inset, 16);
}
