# TaskBuddy Mobile

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
| Runtime | **Expo SDK 54** / **React Native 0.81** / **React 19** |
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
npm start          # then press 'a' for Android / 'i' for iOS / scan QR for Expo Go
```

By default the app talks to the deployed backend at
`https://taskbuddy-1d48.onrender.com`, so it works with no local setup.

To run against a local backend, copy `.env.example` to `.env` and set your
machine's **LAN IP** — not `localhost`, which on a phone/emulator refers to the
device itself:

```env
EXPO_PUBLIC_API_URL=http://192.168.1.20:3000
```

Only `EXPO_PUBLIC_*` variables reach the app at build time. Restart the dev
server after changing `.env`.

> **Free-tier note:** the Render backend spins down after ~15 minutes idle, so
> the first request can take 30–60 s. If the splash screen seems stuck, that's
> a cold start, not a crash.

Other scripts:

```bash
npm run typecheck   # tsc --noEmit
npm run android     # expo start --android
npm run ios         # expo start --ios
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
(or the Create Job flow) resets the stack, same as tapping a tab in a native
app.

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
            Google →  302 to https://taskbuddy-1d48.onrender.com/auth/google/callback
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

> **⚠️ Push does not work yet, and won't until two things are set up.** The code
> is complete on both sides; the configuration isn't.
>
> 1. **An EAS project id.** `getExpoPushTokenAsync()` resolves one from
>    `options.projectId` → `Constants.easConfig` → `expoConfig.extra.eas.projectId`.
>    `app.json` currently has none, so the call throws
>    `ERR_NOTIFICATIONS_NO_EXPERIENCE_ID` and no token is ever obtained. Run
>    `eas init` and commit the resulting `expo.extra.eas.projectId`.
> 2. **A development build.** Remote push is not supported in **Expo Go** from
>    SDK 53 onward, and this app is on SDK 54. Testing needs `eas build --profile
>    development` (or a local dev client) on a physical device — a simulator
>    cannot receive pushes either.
>
> `eas.json` is committed with `development` / `preview` / `production` profiles,
> so both steps are: `npm i -g eas-cli` → `eas login` → `eas init` (writes the
> project id into `app.json` — commit it) → `eas build --profile development
> --platform android`. Only an Expo account holder can run these; the project id
> is minted server-side and cannot be filled in by hand.
>
> Until then `src/lib/pushNotifications.ts` returns `{ status: 'misconfigured' }`
> and `AuthContext` logs `[push] not registered (misconfigured) — …` in `__DEV__`.
> That warning is the intended signal, not a bug. A *denied* permission is
> logged as nothing, deliberately: the user chose it and it isn't a fault.

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
| `HOCreateJobScreen` | `GET /categories`, image upload, `POST /jobs` — the guided 5-step flow: service → location → tasks → urgency → review |
| `HOJobDetailScreen` | `GET /jobs/:id`, `GET /providers/:id`; complete / cancel (confirmed first) / chat; read-only task checklist |
| `HOChatScreen` | `POST /conversations` then message listing |
| `HOWalletScreen` | `GET /wallet`; **Add Money** posts `POST /payments/checkout-session` and opens Stripe Checkout in a browser |
| `HODisputeFilingScreen` | `POST /jobs/:jobId/disputes` |
| `HOProfile` | Displays profile data; menu is Edit Profile / Settings / Help & Support |
| `HOEditProfileScreen` | `PATCH /profiles/me`, then `refreshProfile()` |
| `HONotificationsScreen` | `GET /notifications`; mark read / read-all |
| `HOSettingsScreen` | `POST /auth/change-password` and all five switches (`GET`/`PATCH /settings`) are real. Dark Mode saves a preference nothing applies yet; Language and Delete Account stay honest placeholders — see [What's Not Wired Yet](#whats-not-wired-yet) |
| `HelpSupportScreen` (shared, `src/components/`) | Static FAQ + `mailto:` support link — no backend |

### Provider (Service Provider — `SP*`)

| Screen | Key API calls |
|--------|--------------|
| `SPHomeScreen` | `GET /jobs` (location-filtered feed + summary), `GET /jobs/assigned` (booking requests, with inline accept/decline); availability toggle |
| `SPMyJobsScreen` | `GET /jobs/assigned`, `GET /applications/mine` |
| `SPJobDetailScreen` | `GET /jobs/:id`; apply to an open job, or accept / decline / start and tick off the task checklist once it's theirs |
| `SPCalendarScreen` | `GET /calendar/bookings?from=&to=` for the current month |
| `SPChatScreen` | Messaging (same flow as HO) |
| `SPWalletScreen` | `GET /wallet` |
| `SPNotificationsScreen` | `GET /notifications` |
| `SPVerificationScreen` | 3-step flow — ID upload, face scan, then `POST /verifications/identity-session` (Stripe Identity, opened in a browser); falls back to `POST /verifications` for admin review if Stripe is unavailable |
| `SPProfileScreen` | Displays profile + provider-specific data + a real verified/unverified badge (`providerProfile.is_verified`); menu is Edit Profile / Get Verified / Settings / Help & Support |
| `SPEditProfileScreen` | `PATCH /profiles/me` + `PUT /profiles/me/provider` |
| `SPSettingsScreen` | Mirrors `HOSettingsScreen` — same real/placeholder split |

---

## Money, Briefly

Hiring holds the job budget in escrow so the client's wallet must cover it:
`POST /applications/:id/accept` returns `400 Insufficient wallet balance` otherwise.
That is what the Wallet screen's **Add Money** button is for.
Funds are released to the provider when the client marks the job complete, and
returned to the client if the job is cancelled or a dispute is resolved in the
client's favour.

There is no payment gateway — the wallet ledger is the only account of record.
Full rules: `backend/BACKEND_SCHEMA.md` §18.

---

## Requires the current backend

The app now uses endpoints and columns added by backend migrations **0018,
0019, and 0020**: `POST /jobs` sends a `tasks` checklist, `POST /jobs/:id/accept`
answers a booking request, and `PATCH /jobs/:id/tasks/:taskId` ticks items off.
Migration 0020 is required by the admin API's server-side booking, activity,
and transaction search; mobile does not call those admin endpoints.

Against an older deployed API, **posting a job fails with a 400** — the backend
runs `forbidNonWhitelisted`, so the unknown `tasks` field is a hard rejection,
not a silently dropped extra. Everything else degrades quietly (no checklists,
Accept returns 404). What has to be applied and deployed, and by whom, is in
[`docs/backend-handoff-booking-tasks-verification.md`](../docs/backend-handoff-booking-tasks-verification.md).

> **All three migrations are applied** to the Supabase project (0018 + 0019 on
> 2026-08-14, 0020 on 2026-08-17), and the API carrying this work is deployed.
> The verification queries in the handoff doc's §3 and §4 are repeatable if you
> want to confirm the state of a given project yourself.

---

## Backend Handoff Docs

Four handoff documents in [`docs/`](../docs/) are addressed to whoever holds
backend / Supabase / Render access. The first two are pure ops — applying and
deploying already-committed work, no new code. The last two ask for small,
specific pieces of new backend code (rate limiting, an admin-only credit
endpoint) plus one real architecture decision (Stripe Connect) — each is
scoped precisely so nothing has to be re-derived from the user stories.

### 1. [`docs/backend-handoff-booking-tasks-verification.md`](../docs/backend-handoff-booking-tasks-verification.md)

**The priority one.** Covers what must happen before the mobile app works
correctly in production:

| Part | What | Needs | Status |
|------|------|-------|--------|
| **A** | Apply Supabase migrations 0018, 0019, 0020 | Supabase SQL Editor | ✅ Done — 0018 + 0019 2026-08-14, 0020 2026-08-17 |
| **B** | Deploy the API; configure web + Expo | API host, web host, Expo | ⚠️ API deployed 2026-08-17; **hosted-web + Expo config outstanding** |

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
> **What is still outstanding:** the `NEXT_PUBLIC_API_URL` / `WEB_CORS_ORIGINS`
> pair *for an externally hosted* admin console (running it locally is already
> configured — `web/.env.local` points at the deployed API, and that origin is
> allowed by the deployed CORS preflight), and Expo push credentials, blocked
> first by the missing EAS `projectId` — see above.
>
> 0018 and 0019 are idempotent and safe to re-run. **0020 is not** — it uses bare
> `create function`, so re-running it errors with `42723 function already exists`.
> Check state with the `information_schema.routines` query in the handoff doc §3
> instead.

### 2. [`docs/backend-handoff-mobile-todo-gaps.md`](../docs/backend-handoff-mobile-todo-gaps.md)

**Non-urgent — no mobile UI is deliberately faked.** Documents every remaining item from
the mobile to-do list that cannot be finished without an API change first:

| # | Item | Blocking? |
|---|------|-----------|
| 1 | Account deletion (`DELETE /profiles/me`) | No — Settings row opens `mailto:` honestly |
| 2 | Wallet withdrawal / payout rail (Stripe Connect or equivalent) | No — buttons are inert |
| 3 | `has_review` flag on job payload | No — nice-to-have |
| 4 | Realtime chat | Done — authenticated SSE streams messages through the API |
| 5 | Email OTP at registration | No — Supabase confirmation already handles this |
| 6 | Homeowner card-at-hire (vs wallet top-up) | No — product decision |
| 7 | Push delivery | Backend done (Expo tokens + API scheduler). **Blocked on our side**: no EAS `projectId`, and Expo Go can't receive push on SDK 54 — see [Live chat and push notifications](#live-chat-and-push-notifications) |

### 3. [`docs/backend-handoff-stripe-connect-escrow.md`](../docs/backend-handoff-stripe-connect-escrow.md)

**Needs a real decision, not just code.** Covers the "escrow hold via Stripe Connect at booking"
story. Today's escrow is a ledger debit against a wallet the client pre-funded — there is no
Stripe Connect anywhere in the backend, no per-booking payment intent, and no rate limiting on any
payment endpoint. The doc lays out two viable architectures (A: keep the wallet ledger, add a real
per-booking hold + Connect transfer on release; B: full Connect destination charges) and asks for
a call before code gets written, since it changes real money-movement semantics. Rate limiting
(`@nestjs/throttler`, currently not even a dependency) and a small explicit-error hardening fix in
`EscrowService.release()` are both independent of that decision and can start immediately.

### 4. [`docs/backend-handoff-recovery-vouchers.md`](../docs/backend-handoff-recovery-vouchers.md)

**Non-urgent.** The dispute progress timeline and Wallet's Recovery Vouchers section are both
already built on this side (see below) — the one thing outstanding is a new admin-only endpoint to
actually issue a recovery credit, since `POST /wallet/transactions` deliberately refuses any
credit from any caller. `wallet_txn_kind` already has the `'recovery_credit'` value
(`0021_recovery_credit_kind.sql`, applied), so the endpoint has a slot ready to write into.

---

## Remaining Backend Work

The migration and deployment handoff above is complete. The remaining backend
work identified during the mobile acceptance audit is:

- Add unit coverage for `ApplicationsService`, `ReviewsService`,
  `RecommendationsService`, and `RecommendationsScheduler`.
- Make application acceptance and escrow hold atomic. An insufficient wallet
  balance must not leave the application accepted or the job assigned.
- Verify the job status vocabulary against the test plan. This app currently
  uses `open`, `recommending`, `assigned`, `confirmed`, `in_progress`,
  `completed`, `cancelled`, and `expired`; `PENDING` and
  `COMPLETED_PENDING_CONFIRMATION` are not current backend statuses.
- Verify review completion ownership, duplicate protection, cached provider
  rating/count recalculation, provider profile output, and the
  `provider_avg_rating` recommendation feature. Align error wording with the
  test plan if exact messages are contractual.
- Add recommendation and provider-feed tests for verified/available status,
  radius boundaries, missing coordinates, ranking, ML failures, and response
  time. The current proximity feed is provider-facing Haversine filtering; it
  is not a Google Maps-backed homeowner service directory.
- Add an end-to-end lifecycle test covering create, apply, accept, escrow,
  start, complete, payout, and review.

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
  offers, cancel confirmation, completion, review navigation, and chat
- Provider job browsing, applications, booking-request accept/decline, job
  start, and task updates
- Wallet balance and Stripe hosted Checkout top-ups
- In-app notifications, profile editing, provider verification, disputes,
  image uploads, provider calendar, and authenticated SSE chat

### ⚠️ Partial or configuration-dependent

- Review submission is shown only for completed jobs with an assigned provider,
  but duplicate-review and completion checks are ultimately enforced by the
  backend. The mobile flow still needs tests for these states.
- Recommendations are currently provider-facing notifications and offers;
  there is no homeowner-facing recommended-services section.
- Push notification code is present, but remote delivery requires an EAS
  project ID and an SDK 54 development build. Expo Go cannot receive remote
  pushes.
- Homeowner job locations use the saved profile address or fallback
  coordinates. There is no Expo GPS or Google Maps provider-discovery flow.
- Dark Mode persists a preference but does not change the palette. Language,
  account deletion, wallet withdrawal/transfer, chat calls, and chat
  attachments remain unwired.

### 🔧 Remaining frontend tasks

#### Job creation and jobs

- Add mobile tests for the five-step flow, category/task selection, required
  fields, budget, terms, photo upload, and past-date inline validation.
- Add My Jobs rendering/filter tests and verify reverse chronological ordering,
  empty states, refresh/retry, and long text on small screens.
- Add Job Details tests for cancel confirmation, cancellation errors, chat
  navigation, completion, provider/offer states, and review gating.
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
- Apply the persisted Dark Mode preference through shared theme tokens; add
  i18n before presenting a language picker.

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
| **Dark Mode** | Half done: the *preference* persists (`user_settings.dark_mode` via `PATCH /settings`), but nothing applies it — there is still no theme switching. Both Settings screens say so under the switch rather than implying a repaint that never comes. The blocker is the ~40 screens still using inline hex instead of `V6Colors` tokens; see [`CHANGELOG.md`](./CHANGELOG.md) for the theming approach that was built and then deliberately reverted to leave this open |
| **Language** | Settings modal states English is the only option — no i18n system exists to back a real picker |
| **Delete Account** | No self-serve deletion endpoint. The Settings row opens a `mailto:` to support instead of pretending to delete. What one would have to handle is written up in the [handoff doc](../docs/backend-handoff-mobile-todo-gaps.md) §1 |
| **Wallet Withdraw / Transfer** | Buttons are present but have no handler. `POST /wallet/transactions` is a bookkeeping primitive, not a withdrawal, and there is no payout rail at all — money can only enter via the Stripe webhook. See the [handoff doc](../docs/backend-handoff-mobile-todo-gaps.md) §2 |
| **Push delivery** | Code complete end to end, **but not yet functional**: `app.json` has no EAS `projectId`, so no push token is ever obtained, and remote push needs a development build (not Expo Go) on SDK 54. The `notifications` table remains the source of truth and the in-app list is unaffected — see [Live chat and push notifications](#live-chat-and-push-notifications) |
| **Realtime chat** | Message delivery is live through authenticated SSE; call and attachment buttons remain inert |
| **Counterpart avatars** | Chat, applicant, and review payloads all carry `avatar_url`; those screens still render initials. (The signed-in user's *own* avatar does render — see `OwnAvatar`) |
| **Provider calendar write** | Bookings are created by the backend when a job is assigned, not from this screen |
| **Notch/edge-to-edge status-bar spacing** | `Sizes.statusBarHeight` uses `StatusBar.currentHeight` (Android, built-in RN API) as a floor under the previous fixed `52`, which fixes most cases without a new dependency — but it's read once at module load, not on rotation/inset changes, and iOS still uses a fixed estimate. A full fix means adopting `react-native-safe-area-context` (new dependency) and touching header padding in every screen |

---

## Notes

- `@supabase/supabase-js` is listed in `package.json` but **unused** — the app
  talks only to the NestJS API. Safe to remove when convenient.
- Push delivery is through Expo, not direct FCM/APNs. The API's scheduler reads
  pending notification rows and honours `push_enabled`; the in-app notification
  list remains the source of truth.
- `expo-crypto` remains in `package.json` but is no longer imported — nonce
  generation for Google auth moved to the backend. Safe to remove.
