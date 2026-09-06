# Maestro flows

Manual-testing-as-code for the TaskBuddy mobile app, run against an Android
emulator (or device) with a real dev client — not Expo Go, and not the web
build (SDK 54).

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

Run `npx expo-doctor` **first** — before suspecting Maestro, Gradle, or the
build cache.

On 2026-08-27 the app died on every launch with
`ClassNotFoundException: expo.modules.kotlin.types.AnyTypeCache`. Cause:
`package.json` pinned `expo-splash-screen@^57.0.4` on an SDK 54 project, which
expects `~31.0.13`. Splash-screen 57 is compiled against a newer
`expo-modules-core` that has that class; SDK 54 ships 3.0.30, which does not.
`@react-native-community/datetimepicker` was similarly ahead (9.1.0 vs 8.4.4).
Both came from `npm install <pkg>` (installs latest) instead of
`npx expo install <pkg>` (installs the SDK-compatible version). Fixed with
`npx expo install --fix`.

**This class of bug is invisible in Expo Go**, which ships its own native
runtime and ignores native module version mismatches. It only appears in a dev
build — so always use `npx expo install`, never bare `npm install`, for any
`expo-*` or native module.

Two full rebuilds were spent on a stale-build-cache theory before `expo-doctor`
answered it in seconds. Don't repeat that.

## Backend timing

The API is on Render's free tier. After ~15 minutes idle the first request
takes 30–60s while the dyno wakes. **This is expected, not a defect.** Warm
the backend before a session (open the app once, or curl the health endpoint)
rather than logging it as a bug. All first-launch waits use 60s timeouts.

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

Deliberately untested — do not re-discover these as bugs: push delivery (no
EAS projectId in app.json), recovery vouchers (no issuance endpoint exists —
the wallet card stays empty by design), wallet transfer (unbuilt on purpose),
and the final settlement of withdrawals (an admin action the web console has
no UI for; mobile can prove a request files, reserves, and cancels).

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
  This dev client shows *neither* that overlay nor the server picker — it
  auto-connects — so an unconditional back lands on the app's root screen and
  **closes the app**, and the run then fails on the next assertion with the app
  no longer running. `optional: true` does not protect you: `back` always
  succeeds, it just does the wrong thing. `launch_fresh.yaml` guards it with
  `runFlow: { when: { visible: ... } }` instead.
- **The dev-server URL is not `10.0.2.2`.** eiyu-system matched the emulator
  loopback alias; this machine's dev client binds the LAN address (observed as
  `http://192.168.1.8:8081`). The IP moves between machines and networks, so
  `launch_fresh.yaml` anchors on the Metro **port** instead.
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
- **This dev client auto-connects — no server picker, no dev-menu overlay.**
  eiyu-system's launch handled both; here neither appears, and the inherited
  unconditional `back` that dismissed the overlay *closed the app* (see the
  back entry above). `launch_fresh.yaml` keeps guarded handling in case an
  emulator or dev-client update ever reintroduces the overlay.

## What's covered

- `smoke_login_both_roles` — harness proof: launches clean, logs in as the
  client and the provider, asserts each role's home screen.
