/**
 * The admin console's starting theme (true = dark): an explicit saved
 * preference wins; otherwise follow the operating system; light if neither
 * asks for dark. The account's server-side preference is applied later, once
 * it has loaded (see AppContext).
 */
export function resolveInitialTheme(stored: boolean | undefined, systemPrefersDark: boolean): boolean {
  return stored ?? systemPrefersDark;
}
