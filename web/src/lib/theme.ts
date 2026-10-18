/**
 * The admin console's starting theme (true = dark). Light unless the admin
 * chose dark (saved in this browser, or their account preference applied later
 * in AppContext). The OS setting is ignored by design.
 */
export function resolveInitialTheme(stored: boolean | undefined): boolean {
  return stored ?? false;
}
