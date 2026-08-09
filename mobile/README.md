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
| UI extras | **react-native-calendars**, **expo-image-picker** |
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
    ├── lib/format.ts           # peso(), shortDate(), timeAgo(), jobStatusMeta()…
    ├── context/AuthContext.tsx # Session, profile, role, signInWithGoogle
    ├── hooks/useAsyncData.ts   # { data, loading, error, reload }
    ├── components/             # AppHeader, bottom nav bars, modals, skeletons
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
not authenticated    → Onboarding → Login / Register
role 'homeowner'     → HO tab bar (Home, My Jobs, Create, Wallet, Profile)
role 'provider'      → SP tab bar (Home, My Jobs, Calendar, Wallet, Profile)
```

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

---

## Screens

### Auth flow

| Screen | Purpose |
|--------|---------|
| `OnboardingScreen` | Welcome carousel, routes to Login or Register |
| `LoginScreen` | Email/password + **Continue with Google** |
| `RegisterScreen` | Role selection (Homeowner / Provider), email/password + Google |
| `ForgotPasswordScreen` | UI only — no reset endpoint yet |
| `TermsAndConditions` | Static T&C display |

### Client (Homeowner — `HO*`)

| Screen | Key API calls |
|--------|--------------|
| `HOHomeScreen` | `GET /wallet`, `GET /jobs/mine`, `GET /categories`, unread notification count |
| `HOMyJobs` | `GET /jobs/mine`, filtered client-side by status |
| `HOCreateJobScreen` | `GET /categories`, image upload, `POST /jobs` — 5-step wizard |
| `HOJobDetailScreen` | `GET /jobs/:id`, `GET /providers/:id`; complete / cancel actions |
| `HOChatScreen` | `POST /conversations` then message listing |
| `HOWalletScreen` | `GET /wallet`; **Add Money** posts `POST /payments/checkout-session` and opens Stripe Checkout in a browser |
| `HODisputeFilingScreen` | `POST /jobs/:jobId/disputes` |
| `HOProfile` | Displays profile data |
| `HOEditProfileScreen` | `PATCH /profiles/me`, then `refreshProfile()` |
| `HONotificationsScreen` | `GET /notifications`; mark read / read-all |
| `HOSettingsScreen` | Local-only toggles (nothing persisted) |

### Provider (Service Provider — `SP*`)

| Screen | Key API calls |
|--------|--------------|
| `SPHomeScreen` | `GET /wallet`, `GET /jobs`, `GET /jobs/assigned`; availability toggle |
| `SPMyJobsScreen` | `GET /jobs/assigned` |
| `SPJobDetailScreen` | `GET /jobs/:id`; apply, or start/complete if assigned |
| `SPCalendarScreen` | `GET /calendar/bookings?from=&to=` for the current month |
| `SPChatScreen` | Messaging (same flow as HO) |
| `SPWalletScreen` | `GET /wallet` |
| `SPNotificationsScreen` | `GET /notifications` |
| `SPVerificationScreen` | ID + selfie upload, `POST /verifications`, shows review status |
| `SPProfileScreen` | Displays profile + provider-specific data |
| `SPEditProfileScreen` | `PATCH /profiles/me` + `PUT /profiles/me/provider` |

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

## Current State of the App

### ✅ Fully working

- Email/password register, login, logout
- Google Sign-In (server-side OAuth — works in Expo Go and production builds)
- Session persistence across app restarts (AsyncStorage)
- Token refresh (silent retry on `401`)
- Role-based navigation (homeowner vs provider)
- Job creation wizard (5 steps — category, details, schedule, budget, photos)
- Job listing and filtering by status
- Job detail with complete / cancel actions
- Provider application to jobs
- Wallet balance display and Add Money via **Stripe hosted Checkout**, opened in
  a browser with `expo-web-browser` — works in Expo Go, no native module and no
  dev build required
- Notifications (listing + mark read)
- Profile view and edit (both roles)
- Provider verification submission
- Dispute filing
- Image upload (via Supabase Storage signed URLs)
- Provider calendar (read-only view of bookings)
- Chat (polling on mount — no realtime)

### 🔧 Recent mobile updates

- Wired **Add Money** to Stripe hosted Checkout: `POST /payments/checkout-session`
  then `WebBrowser.openAuthSessionAsync`, returning through the app's deep link.
  This replaces the direct `POST /wallet/transactions` credit, which the backend
  now refuses — that call minted wallet balance with no payment behind it, and
  wallet balance pays for real work through escrow.
  The wallet is credited by Stripe's webhook, so the screen polls `GET /wallet`
  briefly after the browser closes rather than assuming the balance moved.
- Removed unsupported `@stripe/stripe-react-native` from the Expo app so the wallet screen compiles and Expo Go can start normally. Checkout needs no native module; PaymentSheet stays available on the backend for when the team moves to an EAS dev build.
- Fixed `HOLeaveReviewScreen.tsx` back button rendering so the back action only appears when provided.
- Added a date calendar and selected-date filtering to `HOMyJobs`.
- Added explicit job actions in `HOJobDetailScreen` for viewing applications and leaving a review.
- Added new `HOJobApplicationsScreen`, `HOLeaveReviewScreen`, and `HOProviderProfileScreen` screen files in the homeowner section.
- Added new navigation entries for the homeowner job applications, review, and provider profile flows.

### ⚠️ What's Not Wired Yet

| Thing | Status |
|-------|--------|
| **Applicant list for clients** | No screen to view / accept provider applications — the biggest functional gap; `POST /applications/:id/accept` and the full escrow flow can't be triggered from the app |
| **Review submission** | `api.reviewJob` exists; nothing calls it — ratings are displayed only |
| **Wallet Withdraw / Transfer** | Buttons are present but have no handler |
| **Forgot password** | UI only — no backend reset endpoint |
| **Realtime chat** | Messages only refresh on mount; call and attachment buttons are inert |
| **Avatar / photo upload** | "Change Photo" does nothing; `avatar_url` is never sent |
| **Settings persistence** | Toggles are local `useState`; nothing is saved |
| **Provider calendar write** | Bookings are created by the backend when a job is assigned, not from this screen |

---

## Notes

- `@supabase/supabase-js` is listed in `package.json` but **unused** — the app
  talks only to the NestJS API. Safe to remove when convenient.
- The backend has no push-notification transport. The `notifications` table is
  the source of truth and the app polls it; nothing is delivered via FCM/APNs.
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
- Create a dark-mode color palette.
- Replace inline screen-header filter options with a filter button that opens a
  modal containing the available filters.
- Add consistent skeleton loading states throughout the app.
- Add empty and skeleton loading states to the notification screens.

### Onboarding and Registration

- Show onboarding screens after a newly registered user successfully logs in.
- Do not show onboarding screens again after the user has completed them.
- Add email verification during registration by sending an OTP to the email
  address supplied by the user.
- Identify the user's location during registration and display it on the
  corresponding role home screen after registration is complete.
- Create the automated email content, including OTP emails and related messages.

### Jobs and Location

- Enable geolocation to make location selection easier in the homeowner job
  creation flow.
- When a homeowner accesses **Create New Job** from the **Book a Job** section
  of `HOHomeScreen`, open `HOCreateJobScreen` directly at step 2 rather than
  asking for the service type again in step 1.
- Verify whether urgency has multiple levels and implement the appropriate
  options if needed.
- Add a loading state for each step of `HOCreateJobScreen`.
- Make the Flexibility Pill Options and Budget Pill Options clickable.

### Notifications, Permissions, and Payments

- Ensure notifications are delivered and that their messages appear correctly.
- Implement and clearly request the required app permissions, including access
  to the gallery/files, location, camera, and notification delivery.
- Integrate Stripe for both user roles, including Stripe Identity Verification
  (IDV) for service-provider verification.
