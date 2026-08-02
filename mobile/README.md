# TaskBuddy Mobile

The Expo / React Native app for **TaskBuddy**, a Philippine home-services
marketplace. This is the marketplace itself — clients post jobs, providers apply
and complete them. (The `web/` app is an admin console only; it has no client or
provider surface.)

Everything on screen reads from the real NestJS API — there is no mock data
layer. See [What's not wired yet](#whats-not-wired-yet) for the honest list of
buttons that still do nothing.

## Tech Stack

- **Expo** SDK 54 / **React Native** 0.81 / **React** 19
- **TypeScript**
- **lucide-react-native** icons, **react-native-calendars**, **expo-image-picker**
- **AsyncStorage** for session persistence
- No navigation library — see [Navigation](#navigation-there-is-no-router)

## Getting Started

```bash
npm install
npm start          # then press a / i / w, or scan the QR code
```

By default the app talks to the deployed backend at
`https://taskbuddy-1d48.onrender.com`, so it works with no setup.

To run against a backend on your own machine, copy `.env.example` to `.env` and
point it at your computer's **LAN IP** — not `localhost`, which on a phone or
emulator means the device itself:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.20:3000
```

Only `EXPO_PUBLIC_*` variables reach the app at build time. Restart the dev
server after changing `.env`.

> **Free-tier note:** the Render backend spins down after ~15 minutes idle, so
> the first request can take 30–60 s. If the splash screen seems stuck, it's a
> cold start, not a crash.

Other scripts:

```bash
npm run typecheck   # tsc --noEmit
npm run android     # / npm run ios / npm run web
```

## Project Structure

```
mobile/
├── App.tsx                     # Root: session gate + all navigation state
├── index.ts                    # Expo entry point
├── app/
│   ├── layout.tsx              # 600px max-width centred frame
│   ├── SplashScreen.tsx
│   ├── (auth)/screens/         # Onboarding, Login, Register, Forgot password, T&C
│   ├── (homeowner)/screens/    # Client-side screens (HO*)
│   └── (provider)/screens/     # Provider-side screens (SP*)
└── src/
    ├── lib/api.ts              # THE API CLIENT — every network call lives here
    ├── lib/format.ts           # peso(), shortDate(), timeAgo(), jobStatusMeta()…
    ├── context/AuthContext.tsx # Session, profile, role
    ├── hooks/useAsyncData.ts   # { data, loading, error, reload }
    ├── components/             # AppHeader, bottom nav bars, modals, skeletons
    ├── constants/theme.ts      # Colors, Radii, Shadows, Sizes, Spacing
    └── types/navigation.ts     # Screen key unions
```

> The `app/(auth)`, `app/(homeowner)`, `app/(provider)` folders look like
> Expo Router groups but **aren't** — expo-router isn't a dependency. The
> parenthesised names are a naming convention only.

## Navigation: there is no router

All navigation is `useState` in `App.tsx`. It tracks the current tab and screen
per role, plus a selected `jobId` threaded through
`hoNavigate(screen, jobId?)` / `spNavigate(screen, jobId?)`.

`App.tsx` picks what to render from `AuthContext`:

```
initializing → SplashScreen
not authenticated → Onboarding / Login / Register
authenticated + role 'homeowner' → HO tabs
authenticated + role 'provider'  → SP tabs
```

Adding a screen means three edits: add the key to `src/types/navigation.ts`,
render it in `App.tsx`, and navigate to it via `onNavigate`.

## Talking to the backend

**Every network call goes through `src/lib/api.ts`.** Nothing else calls `fetch`.
Changing the base URL, auth scheme, or field casing is a one-file change.

- **Casing is snake_case in both directions** — request bodies and responses
  mirror the Postgres columns. Don't camelCase a request body.
- **The backend validates with `forbidNonWhitelisted`**, so sending a field it
  doesn't declare is a hard `400`, not a silently ignored extra.
- **Roles differ from the UI vocabulary.** The wire uses `client`; the UI says
  `homeowner`. `toBackendRole` / `toMobileRole` in `api.ts` translate.
- `authRequest()` attaches the bearer token and, on a `401`, refreshes once and
  retries. `ApiError` carries `status` and the backend's message (unwrapping
  class-validator's `message[]` array), so screens can show it directly.

### Auth flow

`src/context/AuthContext.tsx` owns the session and registers the token accessor
with `api.ts` via `configureApiAuth`.

1. `POST /auth/login` → `GET /auth/me` for the profile + provider profile.
2. The session is persisted to AsyncStorage under `taskbuddy.session`.
3. On boot the stored session is restored and validated with `/auth/me`;
   a `401` triggers `POST /auth/refresh` and one retry.
4. `signOut()` clears local state first, then fires `POST /auth/logout`.

Registration returns `session: null` when the Supabase project has email
confirmation enabled — the Register screen then shows a "check your email"
state instead of signing in.

### Uploads

Images never pass through the API. `api.uploadImage(bucket, uri)` asks the
backend for a signed Storage URL (`POST /uploads/signed-url`), `PUT`s the file
straight to Supabase Storage, and returns the storage **path**. That path — not
a device URI — is what job creation and verification submit.

## Screens

### Client (homeowner)

| Screen | What it needs |
|---|---|
| Home | `/wallet`, `/jobs/mine`, `/categories`, unread notifications |
| My Jobs | `/jobs/mine`, filtered client-side |
| Create Job | `/categories`, image upload, `POST /jobs` — 5-step wizard collecting category, details, schedule, budget, photos |
| Job Detail | `/jobs/:id`, `/providers/:id`; complete / cancel |
| Chat | `POST /conversations` then messages |
| Wallet | `/wallet`; **Add Money** posts a credit to `/wallet/transactions` |
| Dispute Filing | `POST /jobs/:jobId/disputes` |
| Profile / Edit Profile | `PATCH /profiles/me`, then `refreshProfile()` |
| Notifications | `/notifications`, mark read / read-all |
| Settings | nothing — local toggles only |

### Provider

| Screen | What it needs |
|---|---|
| Dashboard | `/wallet`, `/jobs`, `/jobs/assigned`, availability toggle |
| My Jobs | `/jobs/assigned` |
| Job Detail | `/jobs/:id`; apply, or start work if assigned |
| Calendar | `/calendar/bookings?from=&to=` for the current month |
| Chat / Wallet / Notifications | as above |
| Get Verified | uploads ID + selfie, `POST /verifications`, shows review status |
| Profile / Edit Profile | `PATCH /profiles/me` then `PUT /profiles/me/provider` |

## Money, briefly

Hiring holds the job budget in escrow, so a client's wallet must cover it:
`POST /applications/:id/accept` returns **400 `Insufficient wallet balance`**
otherwise. That's what the Wallet screen's **Add Money** button is for. Funds are
released to the provider when the client marks the job complete, and returned to
the client if the job is cancelled or a dispute is refunded.

There is no payment gateway — the wallet ledger is the only account of record.
Full rules: `backend/BACKEND_SCHEMA.md` §18.

## What's not wired yet

Honest list of things that look interactive but aren't:

- **No applicant list.** Providers can apply, but there is no client-side screen
  to view or accept applications, so `POST /applications/:id/accept` — and
  therefore the whole escrow flow — can't be triggered from the app yet. This is
  the biggest gap.
- **No review submission.** `api.reviewJob` exists; nothing calls it. Ratings are
  only ever displayed.
- **Wallet Withdraw / Transfer** buttons have no handler (only Add Money does).
- **Forgot password** is UI only — there's no reset endpoint.
- **"Continue with Google"** isn't OAuth; Register's button runs the normal
  email/password path.
- **Chat** has no realtime or polling — messages refresh on mount. The call and
  attachment buttons are inert.
- **Avatar upload** — "Change Photo" does nothing; `avatar_url` is never sent.
- **Settings** toggles are local `useState`; nothing persists.
- **Provider calendar is read-only** — bookings are created by the backend when a
  job with a preferred date is assigned, not from this screen.

## Notes

- `@supabase/supabase-js` is still in `package.json` but **unused** — the app
  talks only to the NestJS API. Safe to remove.
- The backend has no push-notification transport. The `notifications` table is
  the source of truth and the app polls it; nothing is delivered via FCM/APNs.
