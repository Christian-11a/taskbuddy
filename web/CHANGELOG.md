# Changelog — TaskBuddy Web

Detailed history for `web/` (public promo site + admin console). The README
covers how the app works today; this file covers how it got there and why.
Newest first.

---

## Fixed: login-CSRF hole in the Google callback, plus a full re-check

`/api/auth/google/callback` trusted `access_token`/`refresh_token`/`expires_at`
straight off the query string with nothing verifying they'd just come from a
real Google round-trip. Anyone could craft that URL using tokens from an
account *they* control and get a victim to click it — the victim's browser
would then be silently signed into the attacker's account (a "login CSRF" /
session-fixation pattern). The backend's own OAuth exchange already has solid
protection here (signed HMAC state, nonce, expiry, constant-time comparison
— confirmed by reading `handleGoogleCallback`), but that only protects the
backend's callback; it says nothing about who ends up on *ours* afterward.

- **`_session.ts`**: added `setGoogleNonce()`/`consumeGoogleNonce()` — a
  random one-time value stored in a short-lived (10 min) httpOnly cookie,
  compared with `timingSafeEqual`.
- **`google/start`**: mints the nonce and stamps it onto the callback URL we
  hand the backend as `app_redirect` (`appendRedirectParams` on the backend
  preserves that query string, so it survives the whole Google round-trip
  unchanged).
- **`google/callback`**: checks the nonce *first*, unconditionally, before
  even looking at `google_error` or the tokens — a mismatch or missing nonce
  now redirects to Sign In with "That sign-in link is invalid or has
  expired." and never touches the session cookie.

Verified live: a hand-crafted `google/callback?access_token=fake&...` URL is
now rejected with no cookie set (confirmed via `document.cookie` staying
empty); the real flow still reaches the actual Google consent screen
unchanged.

**Then went back over everything else, not just this fix**, since a targeted
patch is easy to trust too much on its own:

- Full production `next build` (not just `tsc --noEmit`) — clean, all 30
  routes compiled.
- `npm run lint` surfaced **353 problems**, nearly all of them from
  `gsap.min.js`/`ScrollTrigger.min.js` never being excluded — added
  `public/**` to `eslint.config.mjs`'s ignores (vendor bundles and
  `auth.js`/`script.js` are intentionally plain ES5 for the static site, not
  TypeScript app source). Fixed the two real findings underneath the noise:
  an unescaped apostrophe in `CompleteProfileForm.tsx` (error), and
  documented (rather than silently ignored) its one intentional
  `window.location.href` hard-navigation, which matches the same
  cookie-reload pattern used everywhere else in the auth flow. Lint went from
  353 problems (11 errors) down to 1 pre-existing, unrelated warning
  (`no-page-custom-font`, a Pages-Router-era rule that doesn't really apply
  under App Router).
- Re-swept the ported HTML for any other instance of the "unregistered hash
  closes the modal" bug class (the same root cause as the Terms/Privacy fix
  below) — confirmed no others exist.
- Full backend suite — 247/247 tests across 25 suites, plus `tsc --noEmit`.
- `npm test` (web) — 114/114, unchanged.

---

## Fixed: Google button had no accessible name

Its label is CSS-generated content (`content: "Continue with Google"` on a
`::after`), which some browsers/screen readers don't reliably expose as the
element's accessible name — confirmed via the accessibility tree, which
reported it as an unnamed button. Added `aria-label="Continue with Google"`
to both instances (Sign In and Sign Up panels) in the source prototype and
regenerated `HomePage.markup.ts`. Verified live: the accessibility tree now
reports the button's name correctly.

---

## Fixed: Terms/Privacy links closing the auth modal, and added real content

The Sign Up panel's Terms & Conditions / Privacy Policy links were plain
`<a href="#terms">`/`<a href="#privacy">` — clicking either changed the URL
hash to something `HASH_TO_PANEL` doesn't recognize, which `syncFromHash()`
treats as "no matching panel" and closes the whole modal. They also went
nowhere: no terms or privacy content existed on the site at all.

- **`auth.js`**: the links now carry `data-open-doc="terms"`/`"privacy"` and
  their click handler calls `preventDefault()` before showing a new document
  panel — the hash never changes, so the modal-closing bug can't fire.
  Reading is optional: a checkbox can always be checked directly, same as
  before. Only clicking the link opens the real text; an "I agree to the ___"
  button at the bottom checks that one checkbox and returns to whichever
  panel (currently always Sign Up) the link was opened from, tracked via
  `link.closest(".auth-panel")` rather than hardcoded, so this generalizes if
  another panel gains its own consent links later.
- **Real content**, ported verbatim from `mobile/app/(auth)/screens/TermsAndConditions.tsx`
  (the mobile app already had this copy; the web app never did) — same
  sections, same wording, for both documents.
- **`CompleteProfileForm.tsx`** (the Google role-selection page from the
  entry below) had the identical dead-link problem with its own consent
  checkboxes — fixed the same way, as in-component state
  (`docView: "terms" | "privacy" | null`) rather than the hash-panel
  mechanism, since that page isn't part of the ported-HTML modal system. The
  content lives once, in `legalDocs.ts`, imported by that component; `auth.js`
  has its own copy of the same text since it's a static file with no bundler
  to share a TS module with — kept in sync by hand, both sourced from the
  same mobile screen.

Verified live in both places: clicking a link no longer closes the modal, the
real content renders, "I agree" checks the box and returns to the form with
the rest of the entered data intact, and checking the box directly (without
opening the link) still works exactly as before. `tsc --noEmit` clean,
`npm test` still 114/114.

---

## Docs cleanup: open items grouped by who has to act

README's "Backend Requests" and "Not yet built / needs a human" sections were
two separate lists of the same kind of thing — open work — split by an
arbitrary line (backend vs. everything else) rather than by what actually
matters when picking one up: **who is unblocked to act on it**. A recovery-
credit endpoint (needs a backend developer) and a Google Cloud Console
permission (needs project access, zero code) don't belong in the same
decision-making bucket just because both happened to sit outside `web`'s own
code.

Merged both into one **"Needed to Move Forward"** section, grouped into three
subsections: **Needs a backend developer** (repo + deploy access), **Needs
Google Cloud Console access** (a dashboard permission on one specific
project, no code), and **Needs a human with a real inbox** (no special access
at all). Same rule as before applies going forward: once something here
ships, its story moves to this changelog and the item is removed from
README, not left behind as a resolved trophy.

---

## Role-selection step for a first-time Google signup

Closed the last piece the Google Sign-In pass below left open: a brand-new
Google signup used to land straight on `/account` with no role — the backend
flags this via `profiles.google_signup_pending`, and mobile already solves it
with `GoogleRoleSelectionScreen`/`GoogleSPDetailsScreen` calling
`POST /auth/complete-google-profile`.

- **`/account/complete-profile`** (new, real React page — not ported HTML
  like the rest of the promo site, since there's no static-prototype design
  for it to match) reuses the existing `auth-modal`/`auth-role-switch`/
  `auth-consents` CSS classes so it looks native to the auth flow: role
  toggle (Homeowner/Service Provider), skill category when Provider is
  selected, the same four consent checkboxes Sign Up has. Submits to a new
  `POST /api/auth/complete-google-profile` route (CSRF-guarded like the rest,
  reads the session cookie server-side same as `/account` does) and redirects
  to `/account` on success.
- **`/account`** now inspects `profile.google_signup_pending` (from
  `GET /auth/me`) and redirects to `/account/complete-profile` instead of
  rendering the handoff page when it's still true.

Verified live (the gate, not the full round-trip, since that needs a signed-in
Google session): visiting `/account/complete-profile` without a session
redirects to `/#login`, correct; toggling Service Provider correctly reveals
the skill-category select and the biometric consent checkbox. `tsc --noEmit`
clean, `npm test` still 114/114.

---

## Google Sign-In wiring, CSRF guard, and a sitemap

Three items closed from README's "Not yet built" list:

- **Google Sign-In.** The button already existed in the ported HTML (its
  label is CSS-generated content — `content: "Continue with Google"` on a
  `::after` — which is why earlier text-searches of the markup missed it) but
  had no click handler. Wired it up via two new routes rather than pointing
  the browser at the backend directly, keeping `API_URL` server-side like
  every other route here: `GET /api/auth/google/start` redirects to the
  backend's `/auth/google/authorize` with `app_redirect` set to this app's own
  `/api/auth/google/callback`; that route reads the tokens the backend's
  callback appends to the query string, sets them via the same
  `setAccountSession()` login/register use, and redirects to `/account` (or
  back to `/#login` with `?google_error=...`, which `auth.js` now surfaces in
  the Sign In panel's status line on load). Verified live end-to-end through
  the real backend and the real Google consent screen — it stopped there with
  `redirect_uri_mismatch`, because `https://taskbuddy-kpek.onrender.com/auth/google/callback`
  isn't registered as an allowed redirect URI on that Google Cloud OAuth
  client. Not a code problem; needs whoever has access to that Google Cloud
  project to add it. The post-first-Google-signup role-selection step
  (`POST /auth/complete-google-profile`, mirroring mobile's
  `GoogleRoleSelectionScreen`) still isn't built — a new Google signup lands
  on `/account` with an incomplete profile for now.
- **CSRF protection for `/api/auth/*`.** Added `isSameOriginRequest()` to
  `_session.ts` (checks `Origin`, falling back to `Referer`, against the
  request's `Host`) and applied it to all six route handlers. Verified a
  normal same-origin submit still 200s.
- **`sitemap.ts`.** Lists just `/` — `/account*` and `/admin/*` are already
  excluded via `robots.ts` and have no business being crawled.

Verified after all three: `tsc --noEmit` clean, `npm test` still 114/114.

---

## Docs cleanup: README stopped duplicating this changelog

README's "Backend Requests → Resolved" subsection and its separate
"Not yet built" recovery-credit note were narrating the same shipped work
already recorded in the "Component tests, and verifying the cookie/CSRF auth
rework" and "Platform administration surfaces" entries below — two places
that drift apart the moment only one gets updated (this file didn't get
today's changes until this pass either). Going forward: **README describes
only current, actionable state** — what's live, and what's still genuinely
missing (`Backend Requests`, `Not yet built / needs a human`). Anything
resolved gets its story told here, with a date, and removed from README
rather than kept as a trophy case.

---

## Public promo site, real customer auth, and the admin move to `/admin/*`

The admin console used to be the whole app, at root-level routes (`/login`,
`/dashboard`, …) by deliberate earlier design. That stopped being possible
once the team's approved static prototype
(`taskbuddy-product-reference/public-site/`) needed to become the real `/` —
so this pass did both migrations together, since one forced the other.

- **Admin moved to `/admin/*`.** `login/page.tsx` → `admin/login/page.tsx`;
  `(admin)/*` → `admin/(admin)/*`. `lib/routes.ts` updated
  (`pageToPath`/`pathToPage`/`LOGIN_PATH`) so every existing call site
  (`Sidebar`, `Header`, `DashboardPage`, `not-found.tsx`, `error.tsx`) picked
  up the new paths without further changes. `AppProvider`/`ToastProvider`
  moved out of the root layout into a new `admin/layout.tsx` so they only run
  for `/admin/*` — they were firing session-restore 401s against the public
  homepage otherwise.
- **Public homepage at `/`**, ported from the static prototype's
  `index.html` via `dangerouslySetInnerHTML` (`HomePage.markup.ts`, generated
  from the prototype HTML by a small script, never hand-edited) rather than
  hand-transcribing hundreds of data-attribute-driven interactive elements
  into JSX. GSAP + ScrollTrigger loaded via `next/script`; `styles/promo.css`
  scoped under a `.promo-site` wrapper (via CSS `@scope`) so it can't leak
  into `/admin/*`'s own token system, and vice versa.
- **Sign In / Sign Up / Forgot Password / Reset Password**, designed as a
  single modal driven by `location.hash` (`#login`, `#signup`, `#forgot`)
  rather than separate pages, matching the flow the team approved in the
  static prototype. `/account/login` and `/account/signup` exist only to give
  the modal a stable, shareable URL to redirect from — the homepage never
  unmounts underneath it. Wired to the backend's real customer endpoints
  (not a placeholder): `register`, `login`, `logout`, `me`,
  `forgot-password`, `reset-password`, `send-email-otp`, `verify-email-otp`,
  via new route handlers under `app/api/auth/*` that convert the backend's
  JSON-token response into httpOnly `tb_account_access`/`tb_account_refresh`
  cookies (the web equivalent of mobile's SecureStore).
- **`/account`** is the real, session-gated handoff page (checks `GET
  /auth/me` server-side) — honest "your account is ready" copy, no fake
  dashboard or download link, since the mobile app isn't released yet.
- **Verified live against the deployed backend**, not just read: Sign In,
  Sign Up, Forgot Password (200s, transitions to the Reset panel with the
  email prefilled), and Reset Password's error path (an invalid/expired code
  correctly surfaces the backend's "Token has expired or is invalid" instead
  of a generic failure). The reset-with-a-valid-code success path still needs
  a human checking a real inbox — see
  [README → Needed to Move Forward](./README.md#needs-a-human-with-a-real-inbox).
- **Admin login page redesigned** from a generic split-panel/gradient
  template to a single centered card, using new theme-invariant
  `--login-card`/`--login-card-border` tokens in `globals.css`.
- **Branding split, deliberately:** `public/promo/taskbuddy-logo.png` (deep
  blue, promo site) is a separate file from `public/taskbuddy-logo.png`
  (light cyan, admin) — not a duplicate-asset bug. Favicon overrides follow
  the same split: root `app/favicon.ico` (promo blue) vs.
  `app/admin/icon.png` (admin cyan).
- **`robots.ts`** changed from blanket `disallow: "/"` to
  `disallow: ["/admin", "/account"]` — the public site is meant to be
  indexed; the admin console and the session-gated handoff page are not.
- **Google OAuth redirect allowlist** (`backend/src/auth/google-redirect.ts`)
  extended to allow `https://taskbuddy-nine-zeta.vercel.app` alongside the
  existing localhost/app-scheme/Expo rules — required before "Sign in with
  Google" can work on the deployed site rather than only in local dev.
  Covered by new cases in `google-redirect.spec.ts` (prod host allowed over
  https, rejected over plain http, rejected as a smuggled subdomain).
- Fixed along the way: a global `overflow: hidden` on `html, body` in
  `globals.css` (scoped originally for the admin's fixed-shell layout) was
  silently breaking scroll on the new public homepage, since both surfaces
  shared one root layout — removed, since both admin surfaces already
  self-manage overflow at their own wrapper level.

---

## Platform administration surfaces

Added the web integrations and UI for the backend work in migrations 0022–0024:

- `/withdrawals` provides the human settlement queue with payout references,
  rejection reasons, status filters, and partial/error feedback.
- `/platform` manages commission, service categories, admin accounts, and user
  announcements.
- Dashboard now shows commission and pending-withdrawal signals; Users can
  explicitly find deleted accounts without exposing them to moderation actions.

Recovery-credit issuance remains intentionally absent until its dedicated admin
endpoint exists.

---

## Component tests, and verifying the cookie/CSRF auth rework

Commit `fe2356d` ("align backend with current clients", 2026-08-17) replaced
`localStorage` session tokens with httpOnly cookies + CSRF and added
server-side search/pagination — resolving both items previously listed under
"Needs backend work" here. This pass verified that rework and closed the
remaining testing gap:

- **Component tests added.** React Testing Library + `@testing-library/user-event`
  installed; `vitest.config.ts` now also picks up `*.test.tsx`, with a
  `vitest.setup.ts` for `@testing-library/jest-dom` matchers and RTL cleanup
  between tests (not using vitest's `globals` mode, so cleanup has to be
  explicit). New coverage: `ConfirmDialog` (open/close, Escape, backdrop
  click, busy-state button disabling, focus trap), `Toast` (success vs. error
  role/dismiss-timing, manual dismiss), and `UsersPage`'s suspend flow
  end-to-end — reason-required validation, an error toast on a rejected
  request instead of failing silently, and the confirm button disabling
  during an in-flight request so a slow network can't double-submit. 114
  tests total (was 93).
- **Auth flow verified against the deployed API**, not just read: logged in
  against `taskbuddy-1d48.onrender.com`, confirmed the httpOnly access/refresh
  cookies and readable CSRF cookie are set, `GET /auth/admin/session`
  round-trips, a mutation without `X-CSRF-Token` is rejected with 403 and the
  same request with the header reaches DTO validation, `POST
  /auth/admin/refresh` rotates the cookie/CSRF pair, and `POST
  /auth/admin/logout` actually clears the session (subsequent `/session` call
  401s). No regressions found.
- **README restructured**: the old numbered "Known gaps" list became
  "Backend Requests", split into Needed and Resolved subsections. (Later
  trimmed to just Needed — see the docs-cleanup entry above.)

---

## Visual/UX port from the design mockup

The console's visual design and several interaction patterns were ported from
a static HTML mockup (`web-admin-taskbuddy.html` / `TaskBuddyCompleteRefinement.md`,
both outside `web/`) into the real app, matching it exactly rather than
approximating — spacing, colors, button sizing, terminology, and behavior.

- **Terminology:** "Customer" → "Homeowner" everywhere it's user-facing copy
  (labels, filters, CSV headers). Backend-contract values (`role: "client"`,
  `clientName` fields) are untouched — those are wire identifiers, not display
  text.
- **Dashboard KPIs are computed from real data, not copied from the mockup's
  example numbers.** "New users this month", "active provider share", and
  "bookings this month" are all derived from `AppContext` data (real date
  math against `createdAt`, real ratios) rather than the mockup's static
  placeholders. Recent Activity is capped to the latest 7 with a "View
  activity" link to the full log, instead of dumping the whole feed inline.
- **Global header is static** ("TaskBuddy Admin"), not a per-page title — the
  page's own heading already says what page it is, so the header no longer
  duplicated it.
- **Client-side pagination** (`components/ui/Pagination.tsx`, 7 rows/page)
  added to Users, Bookings, Transactions (both tabs), Activity Log, and Audit
  Log — previously these rendered every row from the 200-row fetch in one
  unbroken list.
- **Row-selection + scoped CSV export** on Users, Bookings, and Transactions
  (both Escrow and Wallet tabs): checkboxes are hidden by default and reveal
  on row hover (pure CSS, `.row-checkbox` / `.always-visible` in
  `globals.css`) so they don't clutter the table until the admin starts
  selecting. "Select all" covers every row matching the current search/filter,
  not just the visible page. Export downloads the checked rows when any are
  checked, otherwise everything currently filtered — the button label and
  confirm-dialog row count always say which. Verifications got an "Export
  queue" button but deliberately **no** row selection — per the mockup doc's
  explicit "no bulk actions on Verifications" rule (§28), it stayed a
  one-at-a-time review queue.
- **Shared `ReviewDrawer` component** (`components/ui/ReviewDrawer.tsx`)
  replaces the old inline row-expand pattern on Users, Verifications, and
  Disputes — a slide-out panel matching the mockup, with focus-trap + Escape
  handling modeled on `ConfirmDialog`.
- Exact visual fixes caught by direct comparison against the mockup: a
  missing `border` property on `.badge` was silently nullifying every
  per-instance badge color override; the Users drawer's "Close" button was
  missing `flex-1` so it rendered tiny next to a stretched "Suspend Account";
  Suspend Account was amber instead of the mockup's solid maroon (`#8b3b3b`).
- Search boxes capped to the mockup's `max-width: 360px` (Bookings intentionally
  stays full-width, matching the mockup's own override).

Verified after every change: `tsc --noEmit`, `npm test` (93 tests), and live
browser checks (screenshots + `getComputedStyle` opacity checks for the
hover-reveal checkboxes, not just visual inspection).

---

## Hardening passes

Kept short on purpose — the point is that a later audit doesn't re-flag
something already handled. Grouped by what changed, not when.

**Routing & shell**
- A real URL per page (see [Routing](./README.md#routing)); refresh, bookmarks, deep
  links and the back button all work.
- Error boundary + custom 404 (`app/error.tsx`, `app/not-found.tsx`) — a
  throwing component used to blank the whole console.

**Security & platform**
- Security headers in `next.config.ts`: `X-Frame-Options: DENY`, `nosniff`,
  `Referrer-Policy`, `Permissions-Policy`, and a CSP in **report-only** mode
  (enforcing it would need `'unsafe-inline'` anyway while the app styles
  everything inline; tighten once the report is clean).
- `robots.txt` + `noindex` — the console holds real user PII and had nothing
  stopping a crawler.
- Inter self-hosted via `next/font/google` instead of a runtime
  `fonts.googleapis.com` import.
- Dependencies: `next` 16.2.9 → 16.3.0 and a backend `npm audit fix`. Both
  packages now report 0 vulnerabilities.

**Destructive actions & validation**
- Shared `components/ui/ConfirmDialog.tsx` now guards cancel booking, reject
  verification and resolve dispute — none of them used to confirm at all. It
  portals to `document.body` (a `position: fixed` child of a transformed
  ancestor is positioned against that ancestor, which is why the sidebar's
  logout dialog rendered off-centre), traps Tab, restores focus on close, and
  closes on Escape.
- Reject verification and resolve dispute now send the reason/note the backend
  has always accepted — every entry in the audit trail used to be blank.
- Length counters on reason/note fields, matching the backend's `@MaxLength`.
  `NAME_MAX_LENGTH` was 60 against a backend limit of 120, so valid names were
  being rejected client-side.
- `validateDurationDays()` bounds suspensions (whole numbers, 1–3650). A
  `type="number"` field happily accepts `1e5`.
- Double-submit guards on reinstate and cancel booking.

**Data, errors & feedback**
- `getTransactions()` shares one in-flight request. `AppContext` called it and
  `getDisputes()` (which needs the same list) in one `Promise.all`, so every
  login fetched `/admin/transactions` twice.
- `loadError` + `retryLoad()` surfaced as a banner in the `(admin)` layout. A
  non-401 failure used to stop the spinner silently, leaving every page
  showing empty tables indistinguishable from "no data".
- `components/ui/Toast.tsx` for action feedback. Every mutation handler was
  `try { … } finally { clear busy }` with **no `catch`** — a failed
  approve/suspend/cancel/resolve rejected into nothing and the admin assumed
  it worked.
- Bulk actions return `{ succeeded, failed }` so partial failures are
  reported ("Suspended 3 of 5") instead of silently swallowed.
- Every list page distinguishes loading / empty / no-match. Users and Bookings
  had no empty state at all, and a bare "No users yet" during a 60s cold start
  is a confident lie.
- Context value is `useMemo`'d — rebuilt inline, any state change re-rendered
  every `useApp()` consumer, so collapsing the sidebar re-rendered the users
  table.

**Bulk selection safety**
- Selection now clears whenever search or a filter changes. Bulk actions act
  on the id set, not on what's rendered, so a selection that survived a filter
  change could suspend or reject records the admin could no longer see — while
  the bar still claimed "5 selected".

**Accessibility**
- Accessible names on all search inputs, checkboxes (including select-all),
  row expanders (which also carry `aria-expanded`), and the three icon-only
  header buttons (the bell also announces its unread count).
- Settings toggles are `role="switch"` + `aria-checked` — the label is a
  sibling `<div>`, so they previously announced as an unnamed "button".
- The verification document lightbox gets the same treatment as ConfirmDialog:
  Escape to close, Tab trapped inside it, and focus restored on close.
- Escape closes the mobile navigation drawer — previously only the overlay or
  a link could dismiss it, neither reachable by keyboard.
- Form fields are programmatically labelled: `htmlFor`/`id` on Login and the
  Settings `Field` (via `useId`, so the pair is stable across server and
  client render), `aria-label` on the placeholder-only suspend/reject/resolve
  inputs. A placeholder disappears once a field has a value, so it can't
  serve as the accessible name, and an unassociated `<label>` is decoration.
  Settings errors also wire `aria-invalid` + `aria-describedby`.
- The notification footer links to whichever queue it's showing; it always
  said "View all verifications" even when every item was a dispute.
- Settings' save button is scoped to "Save account changes" — everything else
  on that page persists on change, so one button labelled "Save Changes"
  implied it committed the whole page.

**Known limits**
- Verified by hand in a browser (routing, auth gate, confirm dialogs, error
  banner + retry, toasts, loading states). There are still **no component
  tests** — the 93 automated tests all cover `lib/`. Adding React Testing
  Library is the obvious next step.
- Pagination UI now exists client-side (see the mockup-port pass below), but
  it still pages over a flat 200-row fetch, so row 201 is invisible. Blocked
  on backend `search` params; see
  [Needed to Move Forward](./README.md#needs-a-backend-developer).
- Mutations refetch the whole list rather than patching state from the
  response. Deliberate — it's what keeps a table honest when a bulk action
  partly fails — but a fair future optimisation.


---

## Backend follow-ups (migrations 0014, 0017)

**All nine items below are shipped and wired up** — nothing here is
outstanding; it's kept as a record of what closed. For what's still missing,
see [Needed to Move Forward](./README.md#needs-a-backend-developer).

Migrations 0014 and 0017 shipped the backend (`backend/BACKEND_SCHEMA.md`
§23–25), and the console calls every one of these endpoints. (0017 was
renumbered from 0015 after a teammate's signup/OAuth work claimed 0015–0016
first — no schema change, filename only.)

1. **Timed suspensions, with a reason.** The Suspend action in Users (single
   and bulk) now opens an inline prompt requiring a reason and taking an
   optional duration in days — `POST /admin/users/:id/suspend` refuses an
   empty reason, matching backend validation. A suspended user's detail row
   shows `suspended_until`/`suspension_reason` from `admin_user_overview`.
2. **Admin-triggered password reset.** A user's expanded detail row (Users
   page) has a "Send password reset" button calling
   `POST /admin/users/:id/send-password-reset`; hidden for admin accounts,
   which the backend refuses anyway.
3. **Booking detail endpoint.** Expanding a Bookings row now fetches
   `GET /admin/bookings/:id` on demand (cached per id) and renders
   description, address, scheduled time, escrow status, and job photos below
   the fields the list already had.
4. **Activity Log pagination and date filtering.** `GET /admin/activity`
   returns `{ items, total }`; `getRecentActivity()` unwraps `.items`. The
   Dashboard feed shows the latest 7 with a link to the full log; the Activity
   Log page itself now has client-side pagination (see the mockup-port pass
   below) over everything the backend returned. Date-range filtering
   (`from`/`to`, already accepted by the backend) isn't wired to any UI yet.
5. **Real admin audit log.** A new **Audit Log** page (own sidebar entry)
   lists `admin_actions` — every suspend/reinstate/cancel/verification
   decision/dispute resolution — with the acting admin, target, reason (from
   metadata), and timestamp, via `GET /admin/audit`.
6. **Admin read-only access to a job's chat.** Each dispute's expanded row has
   a "View conversation" toggle that fetches
   `GET /admin/jobs/:jobId/conversation` on demand and renders the messages
   oldest-first, read-only.
7. **Verification submission pre-check.** `POST /verifications` now rejects a
   missing/zero-byte/non-image upload before inserting the row. This is
   mobile-side (the provider's submission flow), so there was nothing for the
   admin console to wire up.
8. **Real Maintenance Mode.** The Settings toggle used to only flip a
   `localStorage` flag — turning it on did nothing to the actual app. It now
   calls `GET`/`PATCH /admin/maintenance` (migration 0017), and a global
   `MaintenanceMiddleware` blocks every non-admin, non-auth request with 503
   while it's on. The toggle lives in its own **Maintenance** section on
   Settings, separate from the still-fake Platform/Notifications/Data &
   Privacy sections below, and shows a live warning banner while active.
9. **Admin wallet visibility.** The Transactions page has a second tab,
   **Wallet**, alongside the existing **Escrow** tab. It calls
   `GET /admin/wallet-transactions` (migration 0017) and shows every top-up,
   withdrawal, and escrow payout/refund — including Stripe Checkout top-ups
   (PR #35), which before this were visible only in Stripe's own dashboard,
   not anywhere in TaskBuddy itself.
