# Bug log

Defects found during the mobile test sweep. Per the method in
`docs/superpowers/specs/2026-08-27-maestro-e2e-testing-design.md` §2: a defect
is fixed immediately only when it blocks further testing; everything else is
logged here and triaged per phase.

**Product defects** — bugs in the app, not the test harness — are the entries
below. Findings that only affect how flows are written (selector traps,
emulator setup) live in [`README.md`](./README.md) under "Known selector
traps"; there are 10 of them and they are not repeated here.

---

## BUG-001 — Any non-JSON error response reaches the user as "JSON Parse error"

**Found:** 2026-08-27, Phase 0 (while creating test accounts)
**Status:** fixed 2026-09-15 — `rawRequest` now catches the parse and throws an
`ApiError` carrying the real status ("The server is unavailable right now (HTTP
502)…"), so every caller's existing error handling applies. A 429 gets the same
treatment with the wait from `Retry-After`.
**Severity:** low impact per-incident, but it is the *only* thing the app says
when the backend is unreachable, so it is what a user sees during any outage.

### Steps

1. Point the app at a backend that answers with HTML rather than JSON. Any of
   these do it: a suspended Render service, a 502/504 from a proxy, a
   captive-portal wifi login page, or a CDN error page.
2. Open the app and submit any form that calls the API — registration is how
   this was found.

### Expected

A message that tells the user what to do: that the service is unreachable and
they should try again later. `api.ts` already has the right vocabulary for this
— the `catch` around `fetch` produces *"Cannot reach the server. Check your
connection and try again."*

### Actual

The red form error reads:

```
JSON Parse error: Unexpected character: <
```

The `<` is the first character of `<!DOCTYPE html>`. The message is
meaningless to a user and actively misleading to a developer — it looks like a
malformed API contract rather than "the server is down."

### Cause

`mobile/src/lib/api.ts:577-578`, in `rawRequest`:

```ts
const text = await response.text();
const data = text ? JSON.parse(text) : null;
```

`JSON.parse` is unguarded and runs *before* the `response.ok` check below it.
A non-JSON body therefore throws a raw `SyntaxError` out of `rawRequest`,
bypassing the `ApiError` path entirely — so it carries no status code, is not
recognised by any `instanceof ApiError` handler, and the 401-refresh-and-retry
logic in `authRequest` never sees it either.

The network-level `catch` around `fetch` is not reached, because the request
*succeeded* at the transport layer: the server responded, just not with JSON.

### Suggested fix

Wrap the parse and convert a non-JSON body into an `ApiError` carrying the real
status, so every caller keeps its existing error handling:

```ts
const text = await response.text();
let data: unknown = null;
try {
  data = text ? JSON.parse(text) : null;
} catch {
  // A non-JSON body means an error page from something between us and the
  // API — a suspended host, a proxy 502, a captive portal. The transport
  // succeeded, so the fetch catch above never fires; without this the raw
  // SyntaxError escapes as "JSON Parse error: Unexpected character: <".
  throw new ApiError(
    response.ok
      ? 'The server returned an unexpected response.'
      : 'The server is unavailable right now. Please try again shortly.',
    response.status,
  );
}
```

### Evidence

Screenshot: `~/.maestro/tests/2026-08-28_001636/00_setup_register_client/screenshots/step-040-assertCondition-Check_your_email.png`
— registration form correctly filled, all consents ticked, with the JSON Parse
error rendered where the submit error goes.

Confirmed server-side at the same time:

```
$ curl -sI https://taskbuddy-1d48.onrender.com/health
HTTP/1.1 503 Service Unavailable
x-render-routing: suspend-by-user
Content-Type: text/html; charset=utf-8
```

### Note

The suspended backend that surfaced this is a separate, unrelated issue — an
infrastructure state, not a code defect, and not tracked here.

---

## BUG-002 — Bottom navigation bar is completely unresponsive on both roles

**Found:** 2026-09-06, Phase 3 (exploring client job creation)
**Re-verified:** 2026-09-13 on the SDK 57 build — reproduced, then root-caused
and **FIXED** (see "Resolution" below).
**Status:** **FIXED 2026-09-13** — two independent causes, both addressed;
verified on-device (`nav_bottombar_client.yaml` passes: Wallet, Home, and the
Create-job FAB all navigate; `smoke_login_both_roles` still green on both roles).
Previously blocked Phases 3–6; those are now unblocked.
**Severity: critical.** This is not an edge case; it is the primary means of
navigating the app.

### Steps

1. Log in as either role (`maestro.client@taskbuddy.test` or
   `maestro.provider@taskbuddy.test`), landing on the role's home/dashboard
   screen.
2. Tap any bottom-nav item other than the one already active — `My Jobs`,
   `Create job` (the FAB), `Calendar`, or `Wallet` on the homeowner side;
   `My Work`, `Calendar`, or `Wallet` on the provider side.

### Expected

The app navigates to the tapped screen (e.g. tapping `Wallet` shows
`HOWalletScreen`, with "Recovery Vouchers" among its content).

### Actual

Nothing happens. The screen does not change; the tapped tab does not even
render as active. This reproduces identically for **every** non-active
bottom-nav item, on **both** roles — confirmed for homeowner `My Jobs`,
`Create job`, and `Wallet`, and provider `My Work`. The only navigation that
does work is reaching `Profile`/`Settings` via the home screen's avatar
button, which does not go through `BottomNavBar`.

### Confirmed NOT the cause (each ruled out with a direct test, not inference)

- **Not a Maestro artifact.** A raw `adb shell input tap` at the exact
  coordinates Maestro itself resolved for the button (verified via the
  confirmed-foreground app, not the recents-overview transition screen a
  premature screenshot can show) produces the identical no-op.
- **Not a stale bundle.** A throwaway visible-text marker edit to both
  `HOHomeScreen.tsx` and `BottomNavBar.tsx` each appeared on-device on the
  next `launchApp: clearState: true`, proving Metro was serving fresh code
  the whole time this was investigated.
- **Not Metro/emulator instability from a long session.** Reproduces
  identically immediately after a full Metro restart, on the very first
  interaction of a fresh flow.
- **Not the "Open debugger to view warnings" LogBox overlay**, despite a
  promising lead: its outer container's accessibility bounds
  (`[26,2018][1054,2348]`) fully cover the bottom-nav row
  (`[830,2213][1049,2348]` for the Wallet button specifically), which looked
  like exactly the right shape of bug. Ruled out directly: dismissing the
  toast (confirmed gone — its container no longer appears in the hierarchy
  dump at all) does not fix the nav tap.
- **Not the `onPress` handler's own logic.** A `console.log` placed as the
  *first* line of `BottomNavBar`'s own `onPress` — before it even calls
  `onTabPress` — never fires, checked via `adb logcat` directly (not the
  Metro terminal, which block-buffers when redirected to a file and cost real
  time to notice). This includes tapping the **already-active** `Home` tab,
  which should be the most trivial possible case. The touch is not reaching
  React Native's gesture responder for this component at all.
- **Not tap position within the button.** Tried both the button's vertical
  center and near its icon (away from the label, in case of some safe-area/
  system-nav-bar edge overlap on this `targetSdkVersion=36` (edge-to-edge
  enforced) build) — identical no-op both times.
- **Not role-specific or screen-specific.** Reproduces on both the homeowner
  and provider trees, which share only `BottomNavBar.tsx` itself and the
  general navigation pattern — not any per-screen code.

### Not yet tried

- A real physical device or a different emulator image, to rule out something
  specific to this `Medium_Phone` AVD's touch/gesture-responder handling
  under Fabric (the app runs with `"fabric":true` — the New Architecture).
- React DevTools / Flipper attached live, to inspect whether
  `TouchableOpacity`'s underlying `Pressable`/gesture-responder actually
  receives the touch (would distinguish "native touch never delivered" from
  "delivered but JS-side responder negotiation loses it").
- Whether this reproduces on the **web** build (`npm run web`) — would rule
  in/out anything Android-native-specific (touch dispatch, Fabric-on-Android)
  versus a bug in `BottomNavBar`/`hoNavigate`/`spNavigate` itself.

### Evidence

Screenshots proving the app is genuinely alive and on-screen (not crashed,
not on the OS launcher) immediately after a tap that should have navigated:
[`bug-evidence/BUG-002-wallet-tap-noop.png`](./bug-evidence/BUG-002-wallet-tap-noop.png)
(client, tapped Wallet, still on Home) and
[`bug-evidence/BUG-002-fresh-bundle-marker.png`](./bug-evidence/BUG-002-fresh-bundle-marker.png)
(client, tapped Create job, with a throwaway `BottomNavBar.tsx` text marker
visible in the nav labels, proving bundle freshness at the moment of the
failed tap — marker was reverted after this screenshot, it is not in the
current source).

### Re-verification — 2026-09-13 (SDK 57 build)

Re-checked after the SDK 54 → 57 native regeneration (once the app built and
launched again, and after confirming the *right* Metro was serving — see the
environment note below). The bug survives the upgrade but **presents
differently**, so the SDK-54 root-cause elimination above is only partly
transferable:

- **Then (SDK 54):** tapping a bottom-nav item was a silent no-op — the app
  stayed on Home, nothing rendered.
- **Now (SDK 57):** tapping the "Create job" FAB **sends the app to the Android
  launcher** (backgrounds it). The process stays alive (`pidof
  com.taskbuddy.app` returns a pid; no `FATAL`/`AndroidRuntime` in logcat) — it
  is not a crash, the app just leaves the foreground. Confirmed via the Maestro
  artifact `step-022-assertCondition-Select_a_Service.png` (already on the
  launcher at the moment of the failed assert) and a live `adb screencap`.

This was reached through `jobs_create_plumbing.yaml`: login succeeded, `Tap on
"Create job"` reported COMPLETED, then `Select a Service` never appeared. Smoke
and both login helpers pass clean on this build, so login/nav-to-Profile are
fine — the defect is still specific to the `BottomNavBar` route.

### Root cause — identified 2026-09-13 (static analysis; on-device confirmation pending)

**The app is drawn edge-to-edge but applies no real safe-area insets anywhere,
so the bottom nav bar is rendered underneath the system navigation bar and the
system consumes its taps before React Native ever sees them.**

Evidence chain (all from source + the bounds already recorded above):

- `app/layout.tsx` is deliberately edge-to-edge ("paint behind the status and
  home-indicator areas") and adds **no** insets. On this `targetSdkVersion=36`
  build edge-to-edge is *enforced* — the app draws under the system bars.
- The app has **no inset library at all**: `react-native-safe-area-context` is
  not a dependency, and nothing calls `useSafeAreaInsets`. Insets are faked with
  fixed constants — `paddingTop: Sizes.statusBarHeight` on screens, and
  `paddingBottom: 22` (dp) on `BottomNavBar` (`BottomNavBar.tsx:97`).
- The emulator uses **3-button navigation** (◄ ● ■ visible in every screenshot),
  a solid ~48dp system bar. `paddingBottom: 22` < ~48dp, so the nav bar's
  touchable row sits inside the system-bar region. The recorded Wallet-button
  bounds `[830,2213][1049,2348]` on a 2400px-tall screen put the button's centre
  (~y2280) inside the bottom ~48dp system strip.
- This explains **every** observation: `onPress` never fires (the touch goes to
  the OS, not RN); all tabs dead on both roles (shared `BottomNavBar`, all in the
  system strip); and the decisive new SDK-57 clue — the centre "Create job" FAB
  overlaps the system **Home** button, so tapping it goes to the launcher, while
  off-centre tabs overlap dead parts of the bar and no-op.

On-device confirmation revealed a **second, independent cause** (the "loose end"
above — the icon tap failing even above the system strip):

**Cause 2 — the dev-only LogBox notification overlay intercepts the bottom nav's
touches.** With the bar lifted clear of the system strip, taps *still* didn't
fire `onPress`. The view hierarchy showed no covering node, but suppressing
LogBox (`ignoreAllLogs`) made the tabs navigate immediately. The
"Open debugger to view warnings" toast (and any warning re-shows it — the
FCM-less `[push] not registered` warn, the `SafeAreaView` deprecation, etc.)
renders over the bottom of the screen and eats the nav taps. This is why the
2026-09-06 investigation, which removed only one factor at a time, never cracked
it: dismissing the toast left the system-strip overlap, and it never lifted the
bar. **Dev-only** — LogBox does not exist in release builds.

## Resolution (2026-09-13, verified)

- **Cause 1 (production):** added `react-native-safe-area-context`, wrapped the
  app in `SafeAreaProvider`, and drove `BottomNavBar`'s height + bottom padding
  from `useSafeAreaInsets().bottom` (`App.tsx`, `BottomNavBar.tsx`). The bar now
  sits above the system navigation bar on any device. (New native dependency —
  a dev-client rebuild is required after pulling; `android/` is gitignored.)
- **Cause 2 (dev/test):** `LogBox.ignoreAllLogs(true)` under `__DEV__` in
  `App.tsx` — removes the touch-blocking notification overlay while warnings
  still print to the Metro console and errors still redbox.
- Also migrated `SplashScreen` off the deprecated core `SafeAreaView`, added
  `nav-tab-*` testIDs to the nav tabs (the label "Home" collides with the OS
  launcher's own Home button in the a11y tree — a text selector taps the wrong
  one), and fixed `jobs_create_plumbing.yaml`'s first assert (the heading is
  "Select a Service *", which an exact "Select a Service" match missed).
- **Verified on-device:** `nav_bottombar_client.yaml` (new) passes — Wallet, Home
  and the Create-job FAB all navigate; `smoke_login_both_roles` still green.

Follow-up (not required for BUG-002): the top status-bar padding still uses the
fixed `Sizes.statusBarHeight` constant; migrating it to `insets.top` is the same
class of fix but not blocking anything.

---

## BUG-003 — Android hardware back exits the app from any nested screen instead of navigating up

**Found:** 2026-09-13, Phase 2 (exploring client Edit Profile)
**Status:** open — logged, not fixed (does not block testing; every screen's
in-app back arrow still works, so flows can navigate around it).
**Severity: high.** Affects every nested screen in the whole app, both roles —
not specific to Edit Profile, just first noticed there.

### Steps

1. Log in as either role, landing on the role's home screen.
2. Navigate into any nested screen via its own in-app affordance — e.g. tap
   the home screen's avatar to reach Profile, then tap "Edit Profile".
3. Press the Android hardware/gesture **back** button (not the screen's own
   back arrow).

### Expected

Back pops one level of the app's own navigation stack — same as tapping the
screen's in-app back arrow (e.g. Edit Profile → Profile → Home).

### Actual

The app backgrounds to the Android launcher (home screen), as if back had
been pressed on the app's root screen. Confirmed via screenshot: mid-flow on
Edit Profile, one hardware back press away from it lands on the OS launcher's
app grid, not Profile.

### Cause

`App.tsx` holds all navigation in plain `useState` (see `mobile/CLAUDE.md`:
"No router library"). There is no `BackHandler` registration anywhere in the
codebase (`grep -rn BackHandler mobile/` returns nothing), so Android's
default hardware-back behavior applies uncontested: on a single-Activity app
with no handler intercepting it, back exits the activity rather than popping
whatever the JS-side "screen" state considers the previous view. Every
screen's own in-app back arrow works because those call `onBack` directly
(e.g. `HOEditProfileScreen.tsx:129`), bypassing the hardware button
entirely — this is why the bug went unnoticed screen-by-screen.

### Suggested fix

Register a `BackHandler.addEventListener('hardwareBackPress', ...)` at the
navigation-state level (wherever `App.tsx`'s screen `useState` lives) that
calls the same `onBack`/pop logic the in-app arrows use when not on a root
screen, and returns `false` (let the OS handle it — exit) only when already
on a role's home screen. This is a navigation-architecture change, not a
one-line fix — flagging rather than self-serving it per the sweep's
escalation boundary (design spec §10 treats "a behavior you cannot confirm is
correct" and broader architectural changes as sign-off items, not delegate
fixes).

### Evidence

Screenshot: mid-Edit-Profile hardware back landing on the OS launcher,
captured during Phase 2 exploration (`p2-03-back-to-profile` in this
session's scratch run — not committed as a named artifact since it's a
throwaway exploration flow, reproduce via the Steps above).

### Harness corollary (genuinely BUG-003 — these commands issue a real back press) — the exit is intermittent, not tied to one specific command

Found 2026-09-13 writing `profile_edit_client.yaml`. On `HOEditProfileScreen`
(a full screen, not a `Modal`), single-command debug flows landed on the OS
launcher — same symptom as a direct hardware-back press — after `eraseText`
(both unbounded and an exact-count `eraseText: 14` matching the field's real
length, ruling out an overshoot-into-extra-backspaces theory), after
`hideKeyboard`, and after `longPressOn` a text field. **However**, re-checking
the screenshot taken immediately *before* the `eraseText` call in one of
those runs (`dbg-e1-focused`) shows the app **already** on the launcher — i.e.
the plain `tapOn` that focused the field was enough to trigger it that time,
with no erase/hideKeyboard/longPress involved at all. The same `tapOn`
sequence ran cleanly in other passes through this exact screen earlier in
the session. So this is **intermittent**, not a deterministic property of any
one of those three commands — treat any of them (and possibly a bare `tapOn`
too) as *able* to trigger it on a plain screen, not certain to.

By contrast, `hideKeyboard` was used repeatedly without incident inside a
`Modal` (Change Password) and on the Register screen (a screen that isn't
nested under Home/Profile). Working theory, not confirmed: Android's IME
absorbs the first back press whenever the keyboard is genuinely showing at
that instant, so the failure needs a race — a moment where the keyboard
isn't actually up despite the field having been tapped, or where a residual
back-equivalent event fires after the field lost focus — for the unhandled
back to reach the Activity and hit BUG-003 (no `BackHandler` anywhere). Not
chased further per the sweep's escalation boundary (bounded debugging pass
done; root cause of the race, and of why `eraseText`/`hideKeyboard`/
`longPressOn` seem to correlate with it more than plain `tapOn`/`inputText`,
needs a session with more headroom or a physical device).

**Practical effect on this sweep:** flows in this phase avoid
`eraseText`/`hideKeyboard`/`longPressOn` on any plain (non-`Modal`) screen,
sticking to `tapOn` + `inputText`, since those two commands have not been
observed to trigger this. That means a field that already carries a value on
a plain screen can't be reliably cleared back to empty by automation right
now, and even the safer commands may rarely still hit this since the tap
itself did once. Fixing BUG-003 (a real `BackHandler` at the
navigation-state level) should resolve this for free — re-verify once that
lands, before assuming this note still applies.

---

## ENV-001 — Gboard/emulator tap interference on the Phone field (NOT related to BUG-003)

**Important:** unlike the corollary above, neither finding below involves a
back press — they happened on `scrollUntilVisible`, `pressKey: Enter`, and a
plain `tapOn`. **Fixing BUG-003's missing `BackHandler` will not touch
either of these** — don't expect `profile_edit_client.yaml` to go green
just because BUG-003 lands. This is filed separately on purpose after
initially (incorrectly) being logged as a BUG-003 corollary.

### A `scrollUntilVisible` swipe once escaped to the OS Assistant/Search overlay

Found 2026-09-13, same flow, right after switching to `tapOn`/`inputText`
only (no erase/hideKeyboard/longPress). `scrollUntilVisible` on
`HOEditProfileScreen` while the phone-pad keyboard was showing (right after
typing into Phone) landed the whole device — not just the app — on Android's
system-wide Assistant/Search overlay, pre-filled with the typed phone number
as a search query. Screenshot showed "Search on Google / YouTube / Maps /
Play Store / Settings / Contacts" — this is an OS-level surface, not
anything TaskBuddy renders. Not reproduced on a second attempt with the same
screen using `pressKey: Enter` instead, and `scrollUntilVisible` was used
repeatedly and safely elsewhere in this same session (the signup form's
checkbox scrolling). Best guess, unconfirmed: a swipe gesture whose start
point landed in the bottom system-gesture strip (same region BUG-002's
edge-to-edge root cause implicated — only `BottomNavBar` got real safe-area
insets in that fix; this screen's `ScrollView` has none) got interpreted as
an Android system gesture (swipe-and-hold near an edge opens Assistant on
gesture-nav configs) instead of an in-app scroll. Logged rather than chased
further — one occurrence, high cost to reproduce deliberately, and the
`pressKey: Enter` workaround avoids it entirely for this flow's purposes.
Worth remembering if a future flow's `scrollUntilVisible` inexplicably lands
outside the app.

### The app also jumps to Google Calendar, intermittently, after typing into the Phone field

Found 2026-09-13, same session, chasing the two corollaries above. After
typing a phone number into `HOEditProfileScreen`'s Phone field
(`keyboardType="phone-pad"`), the **next** action — regardless of which:
`pressKey: Enter` once, a plain `tapOn` on the static "Full name" label text
another time — landed on the **Google Calendar app**, not the OS launcher
and not a Metro reload. Reproduced twice with two different trigger actions,
never with a deterministic single cause, which rules out any one Maestro
command and points at something tied to the **phone-shaped text itself**
combined with a delay: Gboard shows a contextual suggestion strip above the
keyboard for phone-number-looking input (e.g. an "Add to contacts" or
similar smart chip), and it's a plausible explanation that whichever action
fires while that chip is rendering hits the chip instead of the intended app
element, launching whatever app backs it. Not proven — the suggestion strip
itself wasn't caught in a screenshot — but it fits all three symptoms
(intermittent, action-independent, specific to the phone field, lands on an
unrelated real Android app rather than exiting or reloading).

**This one is an emulator/keyboard-configuration issue, not a TaskBuddy or
Maestro defect**, and combined with the two corollaries above it made
Phase 2's Edit Profile automation unreliable enough that `profile_edit_client.yaml`
could not be completed and verified end-to-end this session — see the
Phase 2 status note below. Recommended fix for whoever resumes: disable
Gboard's suggestion strip / clipboard suggestions on the AVD (Gboard app →
Preferences → Text correction, or provision an AVD image without Gboard's
predictive features) before trying this screen's automation again, rather
than re-debugging it as an app issue.

---

## Environment note — 2026-09-06, resuming after a merge

Session resumed after merging a large upstream batch (47 commits, incl. a
homeowner-side reimplementation of wallet/delete-account/review-gating —
reconciled in favour of upstream; see repo git log around commit `025bdc3`).
Two environment changes surfaced immediately and are not app defects:

- **The deployed backend moved** (`taskbuddy-1d48.onrender.com` →
  `taskbuddy-kpek.onrender.com`, upstream commit `b7b6e69`) and its user
  database does not have the Phase 0 test accounts — `POST /auth/login` for
  `maestro.client@taskbuddy.test` answered `401 Invalid login credentials`
  even with the documented password. Confirmed via direct `curl` against
  `/auth/login`, not an app bug. Re-registered both `maestro.client@` and
  `maestro.provider@taskbuddy.test` via `POST /auth/register` (still
  `TestPass123!`).
- **"Confirm email" is now OFF** on this environment's Supabase project — both
  re-registrations above returned a live session in the same response, no OTP
  step. This is handled correctly by existing code
  (`AuthContext.signUp`'s `res.session` branch, gated through
  `needsEmailConfirmation`), confirmed by `auth_signup_client_no_confirmation.yaml`
  passing end-to-end straight through to the home screen. If this project's
  Confirm-email setting is ever switched back on, expect `RegisterScreen` to
  show its OTP step again — that path is untested this session (no mailbox
  access), same as before.
- **Client wallet is unfunded** on this environment — the old seed transaction
  doesn't exist on the new database, and I do not have SQL/dashboard access to
  this Supabase project (only unrelated projects are visible via MCP). SQL is
  saved for the human to run, whenever convenient:
  `scratchpad/pending-wallet-seed.sql` in this session's temp dir. Phases 5–6
  (escrow, withdraw) block on this; phases 1–4 do not.

## Environment note — 2026-09-13, resuming after the SDK 57 upgrade

Two environment problems blocked all testing at the start of this session; both
are now fixed and neither is an app defect. They are the reason the harness was
un-runnable, not bugs in the app:

- **The SDK 54 → 57 upgrade left the native project stale.** Commit `232b58f`
  bumped `package.json`/`app.json` to Expo SDK 57 / RN 0.86 but did not
  regenerate the gitignored `mobile/android/`. The pre-existing SDK-54 native
  project failed to compile (`MainApplication.kt: Unresolved reference
  'ReactNativeHostWrapper'`); an older installed APK also red-boxed at runtime
  (`Can't find ViewManager 'RNCSafeAreaProvider'`). Fixed for this machine with
  `npx expo prebuild --clean --platform android` + `npx expo run:android`
  (BUILD SUCCESSFUL). A clean checkout auto-prebuilds and avoids this; only a
  checkout with a pre-upgrade `android/` is affected. Documented in
  `mobile/README.md` and `maestro/README.md`.
- **The wrong Metro was serving `:8081`.** An `expo start` from the
  `eiyu-system` project was running on the port, so the TaskBuddy dev client
  loaded eiyu-system's JS bundle (login screen read "EIYU SYSTEM", every flow
  failed on `"Welcome!"`). Nothing errored — the wrong app just loaded. Fixed by
  stopping that Metro and starting TaskBuddy's own from `mobile/`. New trap +
  startup check added to `maestro/README.md`.

After both fixes: `smoke_login_both_roles.yaml` passes end to end on SDK 57
(both roles), so Phase 0 + Phase 1 are green on the new build. Test accounts
(`maestro.client@` / `maestro.provider@taskbuddy.test`, `TestPass123!`) still
exist on `taskbuddy-kpek.onrender.com`. BUG-002 re-verified as still-open with a
changed symptom (see its Re-verification entry above).

## Confirmed (moved out of "not yet triaged")

- **First tap after a cold launch is swallowed — reproduced again.** Hit for
  real in `auth_signup_client_no_confirmation.yaml`: `tapOn: "Sign Up"`
  immediately after `launch_fresh` landed on Login with the tap silently
  swallowed (screenshot showed Login, untouched). Fixed the same way
  `00_setup_register_client.yaml` already did — `waitForAnimationToEnd` then a
  guarded retry — and it passed clean on the next run. This confirms it is a
  real, repeatable timing gap (the Login screen paints before React attaches
  press handlers), not a one-off flake. Still an open UX question, not fixed
  in app code: is the window long enough for a real user's fast tap to land in
  it? Worth a product call, not an engineering fix on its own.

## Session note — 2026-09-13 (resuming Phase 2, harness fix + ENV-001 recurrence)

Resumed a session that had left Phase 2 uncommitted (settings green,
`profile_edit_client.yaml` written but not verified). Startup checklist
re-run clean: correct Metro confirmed by screenshot (TaskBuddy's own "Post a
Job" screen, not the eiyu-system trap), backend warm (`200` from `/health`),
`smoke_login_both_roles.yaml` and `nav_bottombar_client.yaml` both green.

**Found and fixed a harness (not app) bug in `profile_edit_client.yaml`
itself**, unrelated to BUG-003/ENV-001:
1. The flow's cleanup section tapped `btn-home-avatar` a second time after
   the Save-Changes confirmation, but Save Changes navigates back to the
   Profile screen (not Home) — `btn-home-avatar` doesn't exist there, so the
   tap failed. Fixed by dropping the redundant tap; cleanup now goes straight
   to `tapOn: "Settings"`.
2. The registration section's `runFlow: when: visible: "Welcome!"` retry
   (the same idiom used in `00_setup_register_client.yaml` and
   `auth_signup_client_no_confirmation.yaml`) raced the first tap's own
   navigation: 3 of 4 runs this session hard-failed here because the retry's
   own `tapOn: "Sign Up"` ran after the app had already reached Create
   Account, where "Sign Up" as visible text doesn't exist yet (it's a
   password field's neighborhood, not the button). Fixed by making that
   retry's tap `optional: true` — a no-op when the race means it isn't
   needed. Worth applying the same guard to the other two flows if they ever
   show the same flake (not done here — out of scope for this pass, and
   neither has failed there yet).

**ENV-001 (Google Calendar jump after typing into Phone) reproduced again,
twice, after the harness fixes above** — confirming it's a real, frequent
blocker for this screen on this AVD, not a one-off: of 3 runs that got far
enough to reach the Phone field post-fix, 2 hit it (identical symptom,
screenshot-confirmed: app backgrounds to Google Calendar's month view).
Attempted a fix within delegate scope — checked for a plain non-Gboard IME
to switch to (`adb shell ime list -s` shows only Gboard and Google Voice
Typing on this AVD image, no AOSP keyboard installed, so disabling Gboard
would kill text input for every other flow) — and stopped there rather than
attempt Gboard's own suggestion-strip settings, per the sweep's
escalation boundary (this is AVD/keyboard-image tuning, not app or flow
code, and the prior session already logged the same "stop chasing it" call).
**Recommendation stands unchanged: provision this AVD with a plain keyboard
(or disable Gboard's contextual suggestions) before `profile_edit_client.yaml`
can be expected to pass reliably.** No app-code fix exists for this since it
is not an app defect.

Each burner-account run that reached registration but not cleanup (2
occurrences, from runs that failed mid-flow) left `maestro.editprofile@
taskbuddy.test` registered on the backend, which then failed the *next*
run's Sign Up with "User already registered" — cleaned up by hand each time
via a throwaway login+delete-account flow. Anyone re-running this flow after
a failed attempt should check for and delete that leftover account first.

## BUG-004 — Posting a job crashes the app at Step 2 (Location): no Google Maps API key configured

**Found:** 2026-09-13, Phase 3 (exploring client job creation)
**Status:** open — logged, not fixed. **Hard blocker for all of Phase 3** (and,
transitively, Phase 5's cross-role loop, which needs a job to exist) — no job
can be created past Step 1 regardless of path taken.
**Severity: critical.** Fatal crash (process death, not just a JS-side error),
on the very first step past service selection, every time.

### Steps

1. Log in as a client, tap "+ Post" (or any "Find a service" card) to start
   Post a Job.
2. Step 1 of 5 (Service): pick any service, pick **either** "Use default" or
   "Enter custom" for location, tap Next.

### Expected

Step 2 of 5 (Location) renders, showing a map for the job's location.

### Actual

The app throws a fatal exception and the process dies (confirmed via
`adb shell pidof com.taskbuddy.app` returning nothing afterward, and
`Process com.taskbuddy.app (pid ...) has died` in logcat — this is a real
crash, not a recoverable redbox). Reproduced identically twice, once via
each location path ("Use default" with no saved profile address, and "Enter
custom") — the crash is unconditional on this step, not dependent on which
location option was picked.

Redbox / logcat:
```
addViewAt: failed to insert view [...] into parent [...] at index 4
Caused by: java.lang.IllegalStateException: API key not found.  Check that
<meta-data android:name="com.google.android.geo.API_KEY"
android:value="your API key"/> is in the <application> element of
AndroidManifest.xml
...
FATAL EXCEPTION: androidmapsapi-ula-1
Process: com.taskbuddy.app, PID: ...
```

### Cause

`HOCreateJobScreen.tsx:85` imports `MapView` from `react-native-maps` and
renders it unconditionally on the Location step (`HOCreateJobScreen.tsx:763`).
`react-native-maps` needs a Google Maps Platform API key wired into
`AndroidManifest.xml`'s `com.google.android.geo.API_KEY` meta-data — normally
supplied via `app.json`'s `expo.android.config.googleMaps.apiKey` (consumed by
the `react-native-maps` Expo config plugin at prebuild time). **`app.json` has
no such key anywhere** (checked directly — no `googleMaps` entry under
`android`, no `react-native-maps` entry in `plugins`), and the generated
`android/app/src/main/AndroidManifest.xml` correspondingly has no
`com.google.android.geo.API_KEY` meta-data. This isn't a regression from a
recent change — the config was never wired up.

### Why this is a hand-back, not a delegate fix

Needs a real Google Maps Platform API key (a credential), which the test
session doesn't have and can't fabricate — same class of escalation as the
missing Supabase SQL access. Once a key exists, wiring it in is a one-line
`app.json` change:
```json
"android": {
  "config": { "googleMaps": { "apiKey": "<key>" } }
}
```
followed by `npx expo prebuild --clean --platform android` (native config
change — regenerates `AndroidManifest.xml`) and a dev-client rebuild. Not
attempted here per the sweep's escalation boundary (native/config change
needing a credential the delegate doesn't have).

### Impact on this sweep

**All of Phase 3 is blocked** — task checklist, photo upload, my jobs, cancel
all sit behind this same wizard's Location step, since it's step 2 of 5 for
every service. **Phase 5 (cross-role hire loop) is transitively blocked too**
— it needs a job to exist, and no job can currently be created from mobile at
all. Phase 4 (provider browse/apply) is unaffected by this specific bug
(doesn't touch job creation) but has nothing to browse without Phase 3
producing jobs, other than jobs seeded some other way (e.g. directly via API/SQL).

### Evidence

Logcat captured via `adb logcat -d`, reproduced twice (once per location
option) 2026-09-13. Screenshots of both crash instances (identical redbox)
taken during this session's exploration, not committed as named artifacts.

---

## BUG-005 — Post a Job wizard's bottom action bar partly overlaps the system navigation bar (BUG-002-class, not fixed by BUG-002's patch)

**Found:** 2026-09-13, Phase 3 (exploring client job creation)
**Status:** open — logged, not fixed. Does not fully block testing (a tap in
the upper ~50px of the button's reported bounds reaches the app), but is a
real, reproducible defect a real user's thumb can easily hit.
**Severity: medium-high.** Same root cause class as BUG-002 (missing
safe-area insets under edge-to-edge), but BUG-002's fix (`App.tsx`/
`BottomNavBar.tsx`) only touched the persistent bottom nav — this wizard's own
footer (Back/Next/Submit bar) was not part of that fix and still isn't inset.

### Steps

1. Start Post a Job, reach Step 1 (Service).
2. Use `adb shell input tap` (or an equally precise tap) at the *lower* edge
   of the "Next" button's accessibility bounds — confirmed via
   `uiautomator dump`: bounds were `[53,2230][1028,2362]` on this device, so a
   tap at y≈2296 (roughly the bounds' vertical center).

### Expected

The tap always reaches the app's Next handler, since the button is drawn (and
its accessibility bounds are reported) as fully on-screen, non-overlapping
with system UI.

### Actual

A tap at y≈2296 exits to the **OS launcher** (Home) instead of reaching the
app at all — identical symptom to BUG-002 pre-fix. A tap at y≈2245 (55px
higher, still within the same reported bounds) **does** reach the app's Next
handler and advances the wizard. So roughly the bottom half of this button's
reported clickable area is actually intercepted by the system's 3-button
navigation bar, which sits on top of it (edge-to-edge, no inset) — the
accessibility bounds overstate the area that's actually reachable.

### Cause (inferred, not re-verified with the same rigor as BUG-002)

Same class as BUG-002: this wizard's bottom action bar isn't wrapped with
`useSafeAreaInsets()` the way `BottomNavBar` now is post-fix. Not re-run
through the full BUG-002 elimination process here — flagging by pattern
match rather than re-deriving from scratch, since the fix is the same shape
(drive the bar's bottom padding from `insets.bottom`) wherever this footer
component is defined (shared across the wizard's 5 steps, so likely one
component to fix for all of them).

### Impact on this sweep

Automated flows targeting this screen's Next/Back/Submit buttons must aim at
the upper portion of the reported bounds, not the center — same practical
workaround Phase 2 uses for BUG-003-adjacent issues. Not chased to a full
root-cause/fix here since BUG-004 already fully blocks this screen from being
useful, and per §2's blocker-exception rule this is a UI-polish issue,
not what's actually blocking further testing right now.

## Not yet triaged

- **`@react-native-community/datetimepicker` is back to 9.1.0** on SDK 57 (the
  8.4.4 downgrade from the SDK-54 realignment was undone by the upgrade). The
  earlier concern — a version-mismatched picker — no longer applies, but it
  still has **not been exercised at runtime** on this build: `HOCreateJobScreen`
  uses it heavily with platform-specific Android behaviour, and the only flow
  that reaches it (`jobs_create_plumbing.yaml`) is currently blocked before the
  picker step by BUG-002. Verify the time picker once BUG-002 is cleared and
  Phase 3 can reach job creation.
