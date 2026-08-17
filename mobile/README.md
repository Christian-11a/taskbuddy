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
devices via Expo. Test this on a physical device with a deployed API and Expo
credentials. Permission denial or a push-registration failure does not block
sign-in, and notification rows remain available in the in-app list.

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

> **Note on migrations 0018 and 0019:** These may already have been applied to
> the Supabase project by the mobile developer via the SQL editor. Before running
> them, verify in the SQL Editor with the four queries in the handoff doc's
> "Verify Part A landed" section. If they already exist, skip straight to Part B
> (Render redeploy).

---

## Backend Handoff Docs

Two handoff documents in [`docs/`](../docs/) are addressed to whoever holds
backend / Supabase / Render access. They contain everything needed to bring the
deployed stack up to date with the current codebase — **no new code is needed**,
only applies and deploys of already-committed work.

### 1. [`docs/backend-handoff-booking-tasks-verification.md`](../docs/backend-handoff-booking-tasks-verification.md)

**The priority one.** Covers what must happen before the mobile app works
correctly in production:

| Part | What | Needs | Status |
|------|------|-------|--------|
| **A** | Apply Supabase migrations 0018 and 0019 | Supabase SQL Editor | ✅ Done 2026-08-14 |
| **B** | Redeploy the API on Render; confirm Stripe Identity is enabled | Render + Stripe Dashboard | ⬜ **Outstanding** |

- **Migration 0018** adds the `'confirmed'` value to the `job_status` enum.
- **Migration 0019** creates the `job_tasks` checklist table with RLS, and adds
  four Row-Level Security policies on the `verification-docs` storage bucket.
- **Render redeploy** is what actually unblocks `POST /jobs` — the API validates
  request bodies strictly and rejects the new `tasks` field until redeployed.

> **Part A is already done** — both migrations were applied and verified on
> 2026-08-14 (all four checks pass, including the Storage policies at 4/4).
> **Only the Render redeploy is outstanding**, and it is what unblocks posting
> a job. Both migrations are idempotent, so re-running them to confirm the
> state is harmless if you'd rather see it yourself.

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
| 7 | Push delivery | Implemented with Expo tokens and the API scheduler; requires external Expo/API configuration and device smoke testing |

---

## Current State of the App

### ✅ Fully working

- Email/password register, login, logout
- Google Sign-In (server-side OAuth — works in Expo Go and production builds)
- Session persistence across app restarts (AsyncStorage)
- Token refresh (silent retry on `401`)
- Role-based navigation (homeowner vs provider)
- Guided job creation (5 steps — service, location, task checklist, urgency, review)
- Job listing and filtering by status
- Job detail with complete / cancel actions and a task checklist
- Provider application to jobs
- Provider accept / decline of booking requests, and ticking off tasks while working
- Wallet balance display and Add Money via **Stripe hosted Checkout**, opened in
  a browser with `expo-web-browser` — works in Expo Go, no native module and no
  dev build required
- Notifications (listing + mark read)
- Profile view and edit (both roles)
- Provider verification submission
- Dispute filing
- Image upload (via Supabase Storage signed URLs)
- Provider calendar (read-only view of bookings)
- Chat (initial history plus authenticated SSE live messages)
- Expo push-token registration after sign-in, with API-side notification delivery

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
| **Push delivery** | Implemented through Expo after the app has notification permission and a registered device token. It still needs external API/Expo configuration and physical-device verification; the notification row remains the source of truth if delivery fails |
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

---

## Additional To-Do Items

### User Experience and Interface

- Apply appropriate animations throughout the app.
- Review all empty states and make their design and messaging consistent.
- Review all error modals and make their design, behaviour, and messaging
  consistent.
- Review the chat interface.
- Add a properly functioning animated splash screen.
- **Wire up Dark Mode.** The toggle UI already exists on both Settings
  screens; what's missing is the actual palette-switching. Before that can
  work, the inline hex colors scattered across most screens need replacing
  with `V6Colors` token references — see
  [What's Not Wired Yet](#whats-not-wired-yet) and `CHANGELOG.md` for the
  approach already prototyped once (built, then deliberately reverted to
  leave this as an open task).
- Replace inline screen-header filter options with a filter button that opens a
  modal containing the available filters.
- Add consistent skeleton loading states throughout the app.
- Add empty and skeleton loading states to the notification screens.

### Onboarding and Registration

- ~~Show onboarding screens after a newly registered user successfully logs in~~
  and ~~do not show them again after the user has completed them~~ — done: the
  slides moved from a pre-auth screen to a post-login gate, recorded per account
  in AsyncStorage (`taskbuddy.onboarded.<profile id>`).
- Add email verification during registration by sending an OTP to the email
  address supplied by the user.
- Identify the user's location during registration and display it on the
  corresponding role home screen after registration is complete.
- Create the automated email content, including OTP emails and related messages.

### Jobs and Location

- Enable geolocation to make location selection easier in the homeowner job
  creation flow.
- ~~When a homeowner accesses **Create New Job** from the **Book a Job** section
  of `HOHomeScreen`, skip the service step for the category they tapped~~ —
  done: the category id travels with the navigation and the flow opens on
  step 2, with step 1 still reachable via Back.
- ~~Add a loading state for each step of `HOCreateJobScreen`~~ — done for the
  steps that actually wait on something: skeleton service tiles on step 1, a
  busy photo-picker on step 3, and "Uploading photos…" vs "Posting…" on submit.
  Steps 2, 4 and 5 are pure local input and were deliberately left alone.
- ~~Verify whether urgency has multiple levels~~ — done: step 4 offers all
  three real `job_urgency` values and says what each one does to the
  recommendation deadline.
- ~~Make the Flexibility Pill Options and Budget Pill Options clickable~~ —
  they were removed instead. "Flexibility" and "Payment Type" were selectable
  but had no backend column to land in, so they changed nothing however they
  were set. Bring them back with a migration behind them, or not at all.

### Notifications, Permissions, and Payments

- Ensure notifications are delivered and that their messages appear correctly.
- Implement and clearly request the required app permissions, including access
  to the gallery/files, location, camera, and notification delivery.
- Integrate Stripe for both user roles. The provider side is done — Stripe
  Identity is step 3 of `SPVerificationScreen` — and wallet top-ups run through
  hosted Checkout; what is left is anything a homeowner would pay with directly
  rather than through the wallet.
