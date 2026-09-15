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

## Not yet triaged

- **`@react-native-community/datetimepicker` is back to 9.1.0** on SDK 57 (the
  8.4.4 downgrade from the SDK-54 realignment was undone by the upgrade). The
  earlier concern — a version-mismatched picker — no longer applies, but it
  still has **not been exercised at runtime** on this build: `HOCreateJobScreen`
  uses it heavily with platform-specific Android behaviour, and the only flow
  that reaches it (`jobs_create_plumbing.yaml`) is currently blocked before the
  picker step by BUG-002. Verify the time picker once BUG-002 is cleared and
  Phase 3 can reach job creation.
