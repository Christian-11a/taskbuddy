# TaskBuddy Mobile

## FullTest remediation — 2026-10-02

Bug fixes cover approved skill filtering, job photos and lifecycle, escrow totals, cancellation/warranty dispute access, notification creation, and responsive auth/privacy/job forms. The October 4 follow-up implements shared light/dark palettes and provider photo portfolios; see the current implementation section below.

Migrations **0037 and 0038** are applied to the linked Supabase project. The
Render API restarted after the fork's `main` push and passed `/health`, but
that response does not identify its deployed commit. Verify the new API
contracts and run the Android device flows before releasing this app. See
[backend handover](../HANDOFF.md) for remaining checks.

The Expo / React Native app for **TaskBuddy**, a Philippine home-services
marketplace. Clients post jobs, providers apply and complete them.
(The `web/` app is an admin console only; it has no client or provider surface.)

Everything on screen reads from the real NestJS API — there is no mock data
layer. See [What's not wired yet](#whats-not-wired-yet) for the honest list of
buttons that still do nothing.

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Runtime | **Expo SDK 57** / **React Native 0.86** / **React 19** |
| Language | **TypeScript** |
| Auth | **AuthContext** backed by the NestJS API (JWT + Supabase sessions) |
| Storage | **AsyncStorage** — session persistence only |
| Icons | **lucide-react-native** |
| UI extras | **react-native-calendars**, **expo-image-picker**, **expo-notifications**, **react-native-sse** |
| Navigation | Custom `useState` in `App.tsx` — no router library |

---

## Getting Started

```bash
cd mobile
npm install
npm run android    # builds + installs the Android dev client, then starts Metro
                   # (first run costs several minutes of Gradle — it prebuilds
                   # mobile/android/, which is gitignored)
```

> **After an Expo SDK upgrade, regenerate the native project.** `mobile/android/`
> is gitignored and prebuild-managed, so a clean checkout builds fine (`npm run
> android` auto-prebuilds when `android/` is absent). But an `android/` folder
> left from *before* the upgrade is reused as-is and no longer matches the new
> SDK — you get a compile error (`Unresolved reference 'ReactNativeHostWrapper'`)
> or, if an old APK is still installed, a runtime `RNCSafeAreaProvider`
> ViewManager crash on launch. Fix by regenerating:
> `npx expo prebuild --clean --platform android`, then `npm run android`. This is
> the actual footgun behind the SDK 54 → 57 bump: the upgrade commit changed
> `package.json`/`app.json` but no one regenerated their local `android/`.

**Android development requires the dev client — not Expo Go.** The app carries
native modules (notifications, image picker, calendars), the Maestro e2e suite
in `maestro/` drives the dev client build, and Expo Go masks native-version
mismatches — its runtime ships its own modules, which is how a wrong
`expo-splash-screen` pin crashed every dev build while Expo Go looked fine.
`npm start` still works for Metro only: open the dev client on the emulator and
it connects. On a freshly prebuilt SDK 57 dev client the launcher shows a server
entry (e.g. `http://10.0.2.2:8081`) to tap rather than auto-connecting silently,
so make sure the Metro it points at is **this** project's — see the Metro-port
trap in `maestro/README.md`.

By default the app talks to the deployed backend at
`https://taskbuddy-kpek.onrender.com`, so it works with no local setup.

To run against a local backend, copy `.env.example` to `.env` and point at
your machine — on an **emulator** use `10.0.2.2` (the host's loopback alias;
stable across networks), on a **physical device** use the machine's **LAN IP** —
never `localhost`, which on a phone/emulator refers to the device itself:

```env
EXPO_PUBLIC_API_URL=http://10.0.2.2:3000        # emulator
# EXPO_PUBLIC_API_URL=http://192.168.1.20:3000  # physical device
```

Only `EXPO_PUBLIC_*` variables reach the app at bundle time. Restart the dev
server after changing `.env` — a Metro restart is enough; no Gradle rebuild.

> **Free-tier note:** the Render backend spins down after ~15 minutes idle, so
> the first request can take 30–60 s. If the splash screen seems stuck, that's
> a cold start, not a crash.

Other scripts:

```bash
npm run typecheck   # tsc --noEmit
npm test            # jest (jest-expo preset + React Native Testing Library)
npm run ios         # expo run:ios (dev build, same reasoning as Android)
```

---

## Project Structure

```
mobile/
├── App.tsx                     # Root: session gate + all navigation state
├── index.ts                    # Expo entry point
├── app.json                    # Expo config (scheme: taskbuddy, package: com.taskbuddy.app)
├── app/
│   ├── layout.tsx              # 600px max-width centred frame
│   ├── SplashScreen.tsx
│   ├── (auth)/screens/         # Onboarding, Login, Register, ForgotPassword, T&C
│   ├── (homeowner)/screens/    # Client-side screens (HO*)
│   └── (provider)/screens/     # Provider-side screens (SP*)
└── src/
    ├── lib/api.ts              # THE API CLIENT — every network call lives here
    ├── lib/pushNotifications.ts # Expo permission + push-token registration helper
    ├── lib/format.ts           # peso(), shortDate(), timeAgo(), jobStatusMeta()…
    ├── context/AuthContext.tsx # Session, profile, role, signInWithGoogle
    ├── lib/onboarding.ts       # "has this account seen the slides?" flag
    ├── hooks/useAsyncData.ts   # { data, loading, error, reload }
    ├── hooks/useSettings.ts    # user_settings row, optimistic toggle writes
    ├── components/             # BottomNavBar, ConfirmationModal, ScreenSkeleton,
    │                           #   HelpSupportScreen, AvatarPicker, OwnAvatar
    ├── constants/theme.ts      # Colors, Radii, Shadows, Sizes, Spacing
    └── types/navigation.ts     # Screen key unions
```

> The `app/(auth)`, `app/(homeowner)`, `app/(provider)` folders look like
> Expo Router groups but **aren't** — expo-router is not a dependency.
> The parenthesised names are a naming convention only.

---

## Navigation: there is no router

All navigation is `useState` in `App.tsx`. It tracks the current tab and screen
per role, plus a selected `jobId` threaded through
`hoNavigate(screen, jobId?)` / `spNavigate(screen, jobId?)`.

`App.tsx` picks what to render based on `AuthContext`:

```
initializing         → SplashScreen
not authenticated    → Login / Register / Forgot Password
first login, once    → Onboarding
role 'homeowner'     → HO tab bar (Home, My Jobs, Create, Calendar, Wallet)
role 'provider'      → SP tab bar (Feed, My Work, Calendar, Wallet)
```

Neither tab bar has a Profile tab — Profile is reached via the avatar button
in Home's/Feed's header, matching the design mockup rather than the app's
earlier Figma-era layout.

Non-tab screens (Job Detail, Chat, Edit Profile, Settings, Help & Support,
…) are tracked on a small back-stack (`hoStack`/`spStack` in `App.tsx`), not
just "jump to the active tab" — `hoNavigate`/`spNavigate` push the screen
being left before switching, and `hoBack`/`spBack` pop it. Landing on a tab
resets the stack, same as tapping a tab in a native app. Create Job is the one
exception: it pushes onto the stack like an ordinary screen (so "My Jobs" →
New → back returns to My Jobs, not Home), and its own onBack/onSuccess
handlers land it on the right tab when the flow ends.

Adding a new screen requires three edits: add the key to
`src/types/navigation.ts`, render it in `App.tsx`, and navigate to it via
`onNavigate`.

---

## Talking to the Backend

**Every network call goes through `src/lib/api.ts`.** Nothing else calls `fetch`.

- **Casing is `snake_case` in both directions** — request bodies and responses
  mirror Postgres column names. Do not camelCase a request body.
- **The backend validates with `forbidNonWhitelisted`**, so sending an undeclared
  field returns a hard `400`, not a silently ignored extra.
- **Roles differ from the UI vocabulary.** The wire uses `client`; the UI says
  `homeowner`. `toBackendRole` / `toMobileRole` in `api.ts` translate between them.
- `authRequest()` attaches the Bearer token and, on a `401`, refreshes once and
  retries. `ApiError` carries `status` and the backend's message string
  (unwrapping class-validator's `message[]` array), so screens can display it directly.

---

## Authentication

`src/context/AuthContext.tsx` owns the session and registers the token accessor
with `api.ts` via `configureApiAuth`.

### Email / Password

1. `POST /auth/login` → `GET /auth/me` for profile + provider profile.
2. Session is persisted to AsyncStorage under `taskbuddy.session`.
3. On boot the stored session is restored and re-validated with `GET /auth/me`;
   a `401` triggers `POST /auth/refresh` and one retry.
4. `signOut()` clears local state first, then fires `POST /auth/logout`.

Registration returns `session: null` when the Supabase project has email
confirmation enabled — the Register screen shows a "check your email" state instead.

### Google Sign-In (server-side OAuth)

The Google flow runs entirely through the backend so it works in both **Expo Go**
and production builds without needing to register `exp://` or `taskbuddy://`
as a redirect URI in Google Cloud Console.

```
App  →  WebBrowser.openAuthSessionAsync(GET /auth/google/authorize?app_redirect=<deep-link>)
          Backend  →  302 to Google consent screen
            Google →  302 to https://taskbuddy-kpek.onrender.com/auth/google/callback
              Backend  →  exchanges code for id_token (server-to-server)
                       →  signInWithIdToken via Supabase
                       →  302 to <deep-link>?access_token=...&refresh_token=...
App  →  parses tokens from URL, calls GET /auth/me, user is signed in
```

Google never sees the app deep-link — only the backend HTTPS callback URL.
**For backend setup steps** (Google Cloud Console, Supabase provider, Render env
vars) see [`docs/google-auth-setup.md`](../docs/google-auth-setup.md).

### Uploads

Images never pass through the NestJS API.
`api.uploadImage(bucket, uri)` asks the backend for a signed Supabase Storage
URL (`POST /uploads/signed-url`), `PUT`s the file straight to Supabase Storage,
and returns the storage **path**. That path — not a device URI — is what job
creation and verification endpoints submit.

The storage `PUT` goes through `XMLHttpRequest`, not `fetch`. Expo replaces the global `fetch` with
`expo/fetch`, which rejects React Native's `{ uri, name, type }` multipart file part with
`Unsupported FormDataPart implementation`; XHR still hands that part to the native networking layer.
Don't "simplify" it back to `fetch` (`src/lib/__tests__/api.uploadImage.test.ts` guards this).

### Backend handoff: job photo URLs

`api.uploadImage('job-photos', uri)` intentionally returns a Supabase Storage
object path, such as `<profile-id>/<uuid>.jpg>`. `HOCreateJobScreen` submits
those paths in `photo_urls`, and `HOJobDetailScreen` renders the values it
receives from `GET /jobs/:id` as React Native image URIs.

**Implemented in the API; deployed behavior needs verification:** transform relative `jobs.photo_urls` paths into
public URLs from the public `job-photos` bucket when returning job objects from
`GET /jobs/:id` (and preferably `/jobs/mine`, `/jobs/browse`, and `/jobs/assigned`).
Absolute HTTP(S) URLs from older rows are preserved. Confirm the deployed
`GET /jobs/:id` returns a usable URL before counting the photo flow as working
on a device.

### Live chat and push notifications

Both chat screens first load message history, then open the authenticated
`GET /conversations/:id/stream?since=` SSE endpoint through
`react-native-sse`. The stream emits new messages and keep-alive pings while
the screen is focused; cleanup closes it when the screen unmounts. The API
polls its database behind that SSE connection, so the mobile app still talks
only to the NestJS API rather than directly to Supabase Realtime.

After sign-in, the app best-effort requests notification permission and posts
an Expo push token to `POST /devices`; it unregisters that token on sign-out.
The backend's 30-second scheduler sends pending notification rows to opted-in
devices via Expo. Permission denial or a registration failure does not block
sign-in, and notification rows remain available in the in-app list either way.

> **⚠️ Push does not work yet: Firebase (FCM) is the remaining blocker.** The code
> is complete on both sides; the configuration isn't.
>
> - **EAS project id: done** (2026-09-16). `app.json` has `expo.extra.eas.projectId`.
> - **Firebase Cloud Messaging: not done.** Android remote push goes through FCM, so a
>   rebuilt dev client fails registration with `Unable to get Firebase Messaging
>   instance`. It needs a Firebase project with an Android app for
>   `com.taskbuddy.app`, `google-services.json` referenced from
>   `expo.android.googleServicesFile`, the FCM V1 credentials uploaded with
>   `eas credentials`, then a rebuild. Only someone with Firebase Console access can do
>   this. Steps: `HANDOFF.md` §4.
> - **A development build.** Remote push is not supported in **Expo Go** from SDK 53
>   onward, and a simulator can't receive pushes either. Test on a physical device.
>
> Until then, `src/lib/pushNotifications.ts` fails to obtain a token and `AuthContext`
> logs `[push] not registered …` in `__DEV__`. That warning is the intended signal, not
> a bug. A *denied* permission logs nothing, deliberately: the user chose it and it
> isn't a fault.

---

## Screens

### Auth flow

| Screen | Purpose |
|--------|---------|
| `OnboardingScreen` | Welcome carousel. Shown **once per account, after the first successful login** — not before it (see `src/lib/onboarding.ts`) |
| `LoginScreen` | Email/password + **Continue with Google** |
| `RegisterScreen` | Role selection (Homeowner / Provider), email/password + Google |
| `ForgotPasswordScreen` | Real, two stages: `POST /auth/forgot-password` mails a 6-digit code, `POST /auth/reset-password` exchanges it and returns a session — so a reset ends signed in |
| `TermsAndConditions` | Static T&C display |

### Client (Homeowner — `HO*`)

| Screen | Key API calls |
|--------|--------------|
| `HOHomeScreen` | `GET /wallet`, `GET /jobs/mine`, `GET /categories`, unread notification count |
| `HOMyJobs` | `GET /jobs/mine`, filtered client-side by status (All / Open / Awaiting / Confirmed / In Progress / Completed / Cancelled) |
| `HOCreateJobScreen` | `GET /categories`, `GET /jobs/geocode` + `GET /jobs/static-map` (location preview), image upload, `POST /jobs`. The guided 5-step flow: service → location → tasks → urgency → review |
| `HOJobDetailScreen` | `GET /jobs/:id`, `GET /providers/:id`, `POST /jobs/:id/recommendations/trigger`; complete / cancel / chat, review-state gating, manual provider-matching retry, and read-only task checklist |
| `HOChatScreen` | `POST /conversations` then message listing |
| `HOJobApplicationsScreen` | `GET /jobs/:id/applications`; Accept opens `HirePaymentModal` — `POST /applications/:id/accept` (wallet) or `POST /payments/hire-checkout-session` (card, then polls for `accepted`); Reject |
| `HOWalletScreen` | `GET /wallet` + `GET`/`POST /wallet/withdrawals`; Add Money opens Stripe Checkout, and Withdraw files/cancels manual payout requests |
| `HODisputeFilingScreen` | `POST /jobs/:jobId/disputes` |
| `HOProfile` | Displays profile data; menu is Edit Profile / Settings / Help & Support |
| `HOEditProfileScreen` | `PATCH /profiles/me`, then `refreshProfile()`. The backend geocodes a changed address and rejects the save with a readable message if it can't verify it |
| `HONotificationsScreen` | `GET /notifications`; mark read / read-all |
| `HOSettingsScreen` | `POST /auth/change-password` when `GET /auth/me` reports `has_password`, all five switches (`GET`/`PATCH /settings`), and `DELETE /profiles/me`. Google-only accounts without a password hide Change Password. Account deletion displays backend blockers and signs out after success; Dark Mode applies the shared palette and Language remains a placeholder |
| `HelpSupportScreen` (shared, `src/components/`) | Static FAQ + `mailto:` support link + the required Geoapify / OpenStreetMap attribution links — no backend |

### Provider (Service Provider — `SP*`)

| Screen | Key API calls |
|--------|--------------|
| `SPHomeScreen` | `GET /jobs` (location-filtered feed + summary), `GET /jobs/assigned` (confirmed bookings, with Start Job); availability toggle; a "Verification required to apply" banner until verified |
| `SPMyJobsScreen` | `GET /jobs/assigned`, `GET /applications/mine` |
| `SPJobDetailScreen` | `GET /jobs/:id`; apply to an open job, or start confirmed work and tick off the task checklist once it's theirs |
| `SPCalendarScreen` | `GET /calendar/bookings?from=&to=` for the current month |
| `SPChatScreen` | Messaging (same flow as HO) |
| `SPWalletScreen` | `GET /wallet` + `GET`/`POST /wallet/withdrawals` via `WithdrawModal`; Withdraw files/cancels manual payout requests, same as the homeowner wallet |
| `SPNotificationsScreen` | `GET /notifications`; tapping one about a job (recommendation invite, application or job update) opens that job's detail screen |
| `SPVerificationScreen` | 3-step flow — ID upload, face scan, then `POST /verifications/identity-session` (Stripe Identity, opened in a browser); falls back to `POST /verifications` for admin review if Stripe is unavailable |
| `SPProfileScreen` | Displays profile + provider-specific data + a real verified/unverified badge (`providerProfile.is_verified`); menu is Edit Profile / Get Verified / Settings / Help & Support |
| `SPEditProfileScreen` | `PATCH /profiles/me` + `PUT /profiles/me/provider`. The address is required and geocoded server-side, and the provider is only recommended for jobs within their **Service radius**, once verified and with a bio (`backend/BACKEND_SCHEMA.md` §32) |
| `SPSettingsScreen` | Mirrors `HOSettingsScreen` — same real/placeholder split; Delete Account calls `DELETE /profiles/me` via `DeleteAccountModal` |

---

## Money, Briefly

Hiring holds the job budget in escrow. Accept on a proposal
(`HOJobApplicationsScreen`) opens `HirePaymentModal`, which offers two ways to pay:

- **Pay from wallet**: `POST /applications/:id/accept` holds the budget from the
  wallet. It is disabled, with an **add money** link, when the wallet is short.
  The API refuses with `400 Insufficient wallet balance` anyway.
- **Pay by card**: `POST /payments/hire-checkout-session` opens Stripe Checkout
  for the full budget. **The app does not do the hire.** Stripe's webhook
  credits the payment, holds it in escrow, and accepts the application, so
  after the browser closes the screen polls the proposal until it reads
  `accepted`. If the proposal was taken in the meantime, the payment stays in
  the wallet and the screen says so.

Client completion confirmation starts a **72-hour warranty hold**. Funds release
after expiry without an open timely complaint. Hired-job cancellations retain
funds during response/review; an approved refund returns to the **wallet**,
including card-paid jobs.

Providers who set up **Profile → Payouts** (Stripe Connect Express) have
card-paid jobs eligible for transfer to their Stripe account after warranty expiry. Everything
else stays in the TaskBuddy wallet and is withdrawn by request. The wallet ledger
is the only account of record. Full rules: `backend/BACKEND_SCHEMA.md` §18
and §29.

---

## Requires the current backend

The app now uses endpoints and columns added by backend migrations **0018,
0019, and 0020**: `POST /jobs` sends a `tasks` checklist, `POST /jobs/:id/accept`
answers a booking request, and `PATCH /jobs/:id/tasks/:taskId` ticks items off.
Migration 0020 is required by the admin API's server-side booking, activity,
and transaction search; mobile does not call those admin endpoints.

Migrations **0022–0024** add the backend leftovers above (account deletion,
withdrawal requests, `has_review`, email OTP, commission). Nothing in the app
calls them yet, so the app runs unchanged against an API without them — but the
API itself reads `reviews` on every job query and the commission rate on every
escrow release, so **apply them before deploying the current backend**. 0022 is
an enum change and must be applied on its own first.

Against an older deployed API, **posting a job fails with a 400** — the backend
runs `forbidNonWhitelisted`, so the unknown `tasks` field is a hard rejection,
not a silently dropped extra. Everything else degrades quietly (no checklists,
Accept returns 404). What has to be applied and deployed, and by whom, is in
[`docs/backend-handoff-booking-tasks-verification.md`](../docs/backend-handoff-booking-tasks-verification.md).

> **All three migrations are applied** to the Supabase project (0018 + 0019 on
> 2026-08-14, 0020 on 2026-08-17), and the API carrying this work is deployed.
> The verification queries in the handoff doc's §3 and §4 are repeatable if you
> want to confirm the state of a given project yourself.

### QA round 2 (2026-09) — needs migration 0034 + the current API deployed

`main` also depends on **migration `0034_qa_provider_admin.sql`** and the API
from commits `9897405`/`b10c149`: verification submit sends `document_type`,
Accept Booking sends a location, and `/skill-requests*` are new routes. As of
this writing, whether the live Render/Supabase deployment carries this work is
**unverified** — the deployed API refused connections from this session's
network. **Confirm `GET /health` on the deployed API before publishing an
`eas update` or a new build from `main`** — see `HANDOFF.md`'s "QA round 2
backend asks" section for the full list of what breaks on an older API.

What this round fixed, mobile-only (see `HANDOFF.md` for the backend asks it
also produced):
- The safe-area double-padding on every client tab screen, and missing insets
  on two auth screens.
- A bug where sending a proposal left "Submit Proposal" visible until the
  screen was revisited, so a second tap 400'd as a duplicate application.
- Keyboard dismissal on outside-tap for the Decline Booking, Withdraw (both
  roles), and Add Money modals, the sign-up code-entry step, and the chat
  empty state.
- Required-field asterisks on the sign-up form (Name, Email, Password,
  Confirm Password, and Skill Category for providers).
- The Accept Booking modal now starts with an empty address field instead of
  pre-filling the provider's home address.
- The provider's "Verify to Apply" banner now clears on app foreground, not
  only after an app restart or a revisit to Verification.
- Change Password no longer burns a token refresh re-checking a wrong current
  password.
- Confirm Completion (starts the warranty hold) and the destructive actions (Reject
  proposal, Discard draft, Cancel Job) now ask first / are styled red.
- Several small polish items: matching button sizing on the post-job success
  screen, a scrollable success screen so a long title/address can't hide the
  buttons, the correct "couldn't load" toast when the wallet fails to load,
  and no more empty-state flash on Home while jobs are still loading.

**Deferred, not attempted this round:**
- Dark mode was deferred in that historical pass; Phase 8 now implements it locally.
- Provider avatars on the client's Proposals list and provider profile (the
  API already returns `avatar_url`; only initials are rendered).

Four other items flagged here as deferred — the header top-inset refactor, tutorial replay,
declined-job visibility, and push-tap routing — were picked up in a follow-up pass; see
"Follow-up pass (2026-09-24)" below.

### Follow-up pass (2026-09-24) — declined-job visibility, tutorial replay, push-tap routing, header insets

Four mobile-only items identified as unblocked (no backend deploy, no product decision needed)
after QA round 2, all shipped on the same branch:

- **Declined-job visibility.** A provider declining/losing a booking left it invisible in every
  My Work tab (see QA round 2 above for why). Added a 4th "Cancelled" tab to
  `SPMyJobsScreen.tsx` (matches `status === 'cancelled' || 'expired'`, same convention the
  homeowner side already used) and a locked "Booking Cancelled" row on that job's
  `SPJobDetailScreen.tsx` instead of a blank action bar.
- **Tutorial replay.** Help & Support (both roles) now has a "View tutorial" row that re-opens
  the onboarding slides (`src/components/HelpSupportScreen.tsx`'s new `onViewTutorial` prop,
  wired to a new `'Tutorial'` screen key rendering `OnboardingScreen` bare, not wrapped in
  `ScreenFrame`, since it already pads its own safe areas).
- **Push-tap routing groundwork.** Tapping a push notification now resolves a target screen
  (`src/lib/notificationRouting.ts`'s `resolveNotificationTarget`, extracted from — and now shared
  by — both in-app notification screens' existing logic) and routes there once auth/onboarding
  gates clear, handling both a live tap and the cold-start case (`getLastNotificationResponse`).
  **This is dormant until push itself works** — see "Push delivery" below and `HANDOFF.md` §4
  (Firebase/FCM); **no backend work is needed for routing itself**, it activates automatically
  once a device obtains a push token.
- **Header inset refactor.** All 29 screens that used the fixed `Sizes.statusBarHeight` estimate
  now use a new `useHeaderTop()` hook (`src/hooks/useHeaderTop.ts`) — the real, rotation-reactive
  safe-area inset, same relationship `useAuthLayout.ts` already used for the auth screens.

**Still owed, mobile-only (not backend, not blocked on anything):**
- Real-device visual verification of the header refactor — 3-button nav, gesture nav, and at
  least one notched/cutout device profile. Not unit-testable (RNTL doesn't measure real layout
  against device insets).
- A dev-build manual check of the push-tap flow (schedule a local notification shaped like a real
  push payload, background/kill the app, tap it, confirm it lands on the right screen) — not
  RNTL-testable, and needs a development build rather than Expo Go per the existing push-code
  guard.

---

## Backend Handoff Docs

> **2026-10-02:** one sandbox Stripe webhook resend returned HTTP 200 after the
> signing-secret change (§7 below). The fork's `main` was pushed and Render
> restarted, but the deployed commit and fresh mobile payment flows still need
> direct verification.

> **Backend pass (2026-09-29, local only):** provider/category reads and job photo
> URLs are fixed; wrong current passwords return 400; browse accepts `urgency`;
> migration 0035 backfills historical active bookings. The feed must still send
> the selected urgency chip as a query parameter. Live/infra and product-decision
> items remain open. See the latest [`HANDOFF.md`](../HANDOFF.md) update.

The current release and operations checklist is [`HANDOFF.md`](../HANDOFF.md)
at the repo root. The older guides in [`docs/`](../docs/) explain the original
requests and contracts; use the dated checks here and in `HANDOFF.md` for their
current status. Stripe Identity configuration still needs a Render check, and
the recovered webhook delivery still needs fresh wallet, hire and Identity
end-to-end checks.

### 1. [`docs/backend-handoff-booking-tasks-verification.md`](../docs/backend-handoff-booking-tasks-verification.md)

**The priority one.** Covers what must happen before the mobile app works
correctly in production:

| Part | What | Needs | Status |
|------|------|-------|--------|
| **A** | Apply Supabase migrations 0018, 0019, 0020 | Supabase SQL Editor | ✅ Done — 0018 + 0019 2026-08-14, 0020 2026-08-17 |
| **B** | Deploy the API; configure web + Expo | API host, web host, Expo | ⚠️ API and hosted web done; **Expo push (FCM) outstanding** |

- **Migration 0018** adds the `'confirmed'` value to the `job_status` enum.
- **Migration 0019** creates the `job_tasks` checklist table with RLS, and adds
  four Row-Level Security policies on the `verification-docs` storage bucket.
- **Migration 0020** adds the admin search/pagination RPCs the deployed API calls
  for the admin console's Bookings, Transactions, and Activity pages. Mobile
  never calls them.

> **Part A and the API deploy have both landed.** Verified 2026-08-17:
> `POST /jobs/:id/accept`, `POST /devices`, and `GET /conversations/:id/stream`
> answer `401` rather than `404`, and all three `admin_list_*` functions are
> present in `information_schema.routines`. Posting a job works again.
>
> **Hosted web: done.** Verified 2026-09-18: a preflight from
> `https://taskbuddy-nine-zeta.vercel.app` gets `access-control-allow-origin` for
> that origin with credentials allowed.
>
> **Still outstanding:** Expo push, blocked on Firebase (FCM) credentials. The EAS
> `projectId` is in place; see above.
>
> 0018 and 0019 are idempotent and safe to re-run. **0020 is not** — it uses bare
> `create function`, so re-running it errors with `42723 function already exists`.
> Check state with the `information_schema.routines` query in the handoff doc §3
> instead.

### 2. [`docs/backend-handoff-mobile-todo-gaps.md`](../docs/backend-handoff-mobile-todo-gaps.md)

**Non-urgent — no mobile UI is deliberately faked.** Documents every remaining item from
the mobile to-do list that cannot be finished without an API change first:

**Items 1, 2, 3 and 5 have since been built** (migrations 0022–0024,
`backend/BACKEND_SCHEMA.md` §27). The homeowner app now uses items 1–3;
signup OTP (item 5) remains available for a future registration-confirmation flow.

| # | Item | Status |
|---|---|---|
| 1 | Account deletion (`DELETE /profiles/me`) | **Wired in the homeowner Settings screen** — soft delete, with every `409 { blockers[] }` reason shown before retry |
| 2 | Wallet withdrawal / payout rail | **Wired as a manual request flow** — `POST /wallet/withdrawals` creates a pending request; the homeowner can view/cancel it and an admin settles it by hand. The automated payout rail remains outstanding — see [§3 below](#3-docsbackend-handoff-stripe-connect-escrowmd) |
| 3 | `has_review` flag on job payload | **Wired** — completed jobs hide Leave Review when `has_review` is true; direct review access is also blocked |
| 4 | Realtime chat | Done — authenticated SSE streams messages through the API |
| 5 | Email OTP at registration | **API done** — `POST /auth/send-email-otp` / `verify-email-otp`, wrapping Supabase's own signup code. Needs the `{{ .Token }}` template change in [`docs/email-otp-setup.md`](../docs/email-otp-setup.md) |
| 6 | Homeowner card-at-hire (vs wallet top-up) | **Wired** — Accept offers Pay from wallet or Pay by card; the card path is hired by Stripe's webhook (`BACKEND_SCHEMA.md` §29.4) |
| 7 | Push delivery | Backend done (Expo tokens + API scheduler). **Blocked** on Firebase (FCM) credentials; the EAS `projectId` is set. See [Live chat and push notifications](#live-chat-and-push-notifications) |

### 3. [`docs/backend-handoff-stripe-connect-escrow.md`](../docs/backend-handoff-stripe-connect-escrow.md)

**Closed: Option A, built.** The escrow hold via Stripe Connect at booking:

- **Card-at-hire.** A homeowner can pay a hire by card. The webhook credits
  the payment, places the `held` escrow, and accepts the application
  (`BACKEND_SCHEMA.md` §29.4).
- **Provider payouts.** Providers onboard to Stripe Connect Express from
  Profile → Payouts. A card-paid job's payout is sent to their Stripe account
  after warranty expiry without an open complaint, as a transfer sourced from that job's own charge (§29.5).
- **The wallet ledger stays the account of record** throughout.

Wallet-funded payouts still withdraw through the manual queue, because Stripe
cannot move pesos that did not arrive as a single charge (the FX reason in
§29).

Rate limiting (§28.4) and the `EscrowService.release()` hardening (§28.2)
shipped earlier. Before going live, the test-mode check in
[`docs/stripe-setup.md`](../docs/stripe-setup.md) §7 needs running against
the real Stripe account.

### 4. [`docs/backend-handoff-recovery-vouchers.md`](../docs/backend-handoff-recovery-vouchers.md)

**Closed.** The dispute progress timeline and Wallet's Recovery Vouchers section were already
built on this side; the admin-only issuance endpoint they were waiting for now exists —
`POST /admin/wallet-transactions/recovery-credit` (`BACKEND_SCHEMA.md` §28.1).
`POST /wallet/transactions` still refuses a credit from every caller, admins included; that
refusal is the point, and the new route is the one deliberate, audited exception to it.

Nothing changes in the app: `HOWalletScreen` already filters the existing transaction list on
`kind === 'recovery_credit'`, so the section fills itself as soon as an admin issues one. The
credit is **fungible** — spendable on a hire or withdrawable like any other peso — so if that card
ever implies "booking use only", it will be wrong. What is left is the web console's Issue Credit
button (`web/README.md`).

### 5. [`docs/backend-handoff-mobile-e2e-test-environment.md`](../docs/backend-handoff-mobile-e2e-test-environment.md)

**Mostly resolved.** Test-environment items found by the Maestro sweep (`mobile/maestro/`) that
needed access this repo's code can't grant:

| # | Item | Status |
|---|---|---|
| 1 | Google Maps API key for `HOCreateJobScreen`'s `MapView` | **Obsolete.** `react-native-maps` was removed on 2026-09-18 and the Location step no longer needs a Maps key (`HANDOFF.md` §8) |
| 2 | Wallet balance seed SQL for the test client account | Needs Supabase SQL access whenever the maestro client runs low |
| 3 | `recommendation_deadline` SQL nudge (per test job) | Nothing blocked. The workaround is waiting 5–15 real minutes |
| — | Backend address geocoding (`GET /jobs/geocode`, Geoapify, `backend/BACKEND_SCHEMA.md` §31), tracked alongside | **Done.** `GEOAPIFY_API_KEY` is set on the deployed API; verified 2026-09-18 with a 200 for a Quezon City street address |

The Geoapify key stays on the backend. Never put it in the mobile bundle. That also rules out the
map preview's image URL, which the API renders and proxies instead (`GET /jobs/static-map`). The
mobile client stores the latitude/longitude the geocode route returns with the job, and refuses to
use the profile address or a Metro Manila fallback when the lookup fails.

### 6. [`docs/backend-handoff-stripe-identity-config.md`](../docs/backend-handoff-stripe-identity-config.md)

**Last observed failure (2026-09-29):** Get Verified step 3 returned `Invalid
Stripe API version: 2025-21-27`. Check the current Render value of
`STRIPE_MOBILE_API_VERSION` and retry before assuming the failure persists.

| # | Item | Needs | Status |
|---|---|---|---|
| 1 | Check `STRIPE_MOBILE_API_VERSION`; if it still has the invalid value, set it to `2025-01-27.acacia` or remove it | Render dashboard | **Current value unverified** |
| 2 | Confirm the version validation and 503 manual-review fallback on the deployed API | Render | **Deployed behavior unverified** |
| 3 | Confirm Stripe Identity is activated on the account | Stripe Dashboard | **Open** |

The same variable feeds card top-ups (`POST /payments/topup`), so test that
route after checking the current value. The app falls back to manual review
when the API answers 5xx.

### 7. [`docs/backend-handoff-stripe-webhook-secret.md`](../docs/backend-handoff-stripe-webhook-secret.md)

**Partial recovery (2026-10-02):** earlier `payment_intent.succeeded`
deliveries returned HTTP 400 because signature verification failed. After the
Render signing-secret change, one manual resend returned HTTP 200 with
`{ "received": true }`. That confirms receipt of that event, not a fresh
top-up's wallet credit or card-at-hire/Identity completion.

| # | Item | Needs | Status |
|---|---|---|---|
| 1 | Verify a fresh sandbox top-up produces a successful delivery and one wallet credit | Stripe Dashboard + mobile | **Pending** |
| 2 | Verify card-at-hire and Identity webhook outcomes on a development build | Stripe Dashboard + mobile | **Pending** |
| 3 | Review any remaining failed historical deliveries before resending them | Stripe Dashboard | **Pending** |

The mobile side is done. After Stripe returns, Add Money shows "Money added" or "Payment received" with a single
Done button, so it can no longer start a second charge. The wallet also supports pull-to-refresh.

---

## Remaining Backend Work

The migration and deployment handoff above is complete. Everything the mobile
acceptance audit raised has since been done (full reasoning in
`backend/BACKEND_SCHEMA.md` §28), and so have the decisions that were left
open: the Stripe Connect escrow, card-at-hire, and verification as a gate
(§29, §17). The migration list, including which ones must be applied before an
API deploy and which must run alone (0022, 0027), is kept in one place:
`backend/README.md`. It currently runs through **0038**.

**2026-10-02 follow-up:** `GET /auth/me` now reports `has_password` via
the service-role-only migration 0038 RPC. Both roles hide Change Password for
Google-only accounts. The homeowner job detail shows the provider's accept-time
address and distance from the job when that location is recorded. Migration
0038 is applied; verify the deployed response and Android rendering before
shipping the mobile change. Provider job-photo visibility remains a separate
product decision.

| Item | Outcome |
|---|---|
| Unit coverage for `ApplicationsService`, `ReviewsService`, `RecommendationsService`, `RecommendationsScheduler` | **Done** — all four have specs (§28.7) |
| Make application acceptance and escrow hold atomic | **Done** — the hold is placed *before* the accept, so an insufficient balance leaves the job open and every applicant still in the running; if the accept then fails the hold is rolled back and the client credited (§28.3) |
| Verify the job status vocabulary | **Verified, nothing to change** — the enum is the eight values this app uses, and the API uses exactly those. `PENDING` and `COMPLETED_PENDING_CONFIRMATION` have never been backend statuses (§28.8) |
| Verify review ownership, duplicate protection, cached rating recalculation, provider profile output, `provider_avg_rating` | **Verified**, with two additions: a completed job with nobody assigned is now an explicit 400 rather than a raw Postgres constraint message, and the provider is notified that their rating moved (§28.5, §28.8) |
| Recommendation and provider-feed tests | **Done** — ranking, ML-service failure, mismatched score arrays, empty pools, and feed radius boundaries / missing coordinates / urgency-then-distance ordering. Still provider-facing Haversine filtering, not a Google Maps service directory |
| End-to-end lifecycle test | **Done** — `src/jobs/job-lifecycle.spec.ts` runs post → apply → accept → hold → confirm → start → complete → payout → review against one shared in-memory store, plus cancellation, provider decline, dispute resolution, commission, and a budget-less job (§28.7) |

Three further backend changes landed alongside them, none of which need
anything from the app:

- **Rate limiting** (§28.4), **per endpoint per IP**: 240/minute on any one
  route, the credential endpoints 10/minute each, and the two payment-opening
  routes 5/minute. Well above ordinary app use — a screen loading jobs, wallet
  and an unread count on focus is nowhere near it, and `POST /auth/refresh` and
  `GET /auth/me` are deliberately left on the 240 so a busy session cannot sign
  itself out. What does change: a retry loop against `POST /auth/login` now
  earns a `429`, so treat that status as "slow down", not "credentials wrong" —
  `ApiError.status` already carries it through to the screen.
- **Escrow release raises instead of going quiet** (§28.2). No user-visible
  change: `POST /jobs/:id/complete` still blocks a second completion on job
  status first, with the same message.
- **`POST /admin/wallet-transactions/recovery-credit`** (§28.1) — admin-only.
  The Wallet screen's Recovery Vouchers section can now have something in it;
  it already renders `kind === 'recovery_credit'` rows and needs no change.

### Still open, and still not a missing endpoint

- ~~**Stripe Connect escrow**~~ **Done** (Option A): card-at-hire plus Connect
  payouts, `BACKEND_SCHEMA.md` §29.
- **A payout rail for wallet balances.** Card-paid jobs now reach a provider's
  Stripe account automatically. Money that sits in a wallet (wallet-funded
  payouts, refunds, credits) is still withdrawn by request and settled by hand.
  Automating that needs a PH-native disburser, or an FX decision Stripe cannot
  make for us (§29).
- ~~**Card-at-hire for homeowners** (handoff item 6).~~ **Done**: Pay by card at
  Accept, hired by the webhook (§29.4).
- ~~**`is_verified`: badge or gate?**~~ **Decided: a gate**, on applying *and*
  on being hired (`BACKEND_SCHEMA.md` §17). The API answers
  `403 { code: 'verification_required' }` to an unverified provider's proposal
  and `409 { code: 'provider_not_verified' }` to a client trying to hire one.
  The feed banner says verification is required. Proposals show a **Not
  verified** chip and disable Accept, and migration 0026 removed the RLS
  policy that let a provider set their own `is_verified`.

---

## Current State of the App

The mobile app currently implements the homeowner-posted job and
provider-application marketplace. It does not implement a separate customer
service catalogue or direct service-booking workflow. Therefore, the supplied
TC-SRV cases for Browse Services, Service Detail, keyword search, and
homeowner-facing recommendations do not map directly to the current product.

### ✅ Working frontend functionality

- Email/password registration, login, logout, Google Sign-In, session
  persistence, token refresh, and role-based navigation
- Five-step guided job creation: service/category, location, task checklist,
  urgency and schedule, then review/post
- Inline validation for required fields, budget, terms, and past scheduled
  dates/times before a job is submitted
- My Jobs list showing job name, location, status, urgency, price, elapsed time,
  and assigned provider, with lifecycle status filters
- Job Details with status progress, task checklist, provider information,
  offers, cancel confirmation, completion, review-state gating, provider-matching
  retry, and chat
- Provider job browsing, applications, confirmed bookings and Start Job, job
  start, and task updates
- Wallet balance, Stripe hosted Checkout top-ups, and manual withdrawal requests
- In-app notifications, profile editing, self-service account deletion, provider
  verification, disputes, image uploads, provider calendar, and authenticated SSE chat

### ⚠️ Partial or configuration-dependent

- Review submission is shown only for completed jobs with an assigned provider
  that has not already been reviewed. The backend remains the final authority,
  and the mobile flow still needs automated tests for these states.
- Homeowners can manually retry provider matching from an open job. Results are
  provider invitations; there is still no homeowner-facing service catalogue.
- Push notification code is present and the EAS project ID is set, but remote
  delivery needs Firebase (FCM) credentials and a rebuilt SDK 57 development
  build. Expo Go cannot receive remote pushes.
- Homeowner job locations require verified coordinates from the backend
  geocoding handoff above. There is no Expo GPS or Google Maps provider-
  discovery flow.
- The job-creation Location step no longer renders a native `react-native-maps`
  map (that dependency was removed 2026-09-18 — it crashed the app on a missing
  Google Maps Android SDK key; see `HANDOFF.md` §8). Since the backend already
  geocodes the address via Geoapify, the step shows a "Location confirmed" card,
  with a map preview rendered by the API (`GET /jobs/static-map`; the key stays
  server-side). The preview hides itself on any error, so it needs the API
  deploy that carries that route before it appears.
- Dark Mode now applies persisted shared palettes. Language, wallet transfer,
  and chat calls remain unwired.

### 🔧 Remaining frontend tasks

#### Job creation and jobs

- Add mobile tests for the five-step flow, category/task selection, required
  fields, budget, terms, photo upload, and past-date inline validation.
- Add My Jobs rendering/filter tests and verify reverse chronological ordering,
  empty states, refresh/retry, and long text on small screens.
- Add Job Details tests for cancel confirmation, cancellation errors, chat
  navigation, completion, provider/offer states, review gating, and provider-matching retry.
- Add homeowner Settings and Wallet tests for account-deletion blockers/sign-out,
  withdrawal validation, request submission, history, and cancellation.
- Verify the complete homeowner flow manually with TC-BOOK-001, 002, 005, and
  007, plus provider acceptance, decline, and completion cases TC-BOOK-003,
  004, and 006.

#### Reviews and recommendations

- Add mobile review-flow tests for successful submission, duplicate review,
  and attempting to review before completion (TC-REV-001, 002, and 003).
- Display and test review submission errors returned by the API, including
  retry and duplicate-tap behavior.
- Decide whether recommendations should remain provider invites/offers or
  become a homeowner-facing section. A homeowner Browse Services and
  recommended-services UI would require a corresponding backend service
  catalogue API and is not part of the current job-posting flow.

#### Reliability, permissions, and navigation

- Add visible error and retry handling for the Home API, application actions,
  notification mark-read actions, uploads, and network failures.
- Review loading, skeleton, empty, and error states for consistency across
  jobs, applications, notifications, wallet, calendar, chat, and reviews.
- Complete manual tests for gallery, camera, location, and notification
  permissions, including denied and permanently denied permissions.
- Verify iOS and Android date-picker behavior, back-stack restoration,
  logout reset, deep navigation, and offline/retry behavior.
- Verify shared themes on physical devices; add i18n before presenting a language picker.

### 🔧 Recent mobile updates

Detailed, dated history of what changed and why lives in
[`CHANGELOG.md`](./CHANGELOG.md). Short version: both roles' screens were
rebuilt against the design mockup (`taskbuddy_UI_update.html`, outside this
repo) rather than the app's earlier Figma-era layouts, navigation moved from
"jump to the active tab" to a real back-stack, and each role's Profile menu
was trimmed to remove rows that duplicated a bottom-nav tab or a header icon.

### ⚠️ What's Not Wired Yet

| Thing | Status |
|-------|--------|
| **Dark Mode** | Implemented locally: shared light/dark palettes, account/device persistence and explicit failed-save rollback. Physical rendering/native checks remain pending; see [theme verification](../test-docs/THEME_VERIFICATION.md). |
| **Language** | Settings modal states English is the only option — no i18n system exists to back a real picker |
| **Wallet Transfer** | Deliberately not built, backend or front. Wallet-to-wallet transfer turns the wallet into a money-transmission service, which is a licensing matter in PH, not an engineering one |
| **Push delivery** | Code complete end to end, **but not yet functional**: the EAS `projectId` is set, but Firebase (FCM) credentials aren't, so no push token is obtained on Android. Remote push also needs a development build (not Expo Go) on SDK 57. The `notifications` table remains the source of truth and the in-app list is unaffected — see [Live chat and push notifications](#live-chat-and-push-notifications). Tap-routing (which screen a tapped notification opens) is already wired and needs no further mobile work — see "Follow-up pass (2026-09-24)" above — it just has nothing to route yet until a token exists |
| **Realtime chat** | Message delivery is live through authenticated SSE; attachments are wired (photo picker, upload, rendering). The call button remains inert — no signalling path exists |
| **Counterpart avatars** | Chat, applicant, and review payloads all carry `avatar_url`; those screens still render initials. (The signed-in user's *own* avatar does render — see `OwnAvatar`) |
| **Provider calendar write** | Bookings are created by the backend when a job is assigned, not from this screen |

### Wired against migrations 0022–0024

Delete Account, Wallet Withdraw, and the "Leave Review" already-reviewed state
were wired against these migrations on both roles; the homeowner screens
(`HOSettingsScreen`, `HOWalletScreen`, `HOJobDetailScreen`) call the endpoints
inline, while the provider screens use the shared `DeleteAccountModal` and
`WithdrawModal` components (`mobile/src/components/`) for the same two flows.
One more piece was wired alongside them:

| Thing | Where | Note |
|---|---|---|
| **Email OTP at signup** | `RegisterScreen` + `AuthContext.verifyEmailOtp` | Registering already triggers Supabase's confirm-signup mail, so the screen reads the code rather than sending a second one; Resend is the only path that mails another. Verifying returns a session, so the user lands signed in |

> **Email OTP needs Supabase configured before it works at all.** Authentication →
> Providers → Email → **Confirm email** must be on, and the **Confirm signup**
> template must render `{{ .Token }}` — a template still sending
> `{{ .ConfirmationURL }}` mails a link, and every code typed into the app is
> rejected. Full steps in [`docs/email-otp-setup.md`](../docs/email-otp-setup.md).

---

## Notes

- `@supabase/supabase-js` is listed in `package.json` but **unused** — the app
  talks only to the NestJS API. Safe to remove when convenient.
- Push delivery is through Expo, not direct FCM/APNs. The API's scheduler reads
  pending notification rows and honours `push_enabled`; the in-app notification
  list remains the source of truth.
- `expo-crypto` remains in `package.json` but is no longer imported — nonce
  generation for Google auth moved to the backend. Safe to remove.

## October 4 implementation and verification

[The phased plan](../test-docs/IMPLEMENTATION_PLAN.md) replaces earlier lifecycle
and theme descriptions where they differ. Hiring confirms immediately, providers
start later, completion begins a three-day warranty, and both participants can
file complaints/cancellation statements and appeals within the server deadlines.

The app shares foreground notifications/unread state across both roles, routes
recipient-owned push taps, retains job-filter state, saves signed resolved
locations, displays approved services and private owned provider portfolios,
and provides three-consent signup, full scrollable policy text and full-screen
photo viewing. Shared palettes repaint auth/client/provider screens and dialogs;
calendar theme changes preserve the viewed month and chat changes preserve drafts.

Payout setup syncs authoritative Connect status on entry, browser return and
foreground. Wallet history exposes ledger IDs, settlement references and Stripe
transfer IDs. Pending requests are reserved funds, not delivered payments; failed
transfers remain in the wallet. The receiving-ledger demonstration is local only.

Run `npm run typecheck` and `npm test -- --runInBand` in this folder. There is no
configured mobile lint command. See the [verification matrix](../test-docs/VERIFICATION_MATRIX.md)
for outstanding deployed/device checks. Migrations 0039–0045 and matching API
release are required; no native dependency/plugin/permission was added by this work.

## October 4 release archive check

Before an EAS upload, inspect the archive with `eas build:inspect --platform
android --profile preview --stage archive --output <new-local-directory>`.
Local QA credentials must be absent. EAS did not honor the local Git exclude
file during verification; the root `.gitignore` now excludes both supplied
credential filenames. Keep dummy sessions and database backups outside the repo.

Card/top-up amounts start at ₱50, matching the backend product floor. The
verified sandbox account rejected ₱20 after settlement-currency conversion;
₱50 succeeded and its webhook credited the dummy wallet once. Wallet-funded
hiring remains available for smaller budgets. Payment copy describes the
three-day completion warranty and open-complaint hold.
