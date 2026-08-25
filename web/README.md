# TaskBuddy Admin Console

The internal admin dashboard for the TaskBuddy platform — user moderation,
provider verification, escrow/wallet monitoring, disputes, and analytics.
Next.js 16 (App Router) + TypeScript, talking to the NestJS backend in
`../backend`.

**Live:** https://taskbuddy-nine-zeta.vercel.app · **Sign in:**
`admin@taskbuddy.com` (ask the team for the password)

> **Status:** this worktree implements browser-admin cookie sessions and
> server-side list search/pagination. External deployment and production smoke
> testing remain operator actions; this document does not claim they occurred.

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

For an externally hosted console, set `NEXT_PUBLIC_API_URL` to the API HTTPS
origin and set that exact console origin in the API's comma-separated
`WEB_CORS_ORIGINS`. The API enables credentialed CORS only for that allowlist;
wildcard origins cannot be used with the admin cookies.

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

Available but not yet wired to a page: `GET /admin/withdrawals` (+ settle /
reject), `GET`/`POST /admin/categories` + `PATCH /admin/categories/:id`,
`GET`/`POST /admin/admins` + `POST /admin/admins/:id/revoke`,
`POST /admin/notifications/broadcast`, and `GET`/`PATCH /admin/commission`.

Bulk actions call the single-item endpoint once per id in parallel. A per-id
failure doesn't abort the rest — the counts come back so the UI can say
"Suspended 3 of 5" rather than implying all 5 worked.

CSV export is entirely client-side. It respects the current search/filter, and
on Users, Bookings, and Transactions (both tabs) also respects row-selection
checkboxes — checked rows export instead of the whole filtered set when any
are checked. Written UTF-8 with a BOM so Excel doesn't mangle the peso sign.

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

## Backend Integration Status

**This worktree uses the backend integrations below.** An external deploy is
still required before they are available at a hosted URL.

### 1. Adopt browser-admin session cookies

`lib/api/session.ts` keeps only the in-memory admin identity and CSRF token.
The access and refresh tokens are never put in `localStorage`; the browser
holds them in httpOnly cookies.

**Endpoints in use:** `POST /auth/admin/login`,
`POST /auth/admin/refresh`, `GET /auth/admin/session`, and
`POST /auth/admin/logout`. They use httpOnly access/refresh cookies and a
readable CSRF cookie/token pair. The API enables credentialed CORS and rejects
unsafe cookie-authenticated requests without a matching `X-CSRF-Token`.

`lib/api/client.ts` sends `credentials: 'include'` and adds the current CSRF
token to unsafe requests. A single in-flight refresh rotates the cookies and
updates the in-memory CSRF token before retrying a 401.

### 2. Adopt server-side list search and pagination

Bookings, Transactions, and Activity Log send their search/filter/page state
to the API and render its exact `total`, rather than filtering a fixed local
slice.

**Backend support in use:** `GET /admin/bookings`,
`GET /admin/transactions`, and `GET /admin/activity` accept `search`, `limit`,
and `offset`; search, filtering, ordering, exact count, and page selection run
in SQL. Bookings search booking ID, client/provider name, and category;
transactions search transaction ID, client/provider name, and job title;
activity searches job title.

Migration `0020_admin_search_functions.sql` supplies the hardened,
service-role-only RPCs backing these list endpoints — applied and verified
2026-08-17, so these pages work against the deployed API. Booking detail responses also expose `photo_urls`
as renderable public URLs, including conversion of stored `job-photos` paths.

### 3. Available but not yet consumed (migrations 0022–0024)

Four surfaces this document previously listed under "Not yet built" now have an
API. The console does not call any of them yet. Full reasoning for each decision
is in `backend/BACKEND_SCHEMA.md` §27; the short version, because each carries a
choice a reviewer should not have to rediscover:

| Surface | Endpoints | The decision baked in |
|---|---|---|
| **Withdrawal queue** | `GET /admin/withdrawals`, `POST .../settle` (accepts a payout reference), `POST .../reject` (accepts a reason) | Withdrawal requests land `pending` and settle only when an admin records that money actually moved. There is no payout rail, so this queue *is* the disbursement mechanism, not a review step in front of one. Settling re-checks the balance and can only fire once, whoever clicks |
| **Categories** | `GET`/`POST /admin/categories`, `PATCH /admin/categories/:id` | **No delete.** Jobs, provider profiles and the ML feature set all reference a category by id; `is_active: false` takes it off the menu without rewriting the jobs that used it. A duplicate name is a 409 |
| **Admin accounts** | `GET`/`POST /admin/admins`, `POST /admin/admins/:id/revoke` | **No password crosses the wire.** The new admin sets their own from a reset email. Revocation refuses self-demotion and refuses to remove the last admin — a console nobody can get into is not recoverable from inside the console |
| **Commission** | `GET`/`PATCH /admin/commission` | A **fraction**, not a percent: 0.15 is 15%, capped at 0.5. Applies at escrow release and freezes onto the escrow row, so settled jobs keep their figures. Defaults to 0 — nothing is withheld until someone deliberately sets it |
| **Broadcast** | `POST /admin/notifications/broadcast` | One notification row per recipient (read state and push are both per-row), excluding admins, suspended and deleted accounts. Returns `{ sent, failed }` — a partly-delivered broadcast reports the shortfall rather than throwing |

Two changes to pages that **do** exist, worth knowing before the next pass over
them:

- **Users** — `status` accepts `deleted` as well as `active`/`suspended`.
  Accounts that deleted themselves (`DELETE /profiles/me`) are excluded from the
  default list and from `suspended`; they carry `deactivated_at`, so without that
  they would show up as people to consider reinstating. The rows they left behind
  still reference them, which is why they remain findable at all.
- **Dashboard** — `GET /admin/analytics/summary` gains `total_commission`,
  `monthly_commission`, `commission_trend` and `pending_withdrawals`. The
  existing revenue fields are unchanged and still mean what they meant:
  `total_revenue` is what flowed *through* the platform, commission is what it
  *kept*. Rendering either as "Revenue" without the other is how a marketplace
  ends up quoting GMV as income.

---

## Backend Requests

### Needed

- **Recovery-credit issuance endpoint** — `POST /admin/wallet-transactions/recovery-credit`.
  Nothing today lets an admin credit a wallet at all;
  `WalletService.create()` explicitly refuses any `direction: 'credit'` request
  from any caller, including admins, to prevent free balance minting. This
  needs a separate, admin-only route that's allowed to do what that one
  deliberately can't. Fully unblocked — migration `0021_recovery_credit_kind.sql`
  is already applied — and `docs/backend-handoff-recovery-vouchers.md` has a
  ready-to-use DTO/service/controller sketch (audit-log + notify pattern
  mirrors `DisputesService.resolve()`). Once this exists, web gets a small
  "Issue Credit" button on the Transactions page's Wallet tab — no point
  wiring it to a route that 404s.

### Resolved

- **Fee/commission model, category management, a second admin account, and
  notification broadcast** — all four were flagged here as needing a schema
  decision before any UI. Answered by migrations 0022–0024, with the decisions
  recorded in `backend/BACKEND_SCHEMA.md` §27: the rate lives on the single
  `platform_settings` row (global, not per-category) as a fraction, frozen onto
  the escrow row at release; categories deactivate rather than delete, since
  jobs and the ML feature set reference them by id; admin creation never
  accepts a password and the last admin cannot be demoted; broadcast writes one
  row per recipient so read state and push both work. Endpoints are
  `GET`/`PATCH /admin/commission`, `GET`/`POST /admin/categories` +
  `PATCH /admin/categories/:id`, `GET`/`POST /admin/admins` +
  `POST /admin/admins/:id/revoke`, and
  `POST /admin/notifications/broadcast`. **No UI yet.**
- **Withdrawal settlement queue** — not previously requested here, but newly
  available and worth the same note: `GET /admin/withdrawals` plus settle and
  reject. There is no payout rail, so this queue is the only way anyone on the
  platform gets paid out. **No UI yet**, which makes it the most load-bearing
  gap on this list.
- **Auth tokens moved off `localStorage`** — was flagged as a security gap
  (any injected script could read the access/refresh tokens). Fixed in
  `fe2356d` ("align backend with current clients", 2026-08-17): httpOnly
  cookie sessions + CSRF, detailed under
  [Backend Integration Status](#backend-integration-status) above. Verified
  end-to-end against the deployed API 2026-08-19 — login, session restore,
  a CSRF-protected mutation rejecting without the header and accepting with
  it, refresh rotating the cookie/CSRF pair, and logout clearing the session.
- **Server-side search/pagination for Bookings, Transactions, Activity Log**
  — was flagged as blocked on missing `search` params (the 200-row cap made
  row 201 invisible, and client-side filtering over a fixed slice would have
  quietly searched only the loaded page). Fixed in the same commit via
  migration `0020_admin_search_functions.sql` — detailed under
  [Backend Integration Status](#backend-integration-status) above.

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

- **UI for the four newly-backed admin surfaces.** Fee/commission, category
  management, a second admin account, and notification broadcast used to be
  listed here as having no backend at all. They do now — migrations 0022–0024,
  `backend/BACKEND_SCHEMA.md` §27. Nothing in this console calls them yet; the
  endpoints and the decisions they encode are below under
  [Backend Integration Status](#backend-integration-status).
- **UI for the withdrawal settlement queue.** `GET /admin/withdrawals` plus
  settle/reject. This one is not cosmetic: there is no payout rail, so until a
  page exists nobody on the platform can be paid out except by an operator
  calling the API directly.
- **UI for recovery-credit issuance.** Still genuinely blocked — see
  [Backend Requests](#backend-requests) above; that endpoint does not exist yet.

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
data, moved onto the real backend across migrations 0008–0014 and 0017, went
through hardening passes covering routing, security headers, destructive-action
confirmations, error handling, and accessibility, then had its visual design
and interaction patterns (pagination, row-selection, scoped CSV export)
ported from a design mockup to match it exactly.
