# Backend requests from the web admin team

**Updated:** 2026-10-15

**Scope:** the web admin console. Mobile appears only where a shared endpoint or
row changes what mobile sees.

**Basis:** the backend as it stands on this branch (migrations through 0045). Each
item says what exists today, so nothing here asks for something already served.

**Priority:** High means the console is wrong or slow today. Medium means a
workaround exists and the console works without the change.

| # | Request | Priority | Who benefits |
|---|---|---|---|
| a | Clarification `recipient` (client, provider, both) | Medium | Web, mobile, admins |
| b | `request_evidence` case entry | Medium | Web, mobile |
| c | Re-signable URLs for case and chat photos | High | Web |
| d | Server-side admin inbox (read, unread, delete) | Medium | Web admins on any device |
| e | Push and email status in the broadcast response | Medium | Web, admins |
| f | One counts endpoint for work queues | High | Web, backend load |
| g | Pagination totals on every list | High | Web, mobile (notifications) |

---

## (a) Clarification with a recipient

**Why.** A clarification has no recipient. The web writes "To the client: " into
the text, which uses 15 to 17 of the 1000 characters and can only be read, not
checked. Mobile cannot tell which party is being asked to answer.

**Today.** `POST /admin/disputes/:id/clarification` takes `{ body }` (1 to 1000
characters). `dispute_entries` has no recipient column. Both parties get the same
notification, "More information requested", with the body as its text.

**Proposed shape.**

- Request: `{ body: string, recipient?: "client" | "provider" | "both" }`. A
  missing `recipient` means `both`, so current callers keep working.
- Store `recipient` on `dispute_entries` (nullable, check constraint on the three
  values).
- Notification title: "Asked of you" for the addressed party, "More information
  requested" for the other party.
- Visibility: both parties keep reading every case entry, as today (RLS policy
  `dispute_entries_participant_read`). `recipient` changes the label and the
  prompt only. No entry is hidden from either side, so both can see the full case.

**Who benefits.** Web (structured addressing, and the 1000-character limit no longer
carries a prefix). Mobile (a clear "asked of you" prompt). Admins (an auditable
recipient).

**Priority.** Medium.

## (b) "Request evidence" case entry

**Why.** "Please share a photo" can only be a text request today. The party has to
find the right chat message on their own. An explicit entry lets mobile prompt
them to attach one.

**Today.** `dispute_entries.kind` allows `statement`, `appeal`, `clarification`,
`resolution`, `cancellation_response` and `system`. An admin may write only
`clarification` (`add_dispute_entry`). A participant can attach their own chat
message to a statement (`message_id`, with an owner check). That part already
works.

**Proposed shape.** Add `request_evidence` to the kind check. Let an admin write it
through `add_dispute_entry`, with the optional `recipient` from (a). Notify the
addressed party: "Attach a photo or chat message to this complaint." The party
answers with a normal statement that carries `message_id`, which already works.

**Who benefits.** Both parties and admins. The web can then replace its text-only
photo template with a real request.

**Priority.** Medium.

## (c) Re-signable URLs for case and chat photos

**Why.** Photo links expire. Dispute entries and admin chat messages carry signed
URLs valid for 3600 seconds (`CHAT_ATTACHMENT_TTL_SECONDS`). A case left open for an
hour shows broken thumbnails until the page reloads.

**Today.** URLs are minted only when a case or chat is read. There is no endpoint
that signs a path again.

**Proposed shape.** `POST /admin/attachments/sign` with `{ paths: string[] }`
(at most 20 paths, each limited to a message in a dispute or a job chat). Response:
`{ urls: [{ path, url, expires_at }] }`. Optionally, record each admin view as an
`admin_actions` row (`chat.attachment.view`), since these are private photos.

**Who benefits.** Web. Mobile is unaffected.

**Priority.** High.

## (d) Admin inbox that syncs across devices

**Why.** The admin bell is driven by queue counts only. Read state is not kept
anywhere the admin's other devices can see, and admins receive no notifications at
all.

**Today.**

- Admin accounts are excluded from broadcasts. Complaint and cancellation notices
  go only to the two parties.
- `/notifications` (list, `unread-count`, `snapshot`, SSE `stream`, `:id/read`,
  `read-all`, `DELETE :id`, `DELETE`) is guarded by `JwtAuthGuard` with no role
  check, and is scoped to the caller's own rows. An admin token therefore already
  works on these routes.
- The list returns a bare array capped at 50 rows (see g). Delete is a hard delete.

**Proposed shape.**

- Write admin-recipient rows (type `admin_alert`, with a route target) for: a new
  complaint, a new appeal, a cancellation response deadline passing, a verification
  submitted, and a withdrawal requested. Email is not sent.
- Keep the existing `/notifications` routes as the admin read, unread and delete
  contract, with the totals from (g).
- For admin rows, prefer a dismissed flag over a hard delete, so the trail is kept.

**Who benefits.** Web admins, who see what happened on any device.

**Priority.** Medium.

## (e) Push and email status in the broadcast response

**Why.** The web can only say "push delivery is best-effort, and email is not
sent". It cannot tell the admin how many pushes were tried or how many failed.

**Today.** `POST /admin/notifications/broadcast` returns `{ sent, failed, audience }`.
`sent` counts the inbox rows written, and the web shows it as "Added to N inboxes".
The 30-second push scheduler handles rows afterwards, so the response cannot report
push results. `notifications.pushed_at` records that the scheduler has handled a
row. There is no failure column.

**Proposed shape.**

- Response: `{ broadcast_id, audience, sent_to, failed, push_queued }`. Keep `sent`
  as an alias of `sent_to` while the current web build is in use.
- `GET /admin/notifications/broadcasts/:id` returns `{ sent_to, push_attempted,
  push_sent, push_failed, email_sent: 0 }`, filled in once the scheduler has run.
  `push_failed` needs a failure marker on the row, or a log the endpoint can count.

**Who benefits.** Admins (an honest delivery picture). Web (a status line later).

**Priority.** Medium.

## (f) One counts endpoint for work queues

**Why.** Each refresh reads each queue separately. Pending withdrawals and pending
service requests each cost a request. Verifications and disputes are counted from
full list pages, which is the heaviest load on every tick. The queue badges, the
bell and the page title all depend on these counts.

**Today.** The withdrawal and service-request counts are one-row list calls
(`limit=1`). The verification and dispute counts come from full paged lists.

**Proposed shape.** `GET /admin/queues/counts` returns
`{ verifications, disputes, withdrawals, service_requests, as_of }`. Each count is a
server-side `COUNT`, not a list. A queue whose count fails returns `null`, so the
other queues still show. That matches the web's rule of keeping the last good value.

**Who benefits.** Web (one request per tick instead of four). Backend (cheaper
ticks).

**Priority.** High.

## (g) Pagination totals on every list

**Why.** The web walks every page of disputes, bookings, verifications and
transactions. The walk stops at 25 pages of 200 rows, which is 5,000 rows, and then
reports a failure instead of a partial list. A list without a total cannot show
"page 2 of 14".

**Today.** Most admin lists return a `total`: disputes, bookings, verifications,
withdrawals, activity, audit, skill requests and wallet transactions. Two do not:

- `GET /notifications` returns a bare array, capped at 50, with no offset.
- `GET /admin/jobs/:jobId/conversation` returns `{ messages }` with no paging and no
  total.

**Proposed shape.**

- Every admin list accepts `limit` and `offset` and returns `{ <key>, total }`.
- The conversation endpoint accepts `limit` and `before` (a message id or timestamp),
  and returns `{ messages, total, has_more }`.
- Notifications: keep the bare array for mobile. Add a new envelope on a new path,
  `{ items, total, unread_total }`, so mobile is not broken.

**Who benefits.** Web (true totals, and no 5,000-row ceiling). Mobile (notification
paging).

**Priority.** High for the admin lists. Medium for notifications.
