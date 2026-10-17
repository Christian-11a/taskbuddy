# Feedback fixes — backend done, client next steps

Branch: `fix/input-sanitization` (based on `origin/main` at `c6e6cbe`).
New migrations: **0062** (service radius bounds) and **0063** (job dispute
state). Apply both before deploying the API.

| # | Item | Backend status | Commit |
|---|------|----------------|--------|
| 1 | Sanitize inputs | Done | `88db597` |
| 2 | Urgency hint copy | Client-only (text is hard-coded in mobile) | — |
| 3 | Service radius min/max | Done, 1–50 km | `1be604b` |
| 4 | Notification routing | Done (`target` on every notification) | `a180454` |
| 5 | Checklist checkboxes after hire | Already supported | — |
| 6 | Camera for proof photos | Already supported (JPEG/PNG/WebP uploads) | — |
| 7 | Checkbox alignment | Client-only | — |
| 8 | Whole chat in appeals | Done | `85be73a` |
| 9 | Payout account before proposing | Done | `be91d70` |
| 10 | Disputes in job status | Done (`display_status`) | `f2c7008` |
| 11 | No withdrawal requests | Already automatic; stale copy fixed | `f18da77` |
| 12 | Emphasize admin commission | Done (`GET /admin/commission` totals) | `e1c6d55` |

---

## What changed in the API (contract for mobile & web)

### 1. Input sanitization
- Admin search (`GET /admin/users?search=`, bookings, activity, audit) now
  treats the text literally: `,` `(` `)` `%` `_` no longer change the query.
  Blank or whitespace-only searches are ignored. `search` max length is 100
  for users and bookings, and 200 for audit.
- Chat cursors were already strictly validated.
- **Clients:** add `maxLength` to search inputs and show the 400 message.

### 3. Service radius
- `service_radius_km` must be **1–50**. Anything else returns 400 with
  `service_radius_km must be at least 1 km` or `… at most 50 km`.
  Default is 15. Existing rows were clamped into range by migration 0062.
- **Mobile/Web:** use a slider or stepper bounded to 1–50, label it "1–50 km",
  and validate inline before saving.

### 4. Notification routing
Every notification from `GET /notifications`, `/notifications/page`,
`/notifications/snapshot` and the SSE stream, as well as every push `data`
payload, now has:

```json
"target": { "screen": "job" | "dispute" | "payouts" | "verification" | "skill_requests" | "notifications", "job_id"?: "…", "request_id"?: "…" }
```

- **Mobile:** in the Expo notification-response listener and the
  notifications list, switch on `target.screen` and route to the role's
  screen (client vs provider job details, dispute screen, payouts, and so
  on). Fall back to the notifications screen. Chat pushes keep their
  existing `type: 'chat'` handling.
- **Web:** make each notification row a link built from `target`.

### 8. Whole chat in appeals
- Dispute responses (`GET /jobs/:jobId/disputes`, `GET /admin/disputes`)
  include `chat: { conversation_id, message_count }`.
- `message_id` on `POST /disputes/:id/entries` and
  `/cancellation-response` is **deprecated**. It is still accepted, so don't
  send it from new builds.
- **Mobile:** remove the "pick a message" step from the appeal and
  cancellation-response forms, and show "Your full chat with the other party
  is attached".
- **Web admin:** in the dispute view, show the transcript from
  `GET /admin/jobs/:jobId/conversation` (paginate with `before`).

### 9. Payout account before proposing
- `POST /jobs/:id/applications` returns **403** with
  `{ code: 'payout_account_required' }` when the provider has no linked
  payout account. This runs after the existing `verification_required` check.
- **Mobile/Web:** after verification, add a "Link payout account" onboarding
  step using `GET /payouts/account`, `GET /payouts/banks` and the link
  endpoint. Disable "Propose" with a call to action while there is no
  account, and handle the new code the same way as `verification_required`.

### 10. Disputes in job status
- Jobs now carry `dispute_state` (`null` | `'open'` | `'resolved'`), kept in
  sync with the disputes table by a trigger (migration 0063).
- Job reads return `display_status`, which is `'disputed'` while a dispute is
  open and otherwise equals `status`. `status` itself is unchanged, so
  existing logic keeps working.
- **Mobile/Web:** use `display_status` for badges and status chips, and add a
  "Disputed" style and filter. While it is `disputed`, hide the complete,
  cancel and release actions and show a banner linking to the dispute.
- **Follow-up (backend, optional):** add a `disputed` option to the admin
  bookings status filter (`admin_list_bookings` RPC).

### 11. Withdrawals
- No provider withdrawal endpoint exists. On release, money goes to the
  linked account automatically, and failed payouts are retried every
  payments tick.
- **Mobile:** remove any leftover "Withdraw" or "Request withdrawal" UI. Show
  payout history from `GET /payouts/history` with Sent, Pending and Failed
  states. A failed payout should prompt the provider to check their account.
- **Web admin:** relabel the withdrawals queue as legacy or failed payouts,
  or hide it when empty.

### 12. Admin commission
- `GET /admin/commission` now returns
  `{ commission_rate, updated_at, total_earned, earned_this_month, released_jobs, pending_estimate }`.
- The dashboard already returns `totals.total_commission`,
  `totals.monthly_commission` and `commission_trend`.
- **Web admin:** make **Total commission earned** the headline KPI card on
  the dashboard, larger than revenue, with a "this month" figure and the
  trend chart. On the commission settings page, lead with the earned totals
  and the pending estimate, above the rate input.

---

## Client-only items

| # | Mobile | Web |
|---|--------|-----|
| 2 | `mobile/app/(homeowner)/screens/HOCreateJobScreen.tsx:1244`: change the Urgent blurb from "You need someone today" to a generic line, e.g. "As soon as possible". Update `UrgencyRow.test.tsx` to match. | Same copy, if the web has the post-job form |
| 5 | On the hired job screen, render `job_tasks` as checkboxes. The provider ticks them through `PATCH /jobs/:id/tasks/:taskId` with `is_done` and `proof_photo_paths` (at least one photo, only while `in_progress`). The client sees them read-only. | Same, read-only for the client |
| 6 | Add "Take photo" with `expo-image-picker` `launchCameraAsync` next to the gallery picker. Request camera permission, add the iOS/Android camera usage strings to `app.json`, and upload JPEG (keep the picker's default conversion; HEIC is not accepted). | `<input type="file" accept="image/*" capture="environment">` |
| 7 | Checklist row: `flexDirection: 'row'`, `alignItems: 'center'`, fixed-width checkbox and a consistent gap, so labels that wrap stay aligned. | Same with flex/grid |

## Release order
1. Apply migrations 0062 and 0063, then deploy the API. Every change is
   backwards compatible with current app builds.
2. Ship mobile and web: routing, payout gate, `display_status`, appeal form,
   radius input, copy, camera, and alignment.
3. Later: stop accepting the deprecated `message_id` once old builds age out.
