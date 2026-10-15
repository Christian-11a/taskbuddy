/**
 * The admin console's starting theme (true = dark): an explicit saved
 * preference wins; otherwise it is light, whatever the operating system
 * prefers. The account's server-side preference is applied later, once it has
 * loaded (see AppContext), so the sign-in page and the dashboard start from the
 * same theme.
 */
export function resolveInitialTheme(stored: boolean | undefined): boolean {
  return stored ?? false;
}
