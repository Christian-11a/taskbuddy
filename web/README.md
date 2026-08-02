# TaskBuddy Admin Console

The admin dashboard for the TaskBuddy platform (`web/` in the repo). Next.js 16 App Router, TypeScript, Tailwind CSS v4, Lucide React, and Recharts. Login, Users, Bookings, and all of Reports/Analytics (including revenue and the activity feed) run against the live backend. Verifications and the Transactions page still run on mock data via a built-in data seam — **not because of anything missing on the web side, but because the backend features they depend on haven't been built yet.** See [What's Still Needed From the Backend](#whats-still-needed-from-the-backend) — that section is written for whoever picks up that work next.

## Live Deployment

- **URL**: https://taskbuddy-nine-zeta.vercel.app
- **Backend**: https://taskbuddy-1d48.onrender.com (Render, free plan)
- **Database/Auth**: Supabase project `TaskBuddy` (`axtizgnurqnjzfjrngvd`)
- **Env vars set on Vercel**: `NEXT_PUBLIC_USE_MOCK=false`, `NEXT_PUBLIC_API_URL=https://taskbuddy-1d48.onrender.com`
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
- 🛡️ Provider Verification Queue — approve/reject with live state (mock data — see [What's Still Needed From the Backend](#whats-still-needed-from-the-backend))
- 👥 User Management — searchable table with role/status badges
- 💳 Transaction Monitoring — full log with status colors (mock data — see [What's Still Needed From the Backend](#whats-still-needed-from-the-backend))
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
`http://localhost:3001` (a local `backend/` instance). To hit the live Render
backend instead, create `.env.local`:

```bash
NEXT_PUBLIC_USE_MOCK=false
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
    ├── mock/db.ts               # In-memory mock database (Verifications + Transactions only — see below)
    ├── services/                # THE DATA SEAM — pages/context only ever call these
    ├── adapters/                # Domain → display-row mapping, formatting (+ unit tests)
    └── api/client.ts            # Fetch client for the real backend
```

## Data Flow (the seam)

```
pages/context → services (async fns) → api/client.ts (real backend — most data)
                                     → mock/db.ts     (Verifications + Transactions only)
```

- **Pages and `AppContext` never touch data sources directly** — they call `lib/services` functions and render the display rows produced by `lib/adapters`.
- Verifications and Transactions simulate ~150ms latency (`simulate()` in `lib/services/index.ts`) so their loading states stay genuinely exercised while they're still mock-backed; real backend calls have their own network latency.

## Real Backend Integration

Login, Users, Bookings, and Reports/Analytics — including total/monthly
revenue, the revenue chart, and the Recent Activity feed — all call the
live backend (`https://taskbuddy-1d48.onrender.com` by default — override
with `NEXT_PUBLIC_API_URL`). Verifications and the Transactions page still
run on mock data (`src/lib/mock/db.ts`) — see
[What's Still Needed From the Backend](#whats-still-needed-from-the-backend)
below for exactly why and what would unblock them. Background/history:
`docs/superpowers/specs/2026-07-20-web-backend-integration-design.md` (kept
locally, not committed to this repo).

To run against a different backend URL (e.g. a local `backend/` instance):

```bash
NEXT_PUBLIC_USE_MOCK=false
NEXT_PUBLIC_API_URL=http://localhost:3001
```

Domain types in `lib/domain.ts` mirror the backend's real enums (`user_role`,
`job_status` — see `backend/BACKEND_SCHEMA.md` §4). The Bookings page's
`amount` column is still a fixed placeholder — the `jobs` table has no
price/amount field (pricing is a separate, still out-of-scope concern from
the revenue figures below, which now come from the real wallet ledger).

## What's Still Needed From the Backend

Everything on this page is wired to real data **except** Verifications and
the Transactions page. Both are blocked on backend/database work, not
anything in `web/` — here's exactly what's missing, for whoever picks these
up next:

### 1. Verifications (provider ID/selfie approval queue)

No table exists for this at all — there's nothing to query. To make this
real, the backend needs:

- A table for verification submissions (provider id, document/selfie file
  references, status, submitted/reviewed timestamps, reviewed-by admin)
- File storage for the uploaded documents (a Supabase Storage bucket)
- Endpoints to submit (mobile provider-side), list, approve, and reject

This is backlog stories **#9** (provider submits ID/selfie) and **#28**
(admin verification queue) — both still "New" on the board.

### 2. Transactions page (escrow / disputes)

A real `wallet_transactions` table already exists (added alongside the
mobile app's Wallet screens) and **is** used for the real revenue figures
above. But it's a simple per-user credit/debit ledger — it has no concept
of escrow holds or disputes. The Transactions page's UI, on the other hand,
expects a two-party record (customer + provider + service) with statuses
like "In Escrow," "Disputed," and "Refunded." None of that exists in the
data model, so there's nothing honest to map it to without an actual
escrow/dispute system:

- Payment held in escrow when a booking is made
- Escrow released to the provider on job completion
- A dispute flow (raise, review, resolve/refund)

This is backlog stories **#17** (escrow hold), **#18** (escrow
release/payout), and **#20** (dispute resolution) — all still "New."

### Notification bell — not a third item

The bell in the header (`Header.tsx`) isn't its own feature — it just reads
from the Verifications and Transactions lists to decide what to show
(pending verifications, disputed transactions). It has no backend of its
own, so it doesn't need separate work: it becomes real automatically once
#1 and #2 above are built.

## npm audit note

After `npm install` you may see **2 moderate** warnings about `postcss`. These are a **known npm false positive** — npm is flagging a copy of PostCSS that is *bundled inside* Next.js 16 itself (in `node_modules/next/node_modules/postcss`). Next.js controls that copy and never passes user-provided HTML through it, so it does not affect your app. The only "fix" npm offers would downgrade you to Next.js 9, which is obviously wrong. You can safely ignore these warnings.
