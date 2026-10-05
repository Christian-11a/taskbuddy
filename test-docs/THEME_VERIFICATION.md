# Mobile theme verification

Phase 8 uses the existing `user_settings.dark_mode` field and the existing AsyncStorage dependency. No backend migration, production dependency, native plugin, or deployment configuration was added.

## Implementation

- `mobile/src/constants/palettes.ts` defines light/dark values for both existing palette families and shared semantic surfaces, foregrounds, borders and statuses.
- `mobile/src/context/ThemeContext.tsx` restores device appearance, loads the signed-in account preference, rejects stale account/read responses and serializes device writes. Failed reads/writes are visible through the existing toast; corrupt preferences are not silently replaced.
- Each colored screen/component uses `useThemedStyles(createThemedStyles)` or `useTheme().palette`. Style factories live beside their screen. New colored UI must use the current palette; importing a static Colors/V6Colors object into a rendered component would prevent it from updating.
- White surfaces and button/hero foregrounds use separate tokens. Brand heroes and the dark photo viewer deliberately retain their contrast scheme in either mode. Native keyboards and the status bar follow the surface they appear against.
- The installed calendar library caches constructed styles in a ref. Calendars remount on appearance change while their parent retains the viewed month and selected day.
- Both Settings screens disable pending writes and unknown preferences, expose read retry, save `dark_mode` to the API and roll appearance back if saving fails. Previous-account results cannot change the current account's switches/theme.

## Automated evidence

| Surface or behavior | Tests |
| --- | --- |
| Mounted signup/input colors, keyboard, shared dialog and gallery | `mobile/src/context/__tests__/ThemeContext.test.tsx` |
| Restart restoration, account selection, logout, stale reads, failed save/storage/read, retry and corrupt preferences | `mobile/src/context/__tests__/ThemeContext.test.tsx` |
| Semantic body/status/action-label contrast in both palettes | `mobile/src/context/__tests__/ThemeContext.test.tsx` — tested pairs meet 4.5:1 |
| Calendar repaint with retained month, both roles | `mobile/src/context/__tests__/ThemeCalendars.test.tsx` |
| Chat repaint, retained unsent draft, native keyboard appearance and unchanged stream subscription, both roles | `mobile/src/context/__tests__/ThemeChat.test.tsx` |
| Existing navigation, jobs, galleries, forms, notifications and permission behavior | Full mobile Jest suite |

These are rendered component and local persistence/API-mock tests. They do not prove physical display contrast, native OS rendering or deployed preference persistence.

## Device matrix still required

Run the report scenarios in light and dark modes on small and larger screens with default and enlarged text. Include auth/Google onboarding, both role home/profile/settings, job creation/detail/filtering, portfolio, verification, payouts/wallet, calendars, chat, notifications, disputes, toasts and every shared modal. Check loading/error/disabled states, open-modal theme switching, restart/login/logout, keyboards, status bar, Android gesture/three-button navigation, image failure/retry and Back. Capture screenshots and record the exact build/API/database environment. Deployed/device results remain pending until those checks are actually run.

## Deployed preference API evidence

[October 4 checks](DEPLOYED_THEME_SETTINGS_EVIDENCE.json) pass light/dark saves
for both dummy roles, fresh-login persistence, invalid-value rejection and
account isolation. Original preferences were restored. These checks cover the
backend setting only; the native device matrix above remains open.


## Initial native emulator evidence

On Android 17 at 1080×2424, density 420 and font scale 1.0, the client Settings
switch repaints the screen and dark mode survives a force-stop/relaunch. The
provider then signs in with its own light preference. Dark home/calendar and
the Step 5 photo viewer were visually inspected. Native QA found low contrast
in the client greeting and selected navigation icon; commit `af243c3` uses
existing semantic foreground tokens. A new APK retest is pending. These
partial checks do not close the full device matrix above.

October 5 follow-up: provider greeting and selected navigation contrast passed
on preview `48aa549`. Compact login scrolling passed with `3aed1c6` served through
the development client (360×640 logical size, font scale 1.3, three-button nav).
Client greeting retest and the full theme matrix remain open.
