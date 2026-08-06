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

**Status: all seven items below now have a real backend** (migration 0014 +
service/controller changes) — see `backend/BACKEND_SCHEMA.md` §23 for the
authoritative contracts. This section is kept as a record of what shipped and,
for most items, **what the console still needs to actually call the new
endpoint** — the backend work didn't include new UI beyond the one breaking
change (#4) that an existing screen already depended on.

Ordered by how much they'd improve the console per unit of work.

### 1. Timed suspensions (with a reason) — backend done, UI not wired

`POST /admin/users/:id/suspend` now accepts `{ duration_days?: number, reason: string }`
(omit `duration_days` for indefinite) and `admin_user_overview` returns
`suspended_until`/`suspension_reason`. Expiry is lifted lazily wherever
`deactivated_at` is already checked (login) — no cron job. **Not yet done:** the
Suspend button/modal in Users still calls the old no-body form; it needs a
reason field (and optionally a duration picker) before this is usable.

### 2. Admin-triggered password reset — backend done, UI not wired

`POST /admin/users/:id/send-password-reset` → `{ sent: true }`, refusing
`role = 'admin'` targets. **Not yet done:** no button/action exists on the
Users page or a user's detail view to call it.

### 3. Booking detail endpoint — backend done, UI not wired

`GET /admin/bookings/:id` → the full job plus its escrow record if one exists.
**Not yet done:** the Bookings row expansion still renders only what the list
endpoint already returned; it isn't calling this endpoint for the extra fields
(description, address, `scheduled_at`, `photo_urls`) yet.

### 4. Activity Log pagination and date filtering — done, wired

`GET /admin/activity?limit=&offset=&from=&to=` now returns `{ items, total }`
(was a bare array). Both existing consumers (`getRecentActivity()` in
`lib/services/index.ts`, used by both the Dashboard feed and the Activity Log
page) were updated to unwrap `.items`, so nothing broke. Neither page paginates
yet, though — both still just render the same list the backend used to return
by default (newest 20). Actually building pagination/date-range controls into
the Activity Log page is separate frontend work.

### 5. Real admin audit log — backend done, UI not wired

New `admin_actions` table, written from `AdminService.suspend/reinstate/cancelBooking`,
`VerificationsService.approve/reject`, and `DisputesService.resolve`.
`GET /admin/audit?action=&actor_id=&from=&to=&limit=&offset=` → `{ actions, total }`.
**Not yet done:** there is no Audit Log page or panel in the console — this
endpoint has no UI consumer at all yet.

### 6. Admin read-only access to a job's chat — backend done, UI not wired

`GET /admin/jobs/:jobId/conversation` → `{ messages: [{ ...message, sender_name }] }`,
oldest first; returns an empty list rather than 404 for a job with no
conversation yet. **Not yet done:** the Disputes detail view doesn't render
this — an admin resolving a dispute still can't see the conversation from
the console.

### 7. Verification submission pre-check — done, transparent to the UI

`POST /verifications` now rejects a missing/zero-byte/non-image upload before
inserting the row. This is mobile-side (the provider's submission flow, not
`web/`), so there's nothing for the admin console to wire up.

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
