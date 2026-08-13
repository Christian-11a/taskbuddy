# Backend handoff — booking confirmation, job checklists, verification

**Who this is for:** whoever holds Supabase and Render access for TaskBuddy. The two halves are
split so they can be done by different people, in this order:

| | Task | Needs |
|---|---|---|
| **Part A** | Apply migrations 0018 and 0019 | Supabase SQL Editor |
| **Part B** | Redeploy the API, and check Stripe Identity is on | Render (+ Stripe dashboard) |

Everything described here is **already written and committed** — API code, SQL migrations, mobile
app, and admin console. Nothing below asks you to write code.

**Part A is safe to do at any time, on its own.** Both migrations are additive, and the currently
deployed API neither reads `job_tasks` nor ever writes `'confirmed'` — so applying them changes
nothing observable until Part B lands. There is no window where the database is ahead of the API
in a way anyone can notice.

**Part B is what unblocks the app.** Until the API is redeployed, **the mobile app cannot post
jobs** — `POST /jobs` now sends a `tasks` array and the deployed API rejects unknown fields with a
400 (`forbidNonWhitelisted`). Migrations alone do not fix that; only the deploy does. Everything
else in the app degrades quietly in the meantime (no checklists, Accept returns 404).

---

## Part A — Supabase (do these in order)

### 1. Apply migration `0018_job_confirmed_status.sql`

Supabase → SQL Editor → paste the file → Run. It is one statement:

```sql
alter type job_status add value if not exists 'confirmed' after 'assigned';
```

**Run it on its own and let it finish before step 2.** Postgres will not let a new enum value be
*used* in the same transaction that created it, and the SQL editor runs a pasted script as one
transaction. Step 2 uses `'confirmed'` in a CHECK constraint, so pasting both files together
fails with `unsafe use of new value "confirmed" of enum type job_status`.

(If you use `supabase db push` instead, each file gets its own transaction and you can push both
at once.)

### 2. Apply migration `0019_job_tasks_and_verification_storage_rls.sql`

Same route. This one does three things:

- widens `chk_assignment_consistency` to include `'confirmed'`
- creates the `job_tasks` table (the per-job checklist) with its RLS policies
- adds an `is_admin()` function and four Row-Level Security policies over `storage.objects` for
  the private `verification-docs` bucket

**Possible snag:** creating policies on `storage.objects` requires ownership of that table. It
works from the Supabase SQL editor. If your connection lacks it, the file catches the error and
finishes with a warning (`Could not create verification-docs Storage policies …`) — the rest of
the migration still applies, and you add those four policies through Dashboard → Storage →
`verification-docs` → Policies instead, copying the `USING` / `WITH CHECK` expressions verbatim
from the file. Nothing is exposed while you do: the bucket is private regardless, and the API only
ever hands out short-lived signed URLs to admins.

### 3. Verify Part A landed

Run all four in the SQL Editor. If each answers as noted, Part A is done and you can hand Part B
over.

```sql
-- 1. the new status exists
select unnest(enum_range(null::job_status));
--    → open, recommending, assigned, confirmed, in_progress, completed, cancelled, expired

-- 2. the checklist table exists (0 rows is the expected answer)
select count(*) from job_tasks;

-- 3. the constraint knows about 'confirmed'
select pg_get_constraintdef(oid) from pg_constraint
 where conname = 'chk_assignment_consistency';
--    → ...status <> ALL (ARRAY['assigned', 'confirmed', 'in_progress', 'completed'])...

-- 4. the Storage policies exist (expect 4 rows)
select policyname from pg_policies
 where tablename = 'objects' and policyname like 'verification_docs%';
```

Only #4 can come back short — see the ownership snag above. Everything else failing means the file
did not apply; re-run it and read the error rather than moving on.

---

## Part B — Render, and Stripe

### 4. Redeploy the API on Render

Deploy the current `main` (or whichever branch carries this work). **After Part A, never before:**
the API reads `job_tasks` on every job query, so against a database without it, every job endpoint
fails with PostgREST's `Could not find a relationship between 'jobs' and 'job_tasks'`.

No new environment variables are required.

**Smoke test after the deploy** (any provider token):

```bash
curl -s "$API/jobs" -H "Authorization: Bearer $TOKEN" | head -c 400
# expect { "jobs": [ { ..., "job_tasks": [] } ], "summary": { ... } }
```

If `summary` comes back but `job_tasks` is missing from the job objects, migration 0019 did not
apply — go back to Part A rather than debugging the API.

### 5. Turn on Stripe Identity (only if it is not already on)

The verification flow's third step opens a Stripe Identity session. The API code and the mobile
screen are done; what may be missing is the product being enabled on the Stripe account:

1. Stripe Dashboard → **Identity** → enable it (test mode first).
2. Settings → Identity → make sure **Document** verification is allowed.
3. Webhooks: the existing endpoint (`POST $API/payments/webhook`) must be subscribed to
   `identity.verification_session.verified` and `identity.verification_session.requires_input`.
   Check Developers → Webhooks → your endpoint → Events. Add them if absent.

The Stripe env vars themselves (`STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`,
`STRIPE_WEBHOOK_SECRET`) are already set — wallet top-ups work — so nothing new is needed there.

**If you skip this step, nothing breaks.** The API answers `503` before creating anything, and the
app falls back to submitting the ID and selfie to the admin review queue. The provider still ends
up `PENDING`, just decided by a human. Worth knowing so a 503 in the logs here is not a mystery.

---

## What changed, and why you might care

### `job_status` has a new value: `'confirmed'`

```
open → recommending → assigned → confirmed → in_progress → completed
                          │           │
                          └───────────┴──→ cancelled   (provider declines, reason required)
```

`'assigned'` used to mean two things at once — "the client hired you" and "you agreed to do it".
It now means only the first: an **incoming booking request** waiting on the provider's answer.
`'confirmed'` means they accepted it.

Anything you have that reads job status needs to know the new value exists:

- The admin console is already updated (`BOOKING_STATUS_DISPLAY`, `isCancellableBooking`). Note
  `'assigned'` now displays as **"Awaiting Provider"**, not "Assigned".
- **No money moves at this step.** Escrow is still placed when the client accepts the application
  and released/refunded exactly as before.
- Any external report, dashboard, or query of yours that filters `status = 'assigned'` to mean
  "active job" will now miss confirmed jobs. Filter on both.

### New endpoints

```
POST  /jobs/:id/accept          (provider)  assigned → confirmed, notifies the client
PATCH /jobs/:id/tasks/:taskId   (provider)  { is_done } — tick a checklist item
POST  /verifications/identity-session  now takes an optional { id_document_path, selfie_path }
```

`POST /jobs` accepts `tasks: string[]` (≤20 labels, ≤120 chars each) and now **rejects a
`scheduled_at` in the past** with a 400.

### The `verification-docs` bucket is now RLS-protected

Government IDs were already in a private bucket read only through service-role-signed URLs. 0019
adds explicit policies: providers may write into their own `<profile id>/` folder, and **only
admins may read**. Not even the uploader can read their own document back — there is no product
reason to, and every extra reader is another way for it to leak. This does not change how the
admin console loads documents (it goes through the API's service-role key, which bypasses RLS).

---

## Rollback

If something goes wrong after the deploy, redeploying the previous API build is safe on its own —
the migrations are additive and the old code ignores `job_tasks` and never writes `'confirmed'`.

Do **not** try to remove the enum value: Postgres cannot drop one, and jobs may already be sitting
in `'confirmed'`. If you must strand the feature, move those jobs on instead:

```sql
update jobs set status = 'in_progress' where status = 'confirmed';
```

`job_tasks` can be dropped (`drop table job_tasks;`) — it cascades from jobs and nothing else
references it — but the old API build does not read it, so there is rarely a reason to.

---

## Still not done (deliberately, and not blocking any of the above)

- **Push delivery for the new notifications.** `POST /jobs/:id/accept` writes a `notifications`
  row like every other lifecycle event; the app polls that table. There is still no FCM/APNs
  transport, so "notifies the homeowner" means in-app, not on the lock screen.
- **A `PENDING_VERIFICATION` column on `provider_profiles`.** The app derives that state from the
  provider's latest `provider_verifications` row (`status = 'pending'`), which is already the
  source of truth. A denormalised column would be a second one to keep in step; if you ever want
  it on the provider row for reporting, that is a new migration.
- **Geolocation for the homeowner's location step.** The job's coordinates still come from the
  profile's saved `latitude`/`longitude`, with a Metro Manila fallback. Picking a point on a map
  needs a maps dependency and a native build — a separate piece of work, called out in
  `mobile/README.md`.
