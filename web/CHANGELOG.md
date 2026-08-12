# Changelog — TaskBuddy Admin Console

Detailed history for the admin console (`web/`). The README covers how the
app works today; this file covers how it got there and why. Newest first.

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
  [Backend Requests to Evaluate](./README.md#needs-backend-work-for-review).
- Mutations refetch the whole list rather than patching state from the
  response. Deliberate — it's what keeps a table honest when a bulk action
  partly fails — but a fair future optimisation.


---

## Backend follow-ups (migrations 0014, 0017)

**All nine items below are shipped and wired up** — nothing here is
outstanding; it's kept as a record of what closed. For what's still missing,
see [Backend Requests to Evaluate](./README.md#needs-backend-work-for-review).

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
