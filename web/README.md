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

> **Status:** this worktree implements browser-admin cookie sessions,
> server-side list search/pagination, and the public promo site + customer
> auth flow (including forgot/reset password, verified against the live
> backend). External deployment and production smoke testing remain operator
> actions; this document does not claim they occurred.

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

**Hydration warning mentioning `data-gr-ext-installed`.** That's the Grammarly
browser extension editing `<body>` before React hydrates, not app code. Already
suppressed via `suppressHydrationWarning` on `<body>`.

**Everything renders empty / all zeroes.** Check for a red banner at the top of
the page — a failed data load shows there with a Retry button. If there's no
banner, the platform genuinely has no data yet.

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
- **An expired token is refreshed once** via `POST /auth/refresh` and the
  request retried, instead of bouncing the admin to the login screen.

```
src/
├── app/
│   ├── layout.tsx            # <html>, Inter via next/font — shared by both surfaces
│   ├── page.tsx              # "/" — public homepage (HomePage.tsx)
│   ├── robots.ts             # disallow ["/admin", "/account"]; "/" is indexable
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
│   ├── layout/               # Sidebar, Header (admin only)
│   ├── pages/                # HomePage + AccountPage (promo) and one per admin page
│   └── ui/                   # ConfirmDialog, Toast
├── styles/promo.css          # Scoped under `.promo-site` — doesn't affect /admin
├── context/AppContext.tsx    # Session, data, mutations, preferences (admin only)
└── lib/
    ├── domain.ts             # Backend-shaped domain types
    ├── routes.ts             # Page id ↔ /admin/<page> URL + page titles
    ├── validation.ts         # Shared rules, mirroring backend DTO limits
    ├── services/             # THE DATA SEAM (admin)
    ├── adapters/             # Domain → display rows
    ├── export/csv.ts         # Client-side CSV
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
| Sign Up | `POST /auth/register`, `POST /auth/send-email-otp` (if email confirmation is required) |
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
| Dashboard | `GET /admin/analytics/summary`, `GET /admin/activity` |
| Verifications | `GET /admin/verifications`, `POST .../approve` · `/reject` (accepts a reason) |
| Users | `GET /admin/users`, `POST .../suspend` (reason + optional duration) · `/reinstate` · `/send-password-reset` |
| Transactions | **Escrow:** `GET /admin/transactions` · **Wallet:** `GET /admin/wallet-transactions` (fetched when the tab opens) |
| Disputes | `GET /admin/disputes`, `POST .../resolve` (accepts a note), `GET /admin/jobs/:jobId/conversation` (on demand) |
| Bookings | `GET /admin/bookings`, `POST .../cancel`, `GET /admin/bookings/:id` (on row expand) |
| Activity Log | `GET /admin/activity` |
| Audit Log | `GET /admin/audit` |
| Reports | `GET /admin/analytics/summary` |
| Withdrawals | `GET /admin/withdrawals`, `POST .../:id/settle` · `POST .../:id/reject` |
| Platform | `GET`/`PATCH /admin/commission`, category CRUD, admin accounts, notification broadcast |
| Settings | `PATCH /profiles/me`, `POST /auth/change-password`, `GET`/`PATCH /settings`, `GET`/`PATCH /admin/maintenance` |

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
- **⚠️ Validation limits are duplicated on both sides.** `REASON_MAX_LENGTH` =
  500, `NOTE_MAX_LENGTH` = 1000, name ≤ 120 — these mirror the backend DTOs.
  **Change a limit on one side and it must change on the other**, or the UI
  will either reject valid input or let through what the API rejects.

---

## Backend Integration Status

**This worktree uses the backend integrations below.** An external deploy is
still required before they are available at a hosted URL.

> **New since this list was written:** `POST /admin/wallet-transactions/recovery-credit`
> exists now, so the Wallet tab's "Issue Credit" button is unblocked — see
> [Needs a web developer](#needs-a-web-developer). The API is also rate-limited
> (`backend/BACKEND_SCHEMA.md` §28.4), **per endpoint per IP** — 240/minute on
> any one route, and `POST /auth/admin/login` specifically 10/minute. The
> console is nowhere near that, with one exception worth knowing before it
> bites: a bulk action fires one request per id in parallel and they all hit
> the *same* handler, so selecting more than 240 rows and suspending them at
> once would start earning `429`s partway through. The existing
> "Suspended 3 of 5" per-id failure reporting already covers that honestly, but
> a `429` is worth retrying rather than reporting as a refusal.

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
tokens in the JSON body rather than setting cookies themselves (the same
contract `mobile` already uses). `web`'s own route handlers
(`app/api/auth/*`) are the thing that turns that JSON response into an httpOnly
`tb_account_access`/`tb_account_refresh` cookie pair — the backend never sees
a cookie for these.

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
backend to the real Google consent screen (it stops there today on
`redirect_uri_mismatch` — see [Needed to Move Forward](#needs-google-cloud-console-access));
a hand-crafted `google/callback` URL with fake tokens is rejected and sets no
cookie. The reset-with-a-real-code success path still needs a human checking
a real inbox — see [Needed to Move Forward](#needs-a-human-with-a-real-inbox).

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
- **CSP is report-only.** Every component styles inline, so an enforcing policy
  needs `'unsafe-inline'` for styles anyway, and Next injects inline hydration
  scripts. Tighten once the violation report is clean.
- **Inert Settings toggles are labelled, not removed.** Notifications, Platform
  and Data & Privacy save to this device only and say so. An honestly labelled
  non-functional toggle documents intent; a deleted one loses the requirement.

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

---

## Needed to Move Forward

Everything still open, grouped by **who** has to act — not by what kind of
gap it is. Once an item here ships, its story moves to
[`CHANGELOG.md`](./CHANGELOG.md) with the commit and how it was verified, and
it's removed from here — this list only tracks current, unstarted work.

### Needs a web developer

- **The "Issue Credit" button** on the Transactions page's Wallet tab
  (`TransactionsPage.tsx`'s `WalletTab`). **No longer blocked** — the endpoint
  it was waiting for now exists:

  ```
  POST /admin/wallet-transactions/recovery-credit
       { profile_id, amount, title, job_id? }  →  the created ledger row
  ```

  A row-level "credit this user" action is the natural shape, since the tab
  already has each row's `profile_id`; the modal needs `amount` and `title`
  (the recipient reads the title in their own transaction list), plus an
  optional `job_id`.

  Four errors worth surfacing verbatim rather than as "something went wrong",
  because each one is a thing the admin can fix: the recipient's account was
  deleted, the `job_id` doesn't belong to them, the amount is over the ₱50,000
  ceiling, and the profile doesn't exist. Reasoning for each guard is in
  `backend/BACKEND_SCHEMA.md` §28.1.

  The credit is **fungible** once issued — spendable on a hire or withdrawable
  like any other peso, tagged `kind: 'recovery_credit'` for display only. If the
  UI implies it can only be put toward a booking, it will be wrong.
  `GET /admin/wallet-transactions?kind=recovery_credit` filters to them.

### Needs Google Cloud Console access

Not code — a permission on the Google Cloud *project* that owns TaskBuddy's
OAuth client (client id `646218465005-...`). Whoever is an Owner/Editor there
can fix this in a couple of clicks; nobody without that project's access can.

- **Register the Google OAuth redirect URI.** Sign-In with Google is fully
  wired on our side (button → `/api/auth/google/start` → backend → the real
  Google consent screen) and verified that far — it stops at Google itself
  with `redirect_uri_mismatch`, because
  `https://taskbuddy-kpek.onrender.com/auth/google/callback` isn't on that
  OAuth client's allowed-redirect-URIs list. Add it in Google Cloud Console
  → APIs & Services → Credentials → that OAuth 2.0 Client ID → Authorized
  redirect URIs, and this works end-to-end with no further code changes. A
  one-time registration for the app itself — not something repeated per user.

### Needs a human with a real inbox (testing)

No special access required — just someone willing to sign up (or request a
reset) with a real, checkable email address.

- **Verifying the reset-password and signup-OTP success path.** The
  request/response handling is already verified (see
  [Backend Integration Status §3](#3-public-site-customer-auth--password-reset))
  — what's left is confirming the actual email arrives and the real code in
  it works. No amount of automated testing substitutes for that.
