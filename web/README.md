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
- 🛡️ Provider Verification Queue — review provider ID/selfie submissions, approve/reject
- 👥 User Management — searchable table with role/status badges
- 💳 Transaction Monitoring — escrow log with status colors (In Escrow / Completed / Disputed / Refunded)
- 📅 Booking Tracker — search and filter
- 📈 Reports & Analytics — area chart, pie chart, bar chart, top providers
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
│   └── pages/                   # One component per admin page (7 pages + login)
├── context/
│   └── AppContext.tsx           # App state: session, data, mutations, persisted preferences
└── lib/
    ├── domain.ts                # Backend-shaped domain types (shared platform contracts + admin types)
    ├── services/                # THE DATA SEAM — pages/context only ever call these
    ├── adapters/                # Domain → display-row mapping, formatting (+ unit tests)
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
| Bookings | `GET /admin/bookings`, `POST /admin/bookings/:id/cancel` |
| Reports | `GET /admin/analytics/summary` |
| Settings | `POST /auth/change-password` (everything else on that page is a local preference) |

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

## npm audit note

After `npm install` you may see **2 moderate** warnings about `postcss`. These are a **known npm false positive** — npm is flagging a copy of PostCSS that is *bundled inside* Next.js 16 itself (in `node_modules/next/node_modules/postcss`). Next.js controls that copy and never passes user-provided HTML through it, so it does not affect your app. The only "fix" npm offers would downgrade you to Next.js 9, which is obviously wrong. You can safely ignore these warnings.
