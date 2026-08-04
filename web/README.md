# TaskBuddy Admin Console

The admin dashboard for the TaskBuddy platform (`web/` in the repo). Next.js 16 App Router, TypeScript, Tailwind CSS v4, Lucide React, and Recharts. **Every page now runs against the live backend** — Verifications and Transactions were the last mock holdouts, and backend migrations 0008 (provider verifications) and 0009 (escrow + disputes) gave them real tables. The in-memory mock DB has been deleted.

## Live Deployment

- **URL**: https://taskbuddy-nine-zeta.vercel.app
- **Backend**: https://taskbuddy-1d48.onrender.com (Render, free plan)
- **Database/Auth**: Supabase project `TaskBuddy` (`axtizgnurqnjzfjrngvd`)
- **Env vars set on Vercel**: `NEXT_PUBLIC_API_URL=https://taskbuddy-1d48.onrender.com` (the old `NEXT_PUBLIC_USE_MOCK` is no longer read and can be removed)
- **Admin login**: `admin@taskbuddy.com` (real Supabase account, Email auth provider — ask Eduard or Christian for the password)

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4 + CSS variables (dark & light themes)
- **Icons**: Lucide React
- **Charts**: Recharts
- **Runtime**: React 19
- **Tests**: Vitest (adapter + validation unit tests)

## Features

- 🔐 Login / Auth Screen (real Supabase Email auth — see [Live Deployment](#live-deployment) for the admin login)
- 📊 Dashboard Overview — live stats, revenue chart, category breakdown, activity feed
- 🛡️ Provider Verification Queue — approve/reject, bulk actions, ID/selfie image preview
- 👥 User Management — searchable table, row drill-down, bulk suspend/reinstate
- 💳 Transaction Monitoring — escrow log with per-row detail (In Escrow / Completed / Disputed / Refunded)
- ⚠️ Disputes — review and resolve, releasing escrow to the provider or refunding the client
- 📅 Booking Tracker — search, filter, cancel, row drill-down
- 🕓 Activity Log — booking status transitions with search, type filter, sort
- 📈 Reports & Analytics — area chart, pie chart, bar chart, top providers
- 📤 CSV export on Users, Transactions, Bookings, Activity Log, and Reports
- ⚙️ Settings — account, notifications, platform, appearance
- 🌙 Dark & light themes (persisted), collapsible sidebar, SPA navigation

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). By default this points at
`http://localhost:3001` for the API. Note the backend listens on **3000** unless
told otherwise, and Next.js has already taken that port — so run the backend as
`PORT=3001 npm run start:dev`, or point the web app at wherever it actually is.

To hit the live Render backend instead, create `.env.local`:

```bash
NEXT_PUBLIC_API_URL=https://taskbuddy-1d48.onrender.com
```

Other scripts:

```bash
npm run build   # production build
npm start       # serve the production build
npm run lint    # eslint
npm test        # vitest unit tests
```

## Project Structure

```
src/
├── app/
│   ├── globals.css              # Theme CSS variables (dark defaults, light overrides), badges, table styles
│   ├── layout.tsx               # Root layout + metadata
│   └── page.tsx                 # Entry point (AppProvider + AppShell)
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx         # Login gate + sidebar/header/page routing
│   │   ├── Sidebar.tsx          # Collapsible navigation sidebar
│   │   └── Header.tsx           # Top bar + notifications dropdown
│   └── pages/                   # One component per admin page (9 pages + login)
├── context/
│   └── AppContext.tsx           # App state: session, data, mutations, persisted preferences
└── lib/
    ├── domain.ts                # Backend-shaped domain types (shared platform contracts + admin types)
    ├── services/                # THE DATA SEAM — pages/context only ever call these
    ├── adapters/                # Domain → display-row mapping, formatting (+ unit tests)
    ├── export/csv.ts            # Client-side CSV generation + download (+ unit tests)
    └── api/
        ├── client.ts            # Fetch client for the real backend (+ token refresh)
        ├── session.ts           # localStorage session (access + refresh token)
        └── types.ts             # Exact wire shapes the backend returns
```

## Data Flow (the seam)

```
pages/context → services (async fns) → api/client.ts → backend
```

- **Pages and `AppContext` never touch data sources directly** — they call `lib/services` functions and render the display rows produced by `lib/adapters`.
- The seam is still worth keeping: it's where snake_case wire rows become camelCase domain objects, and where backend enums are mapped to display labels (e.g. escrow `held` → `IN_ESCROW`).
- `/admin/analytics/summary` backs five different dashboard values. Overlapping callers share one in-flight request (`getAnalyticsSummary`), so a page load makes one call instead of five — this matters on Render's free tier, which cold-starts for 30–60s.
- An expired access token is refreshed once via `POST /auth/refresh` and the request retried, instead of dumping the admin back to the login screen.

## Real Backend Integration

Every page calls the live backend (`https://taskbuddy-1d48.onrender.com` by
default — override with `NEXT_PUBLIC_API_URL`). There is no mock data path
left: `src/lib/mock/` has been deleted along with the artificial-latency
`simulate()` helper.

To run against a different backend URL (e.g. a local `backend/` instance):

```bash
NEXT_PUBLIC_API_URL=http://localhost:3000
```

> The old `NEXT_PUBLIC_USE_MOCK` flag is gone. It was already dead — nothing
> read it — and there is no mock source left for it to select.

Domain types in `lib/domain.ts` mirror the backend's real enums (`user_role`,
`job_status` — see `backend/BACKEND_SCHEMA.md` §4).

### Where each page's data comes from

| Page | Endpoint(s) |
|---|---|
| Login | `POST /auth/login` (now returns `full_name`, so the header shows a name, not an email) |
| Dashboard | `GET /admin/analytics/summary`, `GET /admin/activity` |
| Verifications | `GET /admin/verifications`, `POST /admin/verifications/:id/approve` · `/reject` |
| Users | `GET /admin/users`, `POST /admin/users/:id/suspend` · `/reinstate` |
| Transactions | `GET /admin/transactions` (escrow records — backend migration 0009) |
| Disputes | `GET /admin/disputes`, `POST /admin/disputes/:id/resolve` |
| Bookings | `GET /admin/bookings`, `POST /admin/bookings/:id/cancel` |
| Activity Log | `GET /admin/activity` (same source as the dashboard feed) |
| Reports | `GET /admin/analytics/summary` |
| Settings | `PATCH /profiles/me` (display name), `POST /auth/change-password`. Email is read-only and the remaining toggles are local-only — see [What's Still Needed](#whats-still-needed-from-the-backend) |

Bulk actions call the existing single-item endpoints once per selected id in
parallel; a per-id failure is swallowed so one refusal (e.g. suspending an
admin) can't abort the rest, and the list is refetched afterwards so the table
shows exactly what actually changed.

CSV export is entirely client-side — every table is already fully loaded in the
browser, so exporting needs no endpoint. Exports respect the current search and
filter, and are written UTF-8 with a BOM so Excel doesn't mangle the peso sign.

### Two mappings worth knowing

- **Verification status.** The backend uses lowercase (`pending`/`approved`/`rejected`)
  to match `job_status` and `user_role`; the services layer uppercases it for display.
- **Transaction status.** The Transactions page predates escrow, so its labels are
  mapped from `escrow_status`: `held`→`IN_ESCROW`, `released`→`COMPLETED`,
  `disputed`→`DISPUTED`, `refunded`→`REFUNDED`. A `cancelled` hold also reads as
  `REFUNDED` — there is no separate UI state for it.

### Bookings amount

The Bookings `amount` column shows the real `jobs.budget` (backend migration
0007), replacing the old fixed ₱0 placeholder. Jobs posted before pricing
existed have no budget and still show ₱0.

### Notification bell

The bell in the header (`Header.tsx`) derives from the Verifications and
Transactions lists — pending verifications and disputed transactions. Now that
both lists are real, so is the bell; it never needed a backend of its own.

## What's Still Needed From the Backend

Everything currently on this console runs on real data. The items below are
features we deliberately **did not** build in `web/` because they need backend
work first — building the UI now would mean shipping buttons that call
endpoints that don't exist. They're written as API requests so they can be
implemented directly from this list.

Ordered by how much they'd improve the console per unit of work.

### 1. Timed suspensions (with a reason)

Today `POST /admin/users/:id/suspend` is permanent-until-manually-reversed, and
records no reason. A suspension nobody can explain six months later isn't much
use, and "suspend forever or not at all" is a blunt instrument for moderation.

- `profiles` needs `suspended_until timestamptz null` and `suspension_reason text null`
- `POST /admin/users/:id/suspend` accepts `{ duration_days?: number, reason: string }`
  — omit `duration_days` for an indefinite suspension
- Expiry can be checked at login (`deactivated_at is not null and (suspended_until is null or suspended_until > now())`)
  rather than needing a cron job
- Return `suspended_until` and `suspension_reason` on `admin_user_overview` so
  the Users table can show "Suspended until Aug 12" instead of just "Suspended"

### 2. Admin-triggered password reset

There's no way for an admin to help a user who's locked out. Supabase Auth
already provides the mechanism (`resetPasswordForEmail`); this is a thin
wrapper, not a new subsystem.

- `POST /admin/users/:id/send-password-reset` → `{ sent: true }`
- Should refuse for `role = 'admin'` targets, matching how `suspend` already does

### 3. Booking detail endpoint

The Bookings table can expand a row, but only shows what the list already
returns. The job's description, address, `scheduled_at`, and `photo_urls` are
all on the `jobs` row and never reach the console.

- `GET /admin/bookings/:id` → the full job, plus client/provider/category joins
  and the escrow record if one exists

### 4. Activity Log pagination and date filtering

`GET /admin/activity` is hardcoded to the newest 20 rows with no query params,
so the Activity Log page can only ever show those 20. This is a change to an
existing endpoint, not a new feature.

- `GET /admin/activity?limit=&offset=&from=&to=` → `{ items, total }`
  (note: it currently returns a **bare array**, so this is a breaking shape
  change — worth doing now while the only consumer is this console)

### 5. Real admin audit log

The Activity Log page shows *booking* status transitions, sourced from
`job_status_history`. There is no record anywhere of **admin** actions — who
approved a verification, who suspended an account, who resolved a dispute and
which way. That's the one gap most likely to be asked about in review.

- A table along the lines of `admin_actions (id, actor_id, action, target_type,
  target_id, metadata jsonb, created_at)`
- Written from `admin.service.ts` (suspend/reinstate/cancel),
  `verifications.service.ts` (approve/reject), `disputes.service.ts` (resolve)
- `GET /admin/audit?action=&actor_id=&from=&to=&limit=&offset=`

### 6. Admin read-only access to a job's chat

When resolving a dispute, the client and provider's conversation is the primary
evidence and there's no way to see it. The `conversations`/`messages` tables
already exist (migration 0006) — this only needs a read endpoint.

- `GET /admin/jobs/:jobId/conversation` → messages with sender names, oldest first
- Read-only: admins should never be able to post into a user conversation

### 7. Verification submission pre-check

Not identity verification — just a usability guard so admins don't open blank
or corrupt submissions. On `POST /verifications`, reject obviously unusable
uploads (missing object, zero-byte, not a decodable image) with a clear message
so the provider can resubmit immediately instead of waiting for a rejection.

### Deliberately not planned

- **AI / automated identity verification.** Real KYC (Onfido, Persona, Sumsub)
  is a compliance product, not a feature to approximate. A homegrown
  "AI approves the ID" step would look worse under scrutiny than honest manual
  review, and manual review is what the queue is already built for.
- **A support-ticket inbox.** A user↔admin messaging subsystem is its own
  product surface (tickets, assignment, statuses, SLAs). Item 6 above covers the
  actual operational need — seeing conversation context during a dispute.
- **Making the inert Settings toggles real.** Notifications, Platform, and Data
  & Privacy are marked "Saved on this device only" in the UI. Wiring them up
  means an email service and a retention job — real infrastructure for little
  demonstrable gain. Better honest than falsely functional.

### Also worth knowing

`PATCH /profiles/me` accepts `full_name` but there is **no endpoint to change a
user's email** — email lives on `auth.users`, not `profiles`. The Settings page
therefore shows Email as read-only rather than pretending to save it.

## npm audit note

After `npm install` you may see **2 moderate** warnings about `postcss`. These are a **known npm false positive** — npm is flagging a copy of PostCSS that is *bundled inside* Next.js 16 itself (in `node_modules/next/node_modules/postcss`). Next.js controls that copy and never passes user-provided HTML through it, so it does not affect your app. The only "fix" npm offers would downgrade you to Next.js 9, which is obviously wrong. You can safely ignore these warnings.
