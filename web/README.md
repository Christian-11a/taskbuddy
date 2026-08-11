# TaskBuddy Admin Console

The internal admin dashboard for the TaskBuddy platform — user moderation,
provider verification, escrow/wallet monitoring, disputes, and analytics.
Next.js 16 (App Router) + TypeScript, talking to the NestJS backend in
`../backend`.

**Live:** https://taskbuddy-nine-zeta.vercel.app · **Sign in:**
`admin@taskbuddy.com` (ask the team for the password)

> **Status:** all admin console features are built, wired to the real backend,
> and verified — lint, type-check, 93 tests and a production build all pass.
>
> **Two items need backend changes before this is production-ready** and are
> the main things to review: session tokens are held in `localStorage` rather
> than an httpOnly cookie, and list pagination is blocked on missing `search`
> params. Both are specified in
> **[Needs backend work (for review)](#needs-backend-work-for-review)**.

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

By default this hits the deployed backend, so you can sign in immediately with
no local backend running.

To point at a local backend instead, create `.env.local`:

```bash
NEXT_PUBLIC_API_URL=http://localhost:3001
```

…then start the backend on that port — it defaults to 3000, which Next.js has
already taken:

```bash
cd ../backend && PORT=3001 npm run start:dev
```

| Script | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build (also type-checks) |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests |

---

## Troubleshooting

**First load after a while takes 30–60 seconds.** The backend is on Render's
free tier and sleeps when idle. The first request wakes it. Not a bug — later
requests are fast.

**`GET /admin/maintenance` 404s in the console.** That route exists locally but
hasn't been deployed to Render yet. The app handles it gracefully (falls back
to "maintenance off"); it'll stop once the backend redeploys.

**Backend won't start / port already in use.** Both the backend and Next.js
default to port 3000. Run the backend with `PORT=3001`.

**Hydration warning mentioning `data-gr-ext-installed`.** That's the Grammarly
browser extension editing `<body>` before React hydrates, not app code. Already
suppressed via `suppressHydrationWarning` on `<body>`.

**Everything renders empty / all zeroes.** Check for a red banner at the top of
the page — a failed data load shows there with a Retry button. If there's no
banner, the platform genuinely has no data yet.

---

## Architecture

```
pages → context/AppContext → lib/services → lib/api/client → backend
                                   ↓
                             lib/adapters (display formatting)
```

- **Pages never call the backend directly.** They read from `AppContext` and
  render rows produced by `lib/adapters`.
- **`lib/services` is the seam.** It's where snake_case wire types become
  camelCase domain objects, and backend enums become display labels
  (escrow `held` → `IN_ESCROW`).
- **`AppProvider` lives in the root layout**, so session and loaded data survive
  client-side navigation — sidebar clicks don't refetch, a hard refresh does.
- **Overlapping requests are deduped.** `/admin/analytics/summary` backs five
  dashboard values, and `getTransactions()` is needed by both the Transactions
  page and the dispute cross-reference; both share one in-flight request rather
  than firing duplicates. This matters on a free-tier backend.
- **An expired token is refreshed once** via `POST /auth/refresh` and the
  request retried, instead of bouncing the admin to the login screen.

```
src/
├── app/
│   ├── layout.tsx            # <html>, Inter via next/font, ToastProvider + AppProvider
│   ├── page.tsx              # "/" → redirects to /dashboard or /login
│   ├── error.tsx             # Error boundary
│   ├── not-found.tsx         # Custom 404
│   ├── robots.ts             # Disallow all — this console holds real user PII
│   ├── login/page.tsx
│   └── (admin)/              # Route group: URLs stay /users, not /admin/users
│       ├── layout.tsx        # Auth gate + sidebar/header + load-error banner
│       └── <page>/page.tsx   # One folder per page, each sets its own <title>
├── components/
│   ├── layout/               # Sidebar, Header
│   ├── pages/                # One component per admin page
│   └── ui/                   # ConfirmDialog, Toast
├── context/AppContext.tsx    # Session, data, mutations, preferences
└── lib/
    ├── domain.ts             # Backend-shaped domain types
    ├── routes.ts             # Page id ↔ URL + page titles
    ├── validation.ts         # Shared rules, mirroring backend DTO limits
    ├── services/             # THE DATA SEAM
    ├── adapters/             # Domain → display rows
    ├── export/csv.ts         # Client-side CSV
    └── api/                  # client.ts, session.ts, types.ts
```

### Routing

Every page has a real URL (`/dashboard`, `/users`, …), so refresh, bookmarks,
deep links and the back button all work.

The auth gate in `(admin)/layout.tsx` waits on `sessionRestored` before
redirecting — `isLoggedIn` is false on the server and on the client's first
render, so redirecting without that check would bounce a signed-in admin to
`/login` on every refresh.

---

## Where each page's data comes from

| Page | Endpoint(s) |
|---|---|
| Login | `POST /auth/login` |
| Dashboard | `GET /admin/analytics/summary`, `GET /admin/activity` |
| Verifications | `GET /admin/verifications`, `POST .../approve` · `/reject` (accepts a reason) |
| Users | `GET /admin/users`, `POST .../suspend` (reason + optional duration) · `/reinstate` · `/send-password-reset` |
| Transactions | **Escrow:** `GET /admin/transactions` · **Wallet:** `GET /admin/wallet-transactions` (fetched when the tab opens) |
| Disputes | `GET /admin/disputes`, `POST .../resolve` (accepts a note), `GET /admin/jobs/:jobId/conversation` (on demand) |
| Bookings | `GET /admin/bookings`, `POST .../cancel`, `GET /admin/bookings/:id` (on row expand) |
| Activity Log | `GET /admin/activity` |
| Audit Log | `GET /admin/audit` |
| Reports | `GET /admin/analytics/summary` |
| Settings | `PATCH /profiles/me`, `POST /auth/change-password`, `GET`/`PATCH /settings`, `GET`/`PATCH /admin/maintenance` |

Bulk actions call the single-item endpoint once per id in parallel. A per-id
failure doesn't abort the rest — the counts come back so the UI can say
"Suspended 3 of 5" rather than implying all 5 worked.

CSV export is entirely client-side. It respects the current search/filter (and
checkbox selection on Users), and is written UTF-8 with a BOM so Excel doesn't
mangle the peso sign.

---

## How backend data maps to the UI

- **Verification status** is lowercase on the backend (`pending`/`approved`/
  `rejected`) to match `job_status` and `user_role`; the services layer
  uppercases it for display.
- **Transaction status** is mapped from `escrow_status`: `held`→`IN_ESCROW`,
  `released`→`COMPLETED`, `disputed`→`DISPUTED`, `refunded`→`REFUNDED`. A
  `cancelled` hold also reads as `REFUNDED` — there's no separate UI state.
- **Bookings amount** is the real `jobs.budget`. Jobs posted before pricing
  existed (migration 0007) have none and show ₱0.
- **The notification bell** derives from the Verifications and Disputes lists.
  It never needed a backend of its own.
- **Escrow ≠ wallet.** Escrow is money held for one job; the wallet ledger is a
  user's running balance (top-ups, withdrawals, payouts, refunds). Separate
  tables, separate tabs.
- **⚠️ Validation limits are duplicated on both sides.** `REASON_MAX_LENGTH` =
  500, `NOTE_MAX_LENGTH` = 1000, name ≤ 120 — these mirror the backend DTOs.
  **Change a limit on one side and it must change on the other**, or the UI
  will either reject valid input or let through what the API rejects.

---

## Needs backend work (for review)

**These two cannot be fixed from `web/`.** Both are written up with the
specific change required, so they can be picked up without re-diagnosing.

### 1. Auth tokens are stored in `localStorage` (security)

`lib/api/session.ts` keeps the access *and* refresh token where any injected
script can read them.

**Needed on the backend:** issue the session as an
`httpOnly; Secure; SameSite` cookie instead, enable CORS credentials, and add
CSRF protection on state-changing routes. The web side then stops handling
tokens entirely.

### 2. Pagination is blocked on missing `search` params

Every list requests a flat 200 rows, so row 201 is invisible. `limit`/`offset`
already exist — **the blocker is search.** Bookings, Transactions and Activity
Log filter client-side over the rows already loaded, and their query DTOs take
no `search` param. Paginating them as they stand would make the search box
quietly search only the current page, which is worse than the 200-row cap it
replaced.

**Needed on the backend:** add a `search` string to `ListBookingsQueryDto`,
`ListTransactionsQueryDto` and `ListActivityQueryDto`, matched against the same
columns the UI filters on today — customer/provider/service, customer/provider/
id, and job title respectively.

`ListUsersQueryDto` already accepts `search`/`role`/`status`, so Users could be
paged immediately. Worth shipping all four together so paging behaves the same
everywhere.

---

## Deliberate tradeoffs (no action needed)

Called out because a reviewer will spot them and should know they were chosen,
not missed.

- **Mutations refetch the whole list** rather than patching from the response.
  Costs a small request; buys a table that stays correct when a bulk action
  partly fails.
- **One `AppContext` rather than split auth/UI/data contexts.** The value is
  `useMemo`'d, which removes the needless re-renders. A full split is real
  boilerplate for no measurable gain at this data volume.
- **CSP is report-only.** Every component styles inline, so an enforcing policy
  needs `'unsafe-inline'` for styles anyway, and Next injects inline hydration
  scripts. Tighten once the violation report is clean.
- **Inert Settings toggles are labelled, not removed.** Notifications, Platform
  and Data & Privacy save to this device only and say so. An honestly labelled
  non-functional toggle documents intent; a deleted one loses the requirement.

---

## Not yet built

- **Component tests.** The 93 tests all cover `lib/`. Page behaviour — confirm
  dialogs, error toasts, loading vs empty states — has been verified by hand in
  a browser, but nothing re-runs it. Vitest and jsdom are already set up, so
  this is mostly adding React Testing Library. Clearest next step.
- **Fee/commission model, category management, a second admin account, and
  notification broadcast.** None have backend support today — see
  `backend/BACKEND_SCHEMA.md`. Each needs a schema decision before any UI.

---

## Decided against (out of scope)

- **AI/automated identity verification.** Real KYC (Onfido, Persona, Sumsub) is
  a compliance product, not something to approximate. A homegrown "AI approves
  the ID" step would look worse under scrutiny than honest manual review — and
  manual review is what the queue is built for.
- **A support-ticket inbox.** User↔admin messaging is its own product surface
  (tickets, assignment, SLAs). Read-only chat access during a dispute covers the
  actual operational need.

---


## Project history

Detailed change history — what shipped in each pass and why — lives in
[`CHANGELOG.md`](./CHANGELOG.md). Short version: the console started on mock
data, moved onto the real backend across migrations 0008–0014 and 0017, then went
through hardening passes covering routing, security headers, destructive-action
confirmations, error handling, and accessibility.
