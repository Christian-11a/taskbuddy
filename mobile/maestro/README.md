# Maestro flows

Manual-testing-as-code for the TaskBuddy mobile app, run against an Android
emulator (or device) with a real dev client — not Expo Go, and not the web
build. The app is on **Expo SDK 57 / React Native 0.86** (upgraded from SDK 54
on 2026-09-12; see the native-regeneration note below and `mobile/README.md`).

## One-time setup

```bash
# Java: point at Android Studio's bundled JBR (JDK 21) rather than installing
# a separate JDK — Maestro needs 17+.
export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"
export PATH="$PATH:$HOME/.maestro/bin:$LOCALAPPDATA/Android/Sdk/platform-tools"

# Build and install the dev client on a running emulator.
npx expo run:android

# Create the two persistent test accounts these flows log into.
# See flows/00_setup_test_accounts.md — this one is a runbook, not a flow.
```

## Per-session startup checklist

Run through this every session before touching a flow — most "the app is broken"
dead ends trace back to a skipped step here:

1. **Shell env** (every new shell — these do not persist):
   ```bash
   export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"   # Maestro needs JDK 17+
   export ANDROID_HOME="$LOCALAPPDATA/Android/Sdk"
   export PATH="$PATH:$HOME/.maestro/bin:$LOCALAPPDATA/Android/Sdk/platform-tools"
   ```
2. **Emulator up:** `adb devices` shows a `device` (not `offline`).
3. **Warm the backend** before the first flow — it is on Render's free tier and
   cold-starts in 30–60 s (see "Backend timing"): `curl -s -o /dev/null -w
   "%{http_code}\n" https://taskbuddy-kpek.onrender.com/health`. A cold login
   flow will otherwise time out mid-spinner and look like a bug.
4. **Metro is THIS project's** — the single most expensive trap this suite has
   hit. See "Metro port collision" below. Quick check: the process on `:8081`
   must be an `expo start` from `taskbuddy/mobile`, and the app's first real
   screen must say **TaskBuddy** ("Hire with confidence, pay with ease."), not
   another app's login.
5. **Dev client matches the current SDK** — if you have just pulled an SDK
   upgrade, regenerate the native project first (see "If the app crashes
   instantly on a dev build").
6. **One flow per invocation** — see "Running flows".

## Running flows

```bash
maestro test maestro/flows/smoke_login_both_roles.yaml
```

**Run flows one at a time, not as a multi-file or directory invocation.**
`maestro test a.yaml b.yaml` and `maestro test maestro/flows` run the files
*concurrently* against the same device. TaskBuddy flows share job, escrow and
wallet state on two fixed accounts, so concurrent runs corrupt each other —
a hire racing a completion, a withdrawal racing a balance check. Invoke each
file separately.

Before wiring a device, `maestro check-syntax <flow.yaml>` validates a flow's
YAML and commands instantly — it is Maestro 2.x's replacement for the retired
`maestro validate` subcommand. Run it after editing any flow, before spending
emulator time.

## If the app crashes instantly on a dev build

**First, decide which of two native/JS mismatches you have** — both look like
"the app is broken" but have different fixes:

**1. The native project is stale after an SDK upgrade.** This was the whole
story on 2026-09-12 resuming after the SDK 54 → 57 bump. The upgrade commit
(`232b58f`) changed `package.json`/`app.json` but nobody regenerated the
gitignored, prebuild-managed `mobile/android/`, so `expo run:android` reused a
stale SDK-54 native project and it failed two ways in sequence:

- **Compile error:** `MainApplication.kt: Unresolved reference
  'ReactNativeHostWrapper'` — the SDK-54 template referenced a class SDK 57's
  Expo modules no longer provide.
- **Runtime red-box (if an old APK is still installed):** `Can't find
  ViewManager 'RNCSafeAreaProvider'` — the installed APK's native side predates
  the JS bundle Metro now serves.

Fix: **regenerate the native project**, don't chase the build cache:

```bash
npx expo prebuild --clean --platform android   # rewrites mobile/android/ from SDK 57 templates
npx expo run:android                            # rebuild + reinstall the dev client
```

A clean checkout does *not* hit this — with no `android/` present,
`expo run:android` auto-prebuilds fresh. Only a checkout carrying an `android/`
from before the upgrade is affected.

**2. A single package is ahead of the SDK.** Run `npx expo-doctor`. The classic
symptom is a `ClassNotFoundException` for an Expo Kotlin class. Cause: a package
installed with bare `npm install <pkg>` (installs latest) instead of
`npx expo install <pkg>` (installs the SDK-compatible version). Fix with
`npx expo install --fix`. **Always use `npx expo install`, never bare
`npm install`, for any `expo-*` or native module.**

**This whole class of bug is invisible in Expo Go**, which ships its own native
runtime and ignores native-module version mismatches — it only appears in a dev
build. And don't burn rebuilds on a stale-build-cache theory: on 2026-08-27 two
full rebuilds were spent that way before `expo-doctor` answered it in seconds.

## Backend timing

The API is on Render's free tier. After ~15 minutes idle the first request
takes 30–60s while the dyno wakes. **This is expected, not a defect.** Warm
the backend before a session (open the app once, or curl the health endpoint)
rather than logging it as a bug. All first-launch waits use 60s timeouts.

## Metro port collision (verify the dev server is THIS project's)

The dev client loads whatever JS bundle answers on `:8081` — it does **not**
verify the bundle belongs to TaskBuddy. If another Expo project (this machine
also has `eiyu-system`, the app this suite was ported from) already has an
`expo start` running on `:8081`, the freshly built TaskBuddy native shell will
happily load *that* project's JS. On 2026-09-12 this presented as a login screen
reading "EIYU SYSTEM" instead of "TaskBuddy", and every flow failing on the
`"Welcome!"` assertion — it cost real time to diagnose because nothing errors;
the wrong app just loads.

Before running flows, confirm `:8081` is this project's Metro:

```bash
# What is on 8081, and from which project?
netstat -ano | grep ":8081 " | grep LISTENING          # note the PID
powershell "Get-CimInstance Win32_Process -Filter 'ProcessId=<PID>' | % CommandLine"
# Want it gone? Stop it, then start TaskBuddy's own:
powershell "Stop-Process -Id <PID> -Force"
cd mobile && npx expo start --port 8081 --clear
```

The definitive check is visual: the app's first real screen must say
**TaskBuddy**, not another app's name. `--no-bundler` on `expo run:android`
makes this worse — it skips starting Metro and silently reuses whatever is on
`:8081`, so only pass it when you have already confirmed the right Metro is up.

## Scope & phases

The suite grows in numbered phases. Each phase's surface is explored
manually first — defects are logged, then triaged per phase; a defect is
fixed immediately only when it blocks further testing — and the settled
behaviour is locked in as Maestro flows. A later phase only starts once the
earlier ones are green:

0. Harness + smoke (this directory, `smoke_login_both_roles.yaml`)
1. Auth (login ×2 roles, wrong password, signup, forgot password, logout)
2. Profile & settings (incl. delete account — burner accounts only)
3. Client jobs (create, checklist, photos, cancel)
4. Provider side (browse, filter, apply, withdraw, availability)
5. Cross-role loop: hire → escrow held → accept → start → complete → released
6. Wallet (overview, withdraw request, Stripe top-up)
7. Reviews, disputes, chat, notifications
8. Provider verification
9. Edge probes — double-tap on hire/complete, 401 refresh, 503, back-stack

Deliberately untested here. Do not re-discover these as bugs:

- **Push delivery.** There is no EAS projectId in app.json.
- **Wallet transfer.** Unbuilt on purpose.
- **Stripe-hosted pages.** Maestro does not drive the browser that Checkout and
  Connect onboarding open. `hire_payment_choice.yaml` and
  `payouts_entry_provider.yaml` stop at the app side, and the rest is the
  manual recipe in `docs/stripe-setup.md` §7.
- **Things that live in the web console.** Issuing a recovery voucher, settling
  a withdrawal, and retrying a transfer are admin actions there. Mobile proves
  a withdrawal request files, reserves and cancels, and that a voucher shows
  up in the Wallet once issued.

## Known selector traps

- **`id:` selectors work — prefer them, with one exception.** Verified
  2026-08-27 on this build: `tapOn: { id: "input-email" }` resolves on
  TextInputs and `btn-sign-in` fires on a TouchableOpacity, so React Native
  `testID`s do surface to Maestro here. **But a bare `Pressable` carrying a
  `testID` silently no-ops** — `btn-signup` on LoginScreen is one: the tap
  reports COMPLETED and nothing happens, because RN does not mark a bare
  Pressable accessible, so the tap routes to its non-clickable Text child.
  Tap those by text. Anchor on `testID` wherever one exists on a real
  accessibility element; display copy is Taglish and product-owned, so text
  selectors couple the suite to wording that changes for non-technical
  reasons.
- **Never press `back` unconditionally after launch.** eiyu-system's
  `launch_fresh` does, to dismiss Expo's one-time dev-menu tutorial overlay.
  An unconditional `back` on a screen without that overlay lands on the app's
  root and **closes the app**, and the run then fails on the next assertion with
  the app no longer running. `optional: true` does not protect you: `back`
  always succeeds, it just does the wrong thing. `launch_fresh.yaml` guards it
  with `runFlow: { when: { visible: ... } }` instead. (Note: the freshly
  prebuilt SDK 57 dev client *does* now show a launcher/server entry to tap —
  `launch_fresh.yaml` handles it by tapping the `:8081` entry; see the next
  bullet — so don't assume "no picker".)
- **The dev-server URL varies — anchor on the port, not the host.** It has been
  observed as the LAN address (`http://192.168.1.8:8081`) on an older build and
  as the emulator loopback alias (`http://10.0.2.2:8081`) on the freshly
  prebuilt SDK 57 client. The host moves between machines, networks, and
  prebuilds, so `launch_fresh.yaml` anchors on the Metro **port** (`.*8081.*`)
  instead — which matches either form.
- **Onboarding slides reappear on every run.** `hasCompletedOnboarding` is
  AsyncStorage-backed and keyed by profile id (`src/lib/onboarding.ts`), and
  `launchApp: { clearState: true }` wipes AsyncStorage. So the post-login
  onboarding gate fires on *every* Maestro login, not just a genuinely new
  account. Both login helpers tap "Skip" with `optional: true`.
- **Login selects by `testID`, not text.** `LoginScreen` already ships
  `input-email`, `input-password`, `btn-sign-in` (`LoginScreen.tsx:199/226/255`).
  This avoids a real collision: the password field's *placeholder* is the
  literal string `Password` and the screen renders a `Password` *label* above
  it (`:217` vs `:225`), so `tapOn: "Password"` has two candidates.
- **Login and Register do not share selector conventions.** Login's password
  placeholder is the literal `Password`; Register masks its two password
  placeholders as `••••••••`. Register's `FormInput` now ships `input-name`,
  `input-email`, `input-password`, `input-confirm-password` (added 2026-08-27,
  inert passthrough like `ConsentCheckbox`'s) — use those; the consent
  checkboxes keep their `chk-*` ids.
- **Positional selection across two secure fields is unreliable — do not use
  it.** Two things are true on this app that eiyu-system's warning got
  backwards: the masked placeholder DOES clear once a field holds a value
  (after filling index 0, `index: 1` fails with "Index: 1 not found"), and a
  *filled* secure field stops exposing its content to accessibility, so the
  number of `••••••••` matches changes mid-form and any positional selector
  can silently land on the wrong field — both passwords ended up in the first
  box and registration failed on "Passwords do not match." This is why
  Register's FormInput fields carry testIDs. (The stale
  `sign-up-flow-*.yaml` scratch flows use `index: 1` and are wrong for this
  app.)
- **The first tap after a cold launch can be swallowed.** On a cold JS bundle
  the Login screen paints before React attaches press handlers; the tap
  reports COMPLETED and navigates nowhere. `00_setup_register_client.yaml`
  settles with `waitForAnimationToEnd`, then retries the tap once, guarded by
  `runFlow: { when: { visible: "Welcome!" } }`. A human tapping fast right
  after launch hits the same thing — a real UX finding, not just a flow quirk.
- **The three consent checkboxes do not behave alike.** `chk-terms` and
  `chk-privacy` each open a full document screen whose accept button sits at
  the end of the copy (Privacy's is below the fold — scroll);
  `chk-data-collection` is a plain toggle. Tapping all three and expecting
  three ticks silently leaves two unchecked.
- **Google Password Manager hijacks the screen after password entry** on a
  stock emulator, dimming the app and blocking the accessibility tree. Fix it
  environmentally, not per-flow:
  `adb shell settings put secure autofill_service null`
- **Launcher behaviour changed after the SDK 57 prebuild.** The pre-upgrade dev
  client auto-connected with no server picker and no dev-menu overlay. The
  freshly prebuilt SDK 57 client instead shows a launcher entry (the `:8081`
  server URL) to tap before the app loads — `launch_fresh.yaml` handles it by
  tapping the `.*8081.*` entry. The dev-menu tutorial overlay still does not
  appear here; `launch_fresh.yaml` keeps guarded handling in case an emulator or
  dev-client update reintroduces it, but never presses `back` unconditionally
  (see the `back` entry above — that closed the app).

- **Home screen's avatar button had no `testID`.** Added `btn-home-avatar` to
  both `HOHomeScreen.tsx` and `SPHomeScreen.tsx` (inert, no behaviour change)
  because it's an icon-only button rendering dynamic initials
  (`OwnAvatar`) — text selection can't disambiguate dynamic per-user content,
  exactly the case the project's selector policy (spec §4) calls out for a
  `testID`. Needed to reach Settings/Profile in any flow.
- **Two elements share the text "Log Out" once the sign-out confirm modal is
  open** — the Settings row behind it, and the modal's own confirm button
  (`confirmLabel="Log Out"` on `ConfirmationModal`). Disambiguated with a
  `below:` relative selector anchored on the modal's message text, not
  `index`, since the row is still in the tree (just covered by the modal).
- **`ConfirmationModal`'s Cancel/confirm buttons are side-by-side, not
  stacked** — `below:` anchored on the modal's message text works for a
  *short* single-line message (Log Out's), but failed outright against
  `HOSettingsScreen`'s delete-account modal, whose message wraps five lines.
  Use `rightOf: "Cancel"` for the confirm button on any `ConfirmationModal`
  with a multi-line message — geometrically unambiguous regardless of message
  length, and it's what actually worked for
  `settings_delete_account_burner.yaml`.

- **Typing a string containing a doubled "r" ("rr"/"RR") reloads the whole
  app.** Found 2026-09-13 writing Phase 2's Change Password flow: `inputText:
  "WrongCurrentPassword"` (and `"WrongCurrent123!"`) each triggered a full
  "Loading from 10.0.2.2:8081…" reload mid-field-entry, landing back on
  Login — looked exactly like a crash/nav bug at first. Root-caused via
  `adb logcat`: `ReactHost{0}.getOrCreateReloadTask()` fires right as the
  keystrokes land. This is React Native's own dev-mode hardware-keyboard
  shortcut — pressing `R` twice quickly reloads the JS bundle — firing because
  Maestro's Android text input sends real keystrokes fast enough to trigger
  it. Confirmed directly with a throwaway `inputText: "aabbrrcc"`, which
  reloads on the double `r` alone. **Not app-specific and not a product bug**
  — it would hit any RN dev build. Avoid it by choosing test strings with no
  doubled letter (e.g. `"WrongPassLogin1!"` instead of anything containing
  "Curr...", "err...", "arr...", etc.) rather than working around it
  per-flow; check any new literal typed via `inputText` for a repeated
  consonant before relying on the flow's result.

## What's covered

- `smoke_login_both_roles` — harness proof: launches clean, logs in as the
  client and the provider, asserts each role's home screen.
- `nav_bottombar_client` — regression cover for BUG-002: asserts the homeowner
  bottom-nav routes (a regular tab, Home, and the Create-job FAB) each navigate.
  Taps by `nav-tab-*` testID, since the label "Home" collides with the OS
  launcher's own Home button in the accessibility tree.
- `auth_wrong_password` — wrong password on a real account shows an inline
  error, stays on Login.
- `auth_logout_client` / `auth_logout_provider` — sign out from Settings
  returns to Login, both roles.
- `auth_forgot_password_request` — stage 1 only (request the code); stage 2
  needs a real inbox, same as signup-with-OTP, not automated.
- `auth_signup_client_no_confirmation` — full homeowner signup end-to-end
  against this environment's current Confirm-email-OFF state; see
  `bug-log.md`'s environment note before assuming this represents the
  project's normal configuration.
- `settings_delete_account_burner` — Phase 2: delete account happy path on a
  disposable burner.
- `settings_client` — Phase 2: SMS Alerts toggle on/off (via `toggle-*`
  testIDs), and Change Password's four states (empty fields, too-short,
  mismatch, and a real wrong-current-password round trip to the API). Closes
  and reopens the modal (`Cancel` → `Change Password`) between each
  validation round — `inputText` appends rather than replaces, so an earlier
  draft of this flow that skipped that step produced concatenated garbage
  across rounds and a false-looking failure on the last assertion.

## Phase 3 status (2026-09-13) — blocked immediately, hard stop

Post a Job's Step 2 (Location) crashes the app fatally, unconditionally,
regardless of "Use default" or "Enter custom" — see BUG-004 in bug-log.md.
**No job can be created from mobile right now**, which blocks all of Phase 3
and transitively Phase 5 (needs a job to exist). Root cause: `react-native-maps`
is used in `HOCreateJobScreen.tsx` with no Google Maps API key ever configured
in `app.json`/`AndroidManifest.xml` — needs a real credential to fix, escalated
rather than worked around. No flows written this phase; nothing to automate
against a screen that can't render.

Also found BUG-005 while probing this screen's tap coordinates: the wizard's
bottom action bar has the same missing-safe-area-insets issue BUG-002 had,
un-fixed by BUG-002's patch (which only touched the persistent bottom nav).
Lower-severity, doesn't block on its own.

## Phase 2 status (2026-09-13) — Settings done and green; Edit Profile blocked on environment, not app, issues

**Settings** (`settings_client.yaml`, passes end-to-end) — Dark Mode/Push/
Email/SMS toggles persist for real through `/settings`, and Change
Password's four states (empty fields, too-short, mismatch, and a real
wrong-current-password round trip to the API) all show the right inline
error. `toggle-dark-mode`/`toggle-push_enabled`/`toggle-email_enabled`/
`toggle-sms_enabled` testIDs were added to both `HOSettingsScreen.tsx` and
`SPSettingsScreen.tsx` (inert) so the three notification switches can be
disambiguated — `rightOf`/positional selectors picked the wrong switch on
this screen once, see the toggle testID note.

**Edit Profile** (`profile_edit_client.yaml`) has correct selectors and
matches verified app behavior — it has passed end-to-end at least once (burner
registered, profile saved and verified showing "Quezon City, 123 Test
Street", account deleted in cleanup) — but is **not reliably green**: two
harness bugs in the flow file itself were found and fixed 2026-09-13 (a
redundant `btn-home-avatar` tap in cleanup after already being on Profile,
and a `Sign Up` retry race during registration — see bug-log.md's session
note), and **ENV-001 remains an unfixed, frequent blocker** — it hit 2 of 3
runs that reached the Phone field even after both harness fixes, always the
same symptom (app backgrounds to Google Calendar). This is a Gboard/AVD
keyboard-suggestion issue, not app or flow code — see ENV-001 in
bug-log.md. This AVD has no non-Gboard keyboard installed
(`adb shell ime list -s` shows only Gboard and Google Voice Typing), so
disabling Gboard isn't viable without provisioning a different keyboard
first. **Before relying on this flow passing in CI or a fresh run, either
provision this AVD with a plain keyboard or disable Gboard's contextual
suggestions** (Gboard → Preferences → Text correction) — re-debugging this
as an app issue would be wasted effort.

If a run fails after registering the burner but before the cleanup step,
`maestro.editprofile@taskbuddy.test` is left registered on the backend and
the next attempt's Sign Up fails with "User already registered" — log in as
that account and delete it (Settings → Delete Account) before retrying.
