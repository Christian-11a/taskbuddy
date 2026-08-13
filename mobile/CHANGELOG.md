# Changelog — TaskBuddy Mobile

Detailed history for the mobile app (`mobile/`). The README covers how the
app works today; this file covers how it got there and why. Newest first.

---

## Settings and password reset stop pretending: five endpoints that were always there

Nothing new was built on the backend for this. `GET`/`PATCH /settings` and
`POST /auth/forgot-password` / `POST /auth/reset-password` have existed for
some time — `src/lib/api.ts` simply had no method for any of them, so the
screens in front of them were local state and placeholder copy. The README had
recorded all three as "needs backend work", which was wrong; it now says so.

**The Settings switches are a stored row, not `useState`.** All five
(`push_enabled`, `email_enabled`, `sms_enabled`, `location_sharing`,
`dark_mode`) round-trip to `user_settings` (migration 0011) through a new
`useSettings` hook, shared by both roles' screens since they are the same
screen twice.

Writes are **optimistic**, and deliberately so: a preference switch has to move
the instant it is touched, and this backend is on a free Render dyno where a
cold start is 30–60 seconds. The flag flips locally, the PATCH carries only the
field that changed, and a failure rolls the switch back and says why. A failed
*read*, by contrast, falls back to the migration's defaults and leaves the
switches usable — being unable to load your preferences shouldn't freeze the
controls.

**Dark Mode is now half-real, which is worse to leave unlabelled than fully
fake.** The preference genuinely persists; nothing applies it, because theme
switching still doesn't exist. Both screens say that outright under the switch
rather than letting a saved toggle imply a repaint that never comes. The
blocker is unchanged: ~40 screens still use inline hex instead of `V6Colors`.

**Forgot Password is a real two-stage flow.** It always was a *code*, never a
link — the old copy promised a "reset link" that no part of the backend has
ever sent. Now: email → 6-digit code + new password → signed in, since
`/auth/reset-password` returns a session and bouncing someone to Login to
retype a password they chose ten seconds ago is pointless. The password rule
mirrors the backend's `MinLength(8)`, per the repo's convention that limits are
defined once server-side and mirrored on each frontend.

The step-2 copy says "if that address has an account" on purpose. The endpoint
answers 200 for unknown addresses precisely so it can't be used to enumerate
accounts, and confirming the mail was sent would leak exactly what that 200 is
hiding.

---

## First-run onboarding, avatar upload, and a shorter path from a category to a job

Five items off the README's to-do list, all of them app-side only. The three
that turned out to need backend work — and the three the README wrongly called
blocked when the endpoints already exist — are written up in
[`docs/backend-handoff-mobile-todo-gaps.md`](../docs/backend-handoff-mobile-todo-gaps.md).

**Onboarding is a first-login gate now, not a pre-auth screen.** It used to
render before Login while signed out, which meant a returning user saw the
slides on every cold start and a newly registered user — who lands straight on
their dashboard — never saw them at all, the exact opposite of the intent. The
slides now show once per account, after the first successful login, tracked in
AsyncStorage under `taskbuddy.onboarded.<profile id>` (per account rather than
per device, since two roles sharing a phone is normal here). It sits after the
Google role-selection gate, so an OAuth user finishes their account first.

**"Change Photo" uploads a photo.** Both Edit Profile screens had the markup
with a dead `TouchableOpacity` under it. The backend side was already complete —
an `avatars` bucket since migration 0011, and `PATCH /profiles/me` converts a
storage path to a public URL and refuses paths belonging to another profile — so
this was only ever a missing call. The upload is the same three steps as job
photos (signed URL → PUT to Storage → send the path) and lives in one shared
`AvatarPicker`, since the two screens' versions were identical. It saves on
pick rather than waiting for Save, which is why it carries its own spinner and
error line. A second small component, `OwnAvatar`, renders the photo in place
of initials on the four screens showing the signed-in user's own avatar; it
renders only the circle's *contents*, because each screen's circle differs in
size and colour and centralising that would fight the v6 styling.

Counterpart avatars (chat, applicants, reviews) still show initials — those
payloads do carry `avatar_url`, so it is app-side work, just not this change.

**Tapping a category on Home skips the question it just answered.** The "Book a
Job" tiles all opened the flow at step 1, asking for the service the tap had
already chosen. The category id now travels with the navigation and the flow
opens on step 2 with it preselected. Step 1 stays reachable with Back for a
mis-tap, an unknown id falls back to step 1 rather than posting under nothing,
and "Post Another Job" starts genuinely blank instead of resurrecting the tile
tapped several screens ago.

**Loading states on the steps that actually load.** Step 1 shows skeleton tiles
in the grid's own shape instead of a line of text that then reflows into a
two-column grid, step 3 says when it is opening the photo library, and the
submit button distinguishes "Uploading photos…" from "Posting…" because on a
job with six photos the upload is most of the wait. The other steps are pure
local input and were left alone — a spinner there would be theatre.

**"Leave Review" only appears when there is something to review.** The row
showed on every job, including ones with no provider assigned, where
`POST /jobs/:id/review` could only ever come back as an error. It is now gated
on a `completed` job with an assigned provider. A *second* review still fails at
submit time: the job payload carries no "already reviewed" flag, which is item 3
in the handoff doc.

---

## Booking requests, guided job creation with a task checklist, and three-step verification

Three user stories, one change each side of the wire. The backend half ships
as migrations 0018/0019 plus new endpoints — see
[`docs/backend-handoff-booking-tasks-verification.md`](../docs/backend-handoff-booking-tasks-verification.md)
for what has to be applied and deployed, and `backend/BACKEND_SCHEMA.md` §26
for the schema reasoning.

**Providers can now answer a booking, not just start it.** `job_status` gained
`'confirmed'` between `'assigned'` and `'in_progress'`, so `'assigned'` finally
means one thing: a homeowner hired you and is waiting for your answer.

- `SPHomeScreen` leads with a **Booking Requests** block — Accept and Decline
  inline, above the feed, because those are commitments with someone on the
  other end. The hero gained the open/urgent/potential-payout summary the
  backend had been returning all along and the screen was throwing away, and
  the feed now sends the provider's own `service_radius_km` instead of the
  50 km default and shows each job's distance.
- `SPJobDetailScreen` has two faces: **claimable** before it is theirs (the
  checklist read-only — it is the scope being offered) and **progress** after
  (the same checklist tappable, with a done/total bar). The mockup's "Submit
  for Review" step is still absent, because the backend still has no such
  action.
- Declining moved into a shared `DeclineBookingModal` — a reason is required
  (the API enforces 1–200 chars and repeats it to the homeowner), with quick
  reasons for the common cases.

**Job creation follows the five steps in the spec.** Service → Location →
Tasks → Urgency → Review, replacing the old category/details/schedule/budget/
review split.

- **Tasks** are the new part and are real data: chosen from a per-category
  suggestion list (or typed), stored as `job_tasks`, and shown to the provider
  as their task list. The title and description are drafted from the choices
  until the homeowner edits either — the API needs 5+ and 20+ characters and
  retyping what the checklist already says is busywork.
- **Urgency is three-valued now**, not a boolean "mark as urgent" toggle. The
  three real `job_urgency` values each say what they actually do, since urgency
  sets how long organic applications get before the ML engine steps in.
- **A past booking is refused inline.** The calendar already blocked past days;
  the case it could not catch — today, but a time already gone — now flags the
  time field. The API rejects the same thing (with five minutes' grace for
  clock skew), so the two agree.
- Photo selection dropped from 10 to 6, which is what `CreateJobDto` has always
  allowed; picking 10 produced a 400 at the end of the flow.
- Terms acceptance is now actually enforced at Review (the checkbox existed but
  nothing checked it), cancelling a job asks first, and "Post Another Job"
  clears the form instead of reusing the last job's answers.

**My Jobs shows the seven things that tell one job from another** — name,
location, status, urgency, price, time since posting, and provider — with
filter tabs following the real lifecycle (All / Open / Awaiting / Confirmed /
In Progress / Completed / Cancelled). `HOJobDetailScreen` gained the read-only
task checklist with its done count, a Chat action that is always in the same
place, and a five-stage timeline that no longer invents a "Review" stage the
backend does not have.

**Verification is a three-step flow ending in an automated check.**
Government ID → face scan → Stripe Identity, replacing the single-screen
two-slot upload. The session carries both uploaded images, so one pending
submission holds Stripe's verdict *and* the documents — if Stripe cannot
decide, an admin can still review it by hand. If Stripe is not configured the
API answers 503 before creating anything and the app falls back to the manual
queue; either way the provider lands on the same PENDING state, and the screen
polls for the webhook-delivered result. Migration 0019 also puts Row-Level
Security over the `verification-docs` bucket: providers write only into their
own folder, and only admins can read.

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
