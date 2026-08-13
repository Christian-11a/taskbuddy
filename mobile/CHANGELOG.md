# Changelog — TaskBuddy Mobile

Detailed history for the mobile app (`mobile/`). The README covers how the
app works today; this file covers how it got there and why. Newest first.

---

## Provider Profile/Settings restructure, real Change Password, and a robustness pass

**Profile menus, both roles.** Rows that duplicated an existing entry point
were removed rather than left as dead weight:

- **Provider Profile** (`SPProfileScreen`): dropped the "On-time" stat (no
  backend field ever fed it — it always showed `—`), added a real
  verified/unverified pill in the hero (`providerProfile.is_verified`), and
  trimmed the menu to Edit Profile / Get Verified / Settings / Help & Support
  — removed Wallet, Notifications, and Calendar rows, which duplicated the
  bottom-nav tabs and the Feed header's bell icon.
- **Homeowner Profile** (`HOProfile`): trimmed to Edit Profile / Settings /
  Help & Support — removed "Payment Methods" (it was mislabeled; it actually
  navigated to Wallet, a bottom-nav tab) and "Notifications" (duplicated
  Home's bell icon).
- New `SPSettingsScreen` (the provider side never had one — only homeowners
  had `HOSettingsScreen`) and a shared `HelpSupportScreen` component (flat
  topbar, static FAQ, `mailto:` support link) used by both roles.

**Change Password is real.** Both Settings screens' "Change Password" row
used to do nothing. It now opens a modal (current/new/confirm fields,
client-side validation, inline error/success state) wired to
`POST /auth/change-password` — an endpoint that already existed on the
backend and was already used by the admin console, just never called from
the app. "Language" and "Delete Account" got real UI too, but honestly
scoped: Language states English is the only option (no i18n system exists),
and Delete Account opens a `mailto:` to support (no self-serve deletion
endpoint exists) rather than faking either.

**Dark Mode: built, then deliberately reverted to UI-only.** A full
theme-switching system was built — `ThemeContext` (AsyncStorage-persisted
`isDark`, resolved per role), two dark palettes (`V6ColorsDarkHO`/
`V6ColorsDarkSP`, teal- and navy-tinted respectively, echoing each role's
light-mode hero gradient), and the `makeStyles(C)` factory pattern needed to
make a screen's `StyleSheet.create` react to the toggle instead of being
frozen at module load. It was verified working on-device (`BottomNavBar`,
`ConfirmationModal`, `ScreenSkeleton`, both Settings screens converted and
tested, toggle flips instantly, preference persists across relaunch) before
being intentionally reverted — the toggle UI stays on both Settings screens
as a `useState` placeholder, but the palette-switching itself was removed.
Left as an open task; see the README's "What's Not Wired Yet" for what a
pickup needs first (the inline-hex-color sweep is the real blocker, not the
toggle).

**A hardening pass**, mostly review-driven:

- `HOCalendarScreen`/`SPCalendarScreen` were dropping the `error` field from
  `useAsyncData` entirely, so a network failure rendered identically to a
  genuinely empty calendar. Both now show an error state with a Retry button
  that calls `reload()`.
- `ConfirmationModal` (and the two ad-hoc modals added for Change
  Password/Language) gained `accessibilityRole`/`accessibilityLabel` on
  their buttons and `accessibilityViewIsModal` on the dialog. The backdrop
  `Pressable` is `accessible={false}` rather than carrying its own `button`
  role — it was nested around the dialog and competing with the dialog's
  own buttons for TalkBack.
- `BottomNavBar` tabs gained `accessibilityRole="tab"` +
  `accessibilityState={{ selected }}` — previously nothing exposed which
  tab was active to a screen reader.
- `Sizes.statusBarHeight` was a flat `52` for every device. It now computes
  `Math.max(52, (StatusBar.currentHeight ?? 0) + 28)` on Android — a
  built-in RN API, no new dependency — so a device with a taller status bar
  (camera cutouts, some edge-to-edge configurations) gets extra headroom,
  while devices with a normal-or-smaller one keep the exact spacing already
  verified on real hardware. Not a full fix: it's evaluated once at module
  load (doesn't respond to a runtime orientation/inset change), and iOS
  still uses the fixed estimate. A complete fix means adopting
  `react-native-safe-area-context` and touching header padding in every
  screen — out of scope for this pass.
- Deleted confirmed-dead code: `AppHeader.tsx`, all of `src/components/ui/*`
  (Badge, Button, Card, Chip, EmptyState, Input, SectionHead, TopBar, and
  the barrel `index.ts`), and the legacy `HOBottomNavBar`/`SPBottomNavBar`
  — all zero-reference, confirmed with a repo-wide grep before removal.
  Trimmed `src/types/navigation.ts` down to the two types anything actually
  imports (`HOScreen`, `SPScreen`), removing unused `HOTabKey`, `SPTabKey`,
  `BottomTabParamList`, `ScreenKey`, `RootStackParamList`, `Role`,
  `DEFAULT_ROLE`, and `bottomTabs`.

Verified after every change: `npm run typecheck`, plus on-device checks in
Expo Go (both roles' Profile/Settings menus, the Change Password/Language/
Delete Account flows, the dark-mode toggle before it was reverted, the
Calendar error state's happy path, and sign-in/header alignment after the
status-bar change).

---

## Font/icon size bump

Body text and icons read smaller than the design mockup at the same nominal
sizes. Ran a single pass across all screen/component files: font sizes
scaled ×1.08, icon sizes ×1.10, both rounded — a proportional bump rather
than an arbitrary per-screen adjustment, so the existing type/icon hierarchy
(headings vs. body vs. labels) stayed intact.

---

## Back-navigation fixed to use a real stack

`hoBack()`/`spBack()` in `App.tsx` used to just jump to whichever bottom-nav
tab was currently active, with no actual navigation history — so e.g.
Profile → Edit Profile → back landed on the Home/Feed tab, skipping Profile
entirely. Same bug hit every screen reached from another non-tab screen
(Job Detail → Chat, Job Detail → Dispute Filing, Provider Profile → Leave
Review, …), not just Edit Profile.

Replaced with a small per-role back-stack (`hoStack`/`spStack`): navigating
to a non-tab screen pushes the screen (and its selected-id context, e.g. the
job being viewed) being left; `hoBack`/`spBack` pop it. Navigating to a tab
(or the Create Job flow) resets the stack, matching how tapping a tab
resets history in a native app.

---

## Service Provider screens rebuilt against the design mockup

Same treatment the homeowner side had already gone through: all ten
provider screens (Feed, My Work, Job Detail, Calendar, Wallet, Chat,
Notifications, Profile, Edit Profile, Verification) rebuilt against
`taskbuddy_UI_update.html` (outside this repo) rather than the app's
original Figma-derived layouts — flat white topbars instead of the old
dark-hero header pattern, the mockup's real card/list structures, and the
mockup's actual 4-tab bottom nav (Feed / My Work / Calendar / Wallet — no
FAB, since providers browse and claim jobs rather than posting them, and no
Profile tab, reached via Feed's avatar instead).

Real bugs fixed along the way rather than just re-skinned:

- `SPCalendarScreen`'s schedule rows had a purely decorative `›` arrow with
  no `onPress` at all. Wired to navigate to Job Detail using the real
  `Booking.job_id` field.
- `SPMyJobsScreen`/`SPJobDetailScreen` wired the previously-unused
  `api.myApplications()` endpoint (`GET /applications/mine`) into both an
  "Applications" tab and a per-job "your proposal status" note — the
  endpoint existed on the backend but nothing in the app had ever called it.
- `SPJobDetailScreen` was about to reference a `job.owner.full_name` field
  that doesn't exist on the real `Job` type; caught before landing and
  replaced with the real `job.photo_urls` count instead.

Deliberate deviations from the mockup, documented in each screen's own
comments rather than silently diverging: the mockup's "For You"/"All Jobs"
job-match-scoring tabs weren't built (no backend scoring endpoint exists);
`SPJobDetailScreen`'s action bar covers this app's real 3-state assignment
lifecycle (`assigned → in_progress → completed`) rather than the mockup's
4-state demo, which includes a provider-side "submit for review" step this
backend doesn't have (completion is homeowner-triggered); `SPVerificationScreen`
keeps its existing real 2-slot ID+selfie upload flow rather than the
mockup's multi-step wizard, since the current flow is the actual, working,
backend-connected one.

---

## Earlier passes (homeowner UI + v6 design system)

Kept short — full detail predates this file. The homeowner side's screens
(Home, My Jobs, Create Job, Job Detail, Chat, Wallet, Profile, Edit Profile,
Settings, Notifications, Dispute Filing, Job Applications, Provider Profile,
Leave Review, Calendar) went through the same mockup-matching pass described
above, plus the shared design-token system (`src/constants/theme.ts`'s
`V6Colors`/`V6Radii`/`V6Shadows`) and shared components (`BottomNavBar`,
`ConfirmationModal`, `ScreenSkeleton`) that both roles' screens are built on
today. The homeowner bottom nav gained its own dedicated Calendar tab
(previously embedded inline inside My Jobs) to match the mockup's structure.
