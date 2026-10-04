# TaskBuddy Web

One Next.js 16 (App Router) + TypeScript app serving two audiences:

- **`/`** — the public promo site (marketing homepage, Sign In / Sign Up, the
  post-signup account handoff page) — talks to the NestJS backend's plain
  customer auth endpoints (`/auth/register`, `/auth/login`, `/auth/forgot-password`, etc).
- **`/admin/*`** — the internal admin dashboard — user moderation, provider
  verification, escrow/wallet monitoring, disputes, and analytics — talks to
  the backend's separate cookie-based `/auth/admin/*` endpoints.

Both share one deploy, one root layout, and one backend in `../backend`; they
don't share a session or an auth model — see
[Backend Integration Status](#backend-integration-status) for why that's two
different mechanisms on purpose.

**Live:** https://taskbuddy-nine-zeta.vercel.app · **Admin sign in:**
`/admin/login` — `admin@taskbuddy.com` (ask the team for the password)

> **Status:** deployed on Vercel at the URL above, against the deployed API.
> Browser-admin cookie sessions, server-side list search/pagination (including
> Service Requests and booking-title search), and the public promo site +
> customer auth flow (including forgot/reset password and live provider
> categories) are live. The API's credentialed CORS allows this origin. The
> deployed Render commit is not exposed. See
> [backend handover](../HANDOFF.md) for backend checks and
> [CHANGELOG.md](./CHANGELOG.md) for what was verified and when.

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000 — public homepage
                      # http://localhost:3000/admin/login — admin sign in
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

**Admin theme starts in light mode.** `/admin/login` and the dashboard use a
light theme by default. A previously saved dark-mode preference is preserved;
use the Dark Mode switch in Settings to change it.

**Build workspace root.** The repository has a root `package-lock.json` and a
second one under `web/`. `next.config.ts` pins Turbopack's root to this web app
so it does not need to infer the workspace from both lockfiles. Keep the root
lockfile; it belongs to the repository and should not be removed in a web-only
change.

**Hydration warning mentioning `data-gr-ext-installed`.** That's the Grammarly
browser extension editing `<body>` before React hydrates, not app code. Already
suppressed via `suppressHydrationWarning` on `<body>`.

**Console data is missing.** A failed core data load shows a banner at the top
of the admin console with a Retry button. If only analytics fails, Dashboard
and Reports calculate a browser fallback from working list endpoints and label
it as calculated in the browser. The live summary endpoint was verified working
on 2026-09-30; the fallback remains for future outages.

---

## Architecture

The data flow below (`AppContext` → `lib/services` → `lib/api/client`) is
**admin-only** — `/admin/*` pages never call the backend directly. The public
site at `/` doesn't use any of it; its Sign In/Sign Up/Forgot Password calls
go straight from `public/promo/auth.js` to `web`'s own `app/api/auth/*` route
handlers (see [Backend Integration Status §3](#3-public-site-customer-auth--password-reset)).

```
admin pages → context/AppContext → lib/services → lib/api/client → backend
                                         ↓
                                   lib/adapters (display formatting)
```

- **Admin pages never call the backend directly.** They read from `AppContext`
  and render rows produced by `lib/adapters`.
- **`lib/services` is the seam.** It's where snake_case wire types become
  camelCase domain objects, and backend enums become display labels
  (escrow `held` → `IN_ESCROW`).
- **`AppProvider` lives in `app/admin/layout.tsx`**, scoped to `/admin/*` only
  (it used to sit in the root layout, but that fired session-restore 401s
  against the public homepage once `/` stopped being an admin route) — so
  session and loaded data still survive client-side navigation within the
  admin console.
- **Overlapping requests are deduped.** `/admin/analytics/summary` backs five
  dashboard values, and `getTransactions()` is needed by both the Transactions
  page and the dispute cross-reference; both share one in-flight request rather
  than firing duplicates. This matters on a free-tier backend.
- **Live refresh without new endpoints.** While an admin is signed in and the
  tab is visible, `hooks/useLiveRefresh` calls `AppContext.refreshData()`
  every 30 s (a silent reload: no spinner, keeps the last good analytics).
  Pages with their own data (Withdrawals, Service Requests, Bookings,
  Transactions, Activity) reload on the same tick via `hooks/useLiveTick`. A
  silent refresh never starts while the first load is still running, and a
  moderation action discards any refresh that was already in flight.
- **Lists use the backend's paging contracts.** Bookings, Activity, Audit,
  Wallet and Service Requests load server-filtered pages. Other queues load
  their complete lists for local filtering. If
  `/admin/analytics/summary` fails, the same summary is rebuilt in the browser
  from working lists (`lib/services/browserAnalytics.ts`).
- **An expired token is refreshed once** via `POST /auth/refresh` and the
  request retried, instead of bouncing the admin to the login screen.

```
src/
├── app/
│   ├── layout.tsx            # <html>, Inter via next/font — shared by both surfaces
│   ├── page.tsx              # "/" — public homepage (HomePage.tsx)
│   ├── robots.ts             # disallow ["/admin", "/account", "/dev"]; "/" is indexable
│   ├── dev/admin-preview/    # Dev-only: /dev/admin-preview/<page|login>[?theme=dark]
│   │                         # renders the console with sample data, no backend
│   │                         # or login. 404 in production builds.
│   ├── error.tsx             # Error boundary
│   ├── not-found.tsx         # Custom 404
│   ├── account/
│   │   ├── page.tsx          # Session-gated handoff page ("your account is ready")
│   │   ├── login/page.tsx    # Shareable URL → redirects into the "/#login" modal
│   │   └── signup/page.tsx   # Same, for "/#signup"
│   ├── api/auth/             # Route handlers proxying the backend's plain
│   │   │                     # customer endpoints; turn JSON tokens into httpOnly
│   │   │                     # cookies (register, login, logout, forgot-password,
│   │   │                     # reset-password, verify-email-otp; see _session.ts)
│   └── admin/
│       ├── layout.tsx        # Scopes ToastProvider + AppProvider to /admin/* only
│       ├── login/page.tsx
│       └── (admin)/          # Route group: URLs are /admin/users, not /admin/(admin)/users
│           ├── layout.tsx    # Auth gate + sidebar/header + load-error banner
│           └── <page>/page.tsx
├── components/
│   ├── layout/               # Sidebar, Header, CommandPalette (⌘K), LiveIndicator,
│   │                         # NotificationsMenu, ThemeToggle (admin only)
│   ├── admin/                # Console building blocks: Panel/PageHeader, KpiCard,
│   │                         # charts (Recharts), queue.tsx (inbox layout + J/K/A/R
│   │                         # keys), table.tsx (DataTable, BulkBar), AnimatedNumber
│   ├── pages/                # HomePage + AccountPage (promo) and one per admin page
│   └── ui/                   # shadcn-style primitives (button, badge, dialog,
│                             # dropdown-menu, command, input, switch, tooltip…)
│                             # plus ConfirmDialog, Toast, ReviewDrawer, Pagination
├── styles/promo.css          # Scoped under `.promo-site` — doesn't affect /admin
├── context/AppContext.tsx    # Session, data, mutations, preferences (admin only)
├── hooks/                    # useLiveRefresh, useLiveTick, useDebouncedValue
└── lib/
    ├── domain.ts             # Backend-shaped domain types
    ├── routes.ts             # Page id ↔ /admin/<page> URL + page titles
    ├── validation.ts         # Shared rules, mirroring backend DTO limits
    ├── services/             # THE DATA SEAM (admin)
    ├── adapters/             # Domain → display rows
    ├── export/csv.ts         # Client-side CSV
    ├── nav.ts                # Admin nav items, groups, search keywords
    ├── theme.ts / utils.ts   # Initial theme choice; cn() class merging
    └── api/                  # client.ts, session.ts, types.ts (admin)

public/promo/                 # auth.js (modal logic, real backend calls), vendor/
                               # (gsap, ScrollTrigger), images — static, not bundled
```

### Routing

Every admin page has a real URL (`/admin/dashboard`, `/admin/users`, …), so
refresh, bookmarks, deep links and the back button all work.

The auth gate in `admin/(admin)/layout.tsx` waits on `sessionRestored` before
redirecting — `isLoggedIn` is false on the server and on the client's first
render, so redirecting without that check would bounce a signed-in admin to
`/admin/login` on every refresh.

The public site's Sign In / Sign Up isn't a route at all in the usual sense —
it's a single modal on `/`, switched between panels (`welcome` / `signin` /
`signup` / `confirm` / `forgot` / `reset`) by `location.hash`
(`public/promo/auth.js`). `/account/login` and `/account/signup` exist only so
the panel has a real, shareable URL to redirect from; the homepage itself
never unmounts.

---

## Where each page's data comes from

**Public site** (`/`, via `web/src/app/api/auth/*` route handlers, which proxy
the backend and convert its JSON tokens into httpOnly cookies):

| Panel/page | Endpoint(s) |
|---|---|
| Sign In | `POST /auth/login` |
| Sign Up | `GET /categories` through `/api/categories` for live active provider skills, then `POST /auth/register` and `POST /auth/send-email-otp` (if email confirmation is required). Provider sign-up waits for the category list; it does not guess an ID if the lookup fails. |
| Confirm email | `POST /auth/verify-email-otp` |
| Forgot password | `POST /auth/forgot-password` (always 200 — never confirms whether the address exists) |
| Reset password | `POST /auth/reset-password` (logs the user in immediately on success) |
| Continue with Google | `GET /auth/google/authorize` (via `/api/auth/google/start`), then `/api/auth/google/callback` turns the returned tokens into the session cookie |
| `/account/complete-profile` | `POST /auth/complete-google-profile` — role + category + consents for a first-time Google signup |
| `/account` (handoff page) | `GET /auth/me`, server-side, to gate the page (and to detect `google_signup_pending` → redirect to complete-profile instead) |

**Admin console** (`/admin/*`):

| Page | Endpoint(s) |
|---|---|
| Login | `POST /auth/admin/login` |
| Dashboard | `GET /admin/analytics/summary` (includes held escrow and job totals; browser fallback retained), `GET /admin/activity`, `GET /admin/skill-requests?status=pending&limit=1&offset=0` (exact queue total). Separate escrow/booking reads are used only if summary fields are absent. |
| Verifications | `GET /admin/verifications`, `POST .../approve` · `/reject` (accepts a reason) |
| Users | `GET /admin/users`, `POST .../suspend` (reason + optional duration) · `/reinstate` · `/send-password-reset` |
| Transactions | **Escrow:** `GET /admin/transactions`, `POST /admin/escrow/:id/retry-transfer` (card-funded payouts) · **Wallet:** `GET /admin/wallet-transactions?search=…&limit=…&offset=…` (fetched when the tab opens), `POST /admin/wallet-transactions/recovery-credit` |
| Disputes | `GET /admin/disputes`, `POST .../resolve` (accepts a note), `GET /admin/jobs/:jobId/conversation` (on demand) |
| Bookings | `GET /admin/bookings` (page, total and search-filtered `status_counts` together), `POST .../cancel`, `GET /admin/bookings/:id` (detail drawer) |
| Activity Log | `GET /admin/activity` |
| Audit Log | `GET /admin/audit?search=…&action=…&limit=…&offset=…` (server-filtered pages and total) |
| Reports | `GET /admin/analytics/summary` (same browser fallback as the Dashboard) |
| Withdrawals | `GET /admin/withdrawals`, `POST .../:id/settle` · `POST .../:id/reject` |
| Platform | `GET`/`PATCH /admin/commission`, category CRUD, admin accounts, notification broadcast |
| Settings | `PATCH /profiles/me`, `POST /auth/change-password`, `GET`/`PATCH /settings` (account dark mode), `GET`/`PATCH /admin/maintenance`. The verification email alert and Platform name/support email are unavailable pending backend work. The Data & Privacy export-anonymization switch is local to the browser. |

The Platform page consumes the commission, category, admin-account, and
notification endpoints. The Withdrawals page consumes the settlement queue.

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
- **Funding and payout** (Escrow tab, migration 0028). A hold is funded from the
  client's wallet or by card at hire. A card-funded payout is also sent on to
  the provider's Stripe Connect account. The Payout column says whether it was,
  and **Retry transfer** re-runs one that failed. Every other payout is a wallet
  credit, shown as "Wallet" (`backend/BACKEND_SCHEMA.md` §29).
- **⚠️ Validation limits are duplicated on both sides.** `REASON_MAX_LENGTH` =
  500, `NOTE_MAX_LENGTH` = 1000, name ≤ 120 — these mirror the backend DTOs.
  **Change a limit on one side and it must change on the other**, or the UI
  will either reject valid input or let through what the API rejects.

---

## Backend Integration Status

**The console uses the backend integrations below**, live at the hosted URL
above against the deployed API.

> **Rate limits.** The API is rate-limited **per endpoint per IP**
> (`backend/BACKEND_SCHEMA.md` §28.4) — 240/minute on any one route, and
> `POST /auth/admin/login` specifically 10/minute. The console handles a `429`
> in two places:
>
> - `lib/api/client.ts` retries a `429` up to twice, waiting the `Retry-After`
>   the API sends (exposed to this origin by the API's CORS config) or backing
>   off exponentially, with jitter. That is safe for POSTs too: the throttler
>   rejects before the handler runs, so the first attempt did nothing. A wait
>   longer than 10 s fails straight away with "try again in Ns" instead of
>   leaving the admin staring at a spinner.
> - Bulk actions (`runBulk` in `lib/services`) run through a pool of
>   `BULK_CONCURRENCY` (4) rather than firing every id at once, and return the
>   real reason for each failure, which the Users page groups into its toast
>   ("Suspended 2 of 5. 3 failed: Too many requests — try again in 30s. (×2);
>   …") instead of guessing.

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

### 3. Public site: customer auth + password reset

The promo site's Sign In / Sign Up / Forgot Password modal talks to the
backend's plain customer endpoints — a different mechanism from the admin
console's cookie-based `/auth/admin/*` above, because these endpoints return
tokens in the JSON body rather than setting cookies themselves. `web`'s own
route handlers (`app/api/auth/*`) convert that JSON response into an httpOnly
`tb_account_access`/`tb_account_refresh` cookie pair — the backend never sees a
cookie for these.

**Endpoints in use:** `POST /auth/register`, `POST /auth/login`,
`POST /auth/logout`, `GET /auth/me`, `POST /auth/forgot-password`,
`POST /auth/reset-password`, `POST /auth/send-email-otp`,
`POST /auth/verify-email-otp`, `GET /auth/google/authorize` +
`GET /auth/google/callback` (via `/api/auth/google/start` and
`/api/auth/google/callback`), `POST /auth/complete-google-profile`.

Every route in `app/api/auth/*` checks `isSameOriginRequest()` (Origin,
falling back to Referer, against the request's Host) before doing anything —
a CSRF guard, since some of these are cookie-authenticated and a browser
attaches cookies to a request regardless of which site triggered it.
`google/callback` additionally requires a one-time nonce minted by
`google/start` and stored httpOnly (`setGoogleNonce`/`consumeGoogleNonce` in
`_session.ts`) — that route's tokens come from the URL's query string rather
than a cookie, so the Origin/Referer check alone wouldn't stop someone from
crafting that URL directly with tokens from an account they control and
handing it to a victim (a login-CSRF/session-fixation pattern, distinct from
ordinary CSRF).

Verified live: submitting Forgot Password with a real address 200s and
transitions to the Reset panel with the email prefilled; submitting Reset
Password with an invalid/expired code correctly surfaces the backend's
"Token has expired or is invalid" rather than a generic failure; clicking
"Continue with Google" goes through `/api/auth/google/start` to the real
backend to the real Google consent screen — the OAuth client's redirect URI
was updated to the current backend domain, so this now reaches Google's real
sign-in screen instead of `redirect_uri_mismatch`; a hand-crafted
`google/callback` URL with fake tokens is rejected and sets no cookie. The
reset-with-a-real-code success path and the real-email signup path were also
manually verified. The current Supabase Auth configuration does not require a
signup-confirmation OTP, so a successful signup can go straight to the account
handoff; reset-password OTPs remain required for password recovery.

### 4. Consumed by the web console (migrations 0022–0024)

Four surfaces this document previously listed under "Not yet built" now have an
API and are wired to the Platform page. Full reasoning for each decision
is in `backend/BACKEND_SCHEMA.md` §27; the short version, because each carries a
choice a reviewer should not have to rediscover:

| Surface | Endpoints | The decision baked in |
|---|---|---|
| **Withdrawal queue** | `GET /admin/withdrawals`, `POST .../settle` (accepts a payout reference), `POST .../reject` (accepts a reason) | Withdrawal requests land `pending` and settle only when an admin records that money actually moved. There is no payout rail, so this queue *is* the disbursement mechanism, not a review step in front of one. Settling re-checks the balance and can only fire once, whoever clicks |
| **Categories** | `GET`/`POST /admin/categories`, `PATCH /admin/categories/:id` | **No delete.** Jobs, provider profiles and the ML feature set all reference a category by id; `is_active: false` takes it off the menu without rewriting the jobs that used it. A duplicate name is a 409 |
| **Admin accounts** | `GET`/`POST /admin/admins`, `POST /admin/admins/:id/revoke` | **No password crosses the wire.** The new admin sets their own from a reset email. Revocation refuses self-demotion and refuses to remove the last admin — a console nobody can get into is not recoverable from inside the console |
| **Commission** | `GET`/`PATCH /admin/commission` | A **fraction**, not a percent: 0.15 is 15%, capped at 0.5. Applies at escrow release and freezes onto the escrow row, so settled jobs keep their figures. Defaults to 0 — nothing is withheld until someone deliberately sets it |
| **Broadcast** | `POST /admin/notifications/broadcast` | One notification row per recipient (read state and push are both per-row), excluding admins, suspended and deleted accounts. Returns `{ sent, failed }` — a partly-delivered broadcast reports the shortfall rather than throwing |
| **Recovery credit** | `POST /admin/wallet-transactions/recovery-credit` | Fungible once issued — spendable on a hire or withdrawable like any other peso, tagged `kind: 'recovery_credit'` for display only. `GET /admin/wallet-transactions?kind=recovery_credit` filters to them. Reasoning in `backend/BACKEND_SCHEMA.md` §28.1 |

An "Issue Credit" button on the Transactions page's Wallet tab
(`TransactionsPage.tsx`'s `WalletTab`) calls the recovery-credit endpoint
above: a recipient search (there's no dedicated "search users" endpoint, so
this filters the users already loaded app-wide), amount, title, and an
optional job id, refetching the wallet list on success rather than trusting
the mutation response (the insert has no joined profile name). The four
backend refusals — deleted recipient, `job_id` not theirs, over the ₱50,000
ceiling, unknown profile — surface verbatim instead of a generic error.
Verified via component tests (`TransactionsPage.test.tsx`) and that the route
now exists live (`401` instead of the earlier `404`) — a real admin
click-through also confirmed that the credit lands in the recipient's wallet
balance and ledger; the completed check is recorded in [`CHANGELOG.md`](./CHANGELOG.md).

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

## Deliberate tradeoffs (no action needed)

Called out because a reviewer will spot them and should know they were chosen,
not missed.

- **Mutations refetch the whole list** rather than patching from the response.
  Costs a small request; buys a table that stays correct when a bulk action
  partly fails.
- **One `AppContext` rather than split auth/UI/data contexts.** The value is
  `useMemo`'d, which removes the needless re-renders. A full split is real
  boilerplate for no measurable gain at this data volume.
- **Full-list queues have a 5,000-row safety limit.** Console queues are far
  below it today. If one approaches that size, move it to server-filtered
  pagination with matching totals, using existing backend pagination where
  available.
- **CSP is report-only.** The public site and older components still style
  inline, so an enforcing policy needs `'unsafe-inline'` for styles anyway, and Next injects inline hydration
  scripts. Tighten once the violation report is clean.

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
[`CHANGELOG.md`](./CHANGELOG.md), split into **Admin console**, **Public
website** and **Shared** parts, each newest first with category tags. Short version: the console started on mock
data, moved onto the real backend across migrations 0008–0014 and 0017, went
through hardening passes covering routing, security headers, destructive-action
confirmations, error handling, and accessibility, then had its visual design
and interaction patterns (pagination, row-selection, scoped CSV export)
ported from a design mockup to match it exactly. On 2026-09-29 the console
was rebuilt on a new design system (light and dark themes, ⌘K palette, live
refresh, keyboard work queues), keeping every feature and API call.

---

## Manual Verification

Completed checks are recorded in [CHANGELOG.md](./CHANGELOG.md).

- **Pending action verification:** approve/reject a verification,
  release/refund a dispute, settle/reject a withdrawal, reject a service
  request, cancel a booking with held escrow, Retry transfer, Issue Credit, Platform
  edits and a broadcast, Maintenance Mode on/off, and a password change.

## Build and tests

Run `npm test`, `npm run lint` and `npm run build` (see [Quick start](#quick-start)).
Results for each round are in [CHANGELOG.md](./CHANGELOG.md).

## Current Web Blockers

None currently confirmed. Backend requests still open are listed below;
pending action tests stay in [Manual Verification](#manual-verification).

## Needed Backend Work

**Detailed handoff:** [Web admin backend requirements](../docs/backend-handoff-web-admin.md).
Two things are needed. Neither blocks the working console; both enable Settings
features that are disabled today.

| Need | Backend work | Web follow-up |
|---|---|---|
| **Email admins on new provider verification** | Send one email to every active admin when a provider submits for verification. Always on, no duplicates, and a failed send must not block the submission. | Replace the disabled Notifications switch with a note once it works. |
| **Platform name and support email** | Store both once on the server (public read, admin-only update, stale edits rejected, changes audited). Used in the website footer and outgoing emails. **The support mailbox is not created yet**, so the email starts empty and the footer and emails show no contact line until it is set. | Settings shows the email as "Not set yet". Connect the fields and the footer. |

## October 4 review and withdrawal contracts

The dispute page supports participant complaints, cancellation statements and
appeals, admin clarification, and atomic release/refund decisions. Settled-payment
cases cannot release/refund a second time. A decision note is required.

Marking a withdrawal paid requires a nonblank bank/GCash reference (1–500
characters), enforced by both the form and API. This records external delivery;
it does not call a payout rail. The selected [payout demo](../test-docs/PAYOUT_VERIFICATION.md)
is a separate local simulator. Deploy matching API/migrations 0039–0045 before
using the new contracts. Deployed and physical-device evidence is pending.

Local gates: `npm run lint`, `npx --no-install tsc --noEmit`, `npm test`,
`npm run build`. The production build fetches the existing Google font and
requires approved network access. The live admin-login test stays skipped
unless explicitly configured with controlled credentials.

### Release verification (October 4, 2026)

The matching Supabase migrations and Render API are deployed. Web lint,
TypeScript checks, 227 tests and production build pass; one live-only test is
skipped. Deployment of this web revision still requires the existing Vercel
project owner. Local build/test results do not establish deployed admin UI
behavior. See [release evidence](../test-docs/RELEASE_VERIFICATION.md).
