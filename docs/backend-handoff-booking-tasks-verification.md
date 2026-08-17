# Backend handoff — deployment prerequisites and smoke checks

**Who this is for:** whoever holds Supabase, API-host, web-host, and Expo access
for TaskBuddy. This is an operator runbook for code in the worktree; it does
not claim that any external deployment has occurred.

| | Task | Needs | Status |
|---|---|---|---|
| **Part A** | Apply migrations 0018, 0019, and 0020 | Supabase SQL Editor | ✅ **Done** — 0018 + 0019 verified 2026-08-14; 0020 verified 2026-08-17 |
| **Part B** | Configure API/web/Expo environment and deploy artifacts | API host, web host, Expo | ⚠️ **Partly done** — API deployed (verified 2026-08-17); hosted-web + Expo config outstanding |

**Observed state of the deployed API at `taskbuddy-1d48.onrender.com`, 2026-08-17:**
`POST /jobs/:id/accept`, `POST /devices`, `GET /conversations/:id/stream`, and
`GET /auth/admin/session` all answer `401` rather than `404` — the routes exist, so the build
carrying this work is live. Migrations 0018 and 0019 were applied on 2026-08-14 with all four
checks in §4 passing, including the Storage policies at 4/4.

All three migrations are applied. 0020's three RPCs were confirmed present on 2026-08-17 with the
query in §3.

**Still to do:**

1. **Hosted web console config** (§6) — `NEXT_PUBLIC_API_URL` plus a matching `WEB_CORS_ORIGINS`
   entry. Running the console *locally* already works: `web/.env.local` points at the deployed API,
   and the deployed CORS preflight was confirmed to allow `http://localhost:3000` with credentials
   on 2026-08-17. Only an externally hosted console still needs its origin added.
2. **Expo push setup** — see the mobile-side blocker in `mobile/README.md`; the app cannot obtain
   a push token until an EAS `projectId` exists, so §7 step 5's push check will fail until then
   regardless of API configuration.

Everything described here is implemented in the worktree: API code, SQL
migrations, mobile app, and admin console. Nothing below asks an operator to
write code. Applying database migrations alone is insufficient: the API must
be deployed after them, and the web console needs its matching origin and API
URL configuration.

---

## Part A — Supabase

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

### 3. Apply and verify migration `0020_admin_search_functions.sql`

**Applied and verified 2026-08-17 — all three functions present.** Unlike 0018 and 0019 this file
is *not* re-runnable: it uses bare `create function`, so running it against a database that
already has these RPCs aborts with `42723 function already exists`. Harmless — it fails before
changing anything — but run the verification query below *first* rather than the file.

Run 0020 after 0019. It creates the `admin_list_bookings`,
`admin_list_activity`, and `admin_list_transactions` RPCs. They search,
filter, order, paginate, and count in SQL, and grant execution only to
`service_role`; the browser never calls them directly.

```sql
select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'admin_list_bookings',
    'admin_list_activity',
    'admin_list_transactions'
  );
-- expect all three names
```

### 4. Verify migrations 0018 and 0019

**These four were run on 2026-08-14 and all passed, including #4 at 4/4.** They are repeatable if
you want to confirm the state of a given project yourself.

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

## Part B — External deployment

### 5. Configure and deploy the API

Deploy the branch that carries this work. **After Part A, never before:**
the API reads `job_tasks` on every job query, so against a database without it, every job endpoint
fails with PostgREST's `Could not find a relationship between 'jobs' and 'job_tasks'`.

Set `WEB_CORS_ORIGINS` to a comma-separated list of exact admin-console
origins, for example:

```env
WEB_CORS_ORIGINS=https://your-admin.example.com,http://localhost:3000
```

Do not use `*`: browser-admin authentication uses `credentials: 'include'` and
httpOnly cross-site cookies. Keep the existing Supabase, Stripe, Google, and
`PUBLIC_API_URL` settings. Set `EXPO_ACCESS_TOKEN` only when Expo push security
is enabled for the Expo project.

### 6. Configure and deploy the web console

Set the web host's `NEXT_PUBLIC_API_URL` to the deployed API's HTTPS origin,
then deploy the current web artifact. Its origin must exactly match one entry
in `WEB_CORS_ORIGINS`. The console uses `/auth/admin/*` cookie endpoints,
keeps only its CSRF token in memory, and sends `credentials: 'include'`.

### 7. Smoke test after external deployment

Use an admin account in a browser:

1. Sign in and confirm the response sets `tb_admin_access`,
   `tb_admin_refresh` (httpOnly), and `tb_admin_csrf` cookies.
2. Refresh the page. The console should restore its session via
   `GET /auth/admin/session` without a token in local storage.
3. Search and paginate Bookings, Transactions, and Activity Log. Confirm the
   displayed total and a page beyond the first are returned by the API.
4. Open a booking that has photos. Confirm `photo_urls` are browser-renderable
   URLs rather than unresolved Storage paths.
5. On two physical mobile devices, open the same conversation and send a
   message. The other chat should receive its SSE event while open. Permit
   notifications after sign-in, trigger a notification, and confirm Expo push
   delivery plus the in-app notification row.

For a bearer-token API check (any provider token):

```bash
curl -s "$API/jobs" -H "Authorization: Bearer $TOKEN" | head -c 400
# expect { "jobs": [ { ..., "job_tasks": [] } ], "summary": { ... } }
```

If `summary` comes back but `job_tasks` is missing from the job objects, migration 0019 did not
apply — go back to Part A rather than debugging the API.

### 8. Turn on Stripe Identity (only if it is not already on)

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

## Still not done (deliberately, and not blocking the deployment steps)

- **Call signalling and message attachments.** Chat messages are delivered live
  over authenticated SSE, but the call buttons still have no signalling path
  and `POST /conversations/:id/messages` has no attachment field.
- **A `PENDING_VERIFICATION` column on `provider_profiles`.** The app derives that state from the
  provider's latest `provider_verifications` row (`status = 'pending'`), which is already the
  source of truth. A denormalised column would be a second one to keep in step; if you ever want
  it on the provider row for reporting, that is a new migration.
- **Geolocation for the homeowner's location step.** The job's coordinates still come from the
  profile's saved `latitude`/`longitude`, with a Metro Manila fallback. Picking a point on a map
  needs a maps dependency and a native build — a separate piece of work, called out in
  `mobile/README.md`.
