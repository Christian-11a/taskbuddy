# Backend handoff: findings from the 2026-10-19 smoke run

Owner: backend. Written 2026-10-19 after an unattended smoke test of the mobile happy path (sign up, verify,
post a job, apply, hire and pay, work, review, chat, earnings) against the live API
(`https://taskbuddy-kpek.onrender.com`, `/health` commit `7cc773b`) with the EAS preview build of `main`
(`69e5c24`). The whole happy path passed; one backend bug stops a verified provider from applying in the app.
Everything below is backend work or a backend decision. Mobile fixes for the other findings are on a separate
branch and are not described here.

**Another handoff exists.** `feat/mobile-post-uat` has its own `docs/backend-handoff-mobile-post-uat.md` and its own
pointer under "Remaining Backend Work" in `mobile/README.md`. This is a second, independent document. Expect a small
README merge conflict when both land.

## 1. BLOCKER for UAT: `GET /verifications/me` ignores `provider_profiles`

*(smoke findings SMOKE-006, SMOKE-010; the same cause explains SMOKE-007 and SMOKE-011)*

**What users see.** An admin approves a provider's ID and Plumbing certificate. The database is correct
(`provider_profiles.is_verified = true`, `identity_verified = true`, the verification and the credential are
`approved`). But `GET /verifications/me` answers:

```json
{ "identity": "none", "certificate": "none", "verified": false, "services": [] }
```

The app trusts that answer. It keeps showing the provider as unverified, "Check again" sends them back into the Get
verified wizard, and the job detail shows "Verify first" with no apply button. An approved provider cannot apply from
the app. (The server-side apply gate reads `identity_verified` directly, so applying through the API still works.)

**Why it is backend, and why it is not deploy drift.** `git log 7cc773b..HEAD -- backend` is empty: the live code is
the same as `main`. The bug is in the code.

`verificationState` in `backend/src/verifications/verifications.service.ts` (lines 420-426) reads:

```ts
const { data: profile } = await this.supabase.admin
  .from('provider_profiles')
  .select(
    'category_id, is_verified, identity_verified, service_categories(name)',
  )
  .eq('profile_id', providerId)
  .maybeSingle();
```

Migration 0034 added `provider_secondary_categories`, which gives PostgREST a second path from `provider_profiles` to
`service_categories` (many-to-many, through the junction table). The unqualified embed
`service_categories(name)` is now ambiguous and PostgREST answers **`PGRST201`** (more than one relationship). The
code does not read `error`, so `profile` is `undefined`, `pp` is null, and the function reports "nothing is
verified". This is the same fix the 2026-09-29 handoff already applied to analytics, `/auth/me` and `/providers/:id`.
It was the only unqualified `provider_profiles` embed left in `backend/src` (every `service_categories(` use was
checked). The second embed in the same function, `provider_secondary_categories(... service_categories(name))` at
line 452, is unambiguous and works.

**Read-only reproduction** (any Supabase REST client with the service role; do not paste keys anywhere):

```
GET /rest/v1/provider_profiles?profile_id=eq.<provider id>&select=category_id,is_verified,identity_verified,service_categories(name)
  -> HTTP 300, body has "code":"PGRST201" and lists the two relationships
     (provider_profiles_category_id_fkey and provider_secondary_categories)
GET /rest/v1/provider_profiles?profile_id=eq.<provider id>&select=category_id,is_verified,identity_verified,service_categories!category_id(name)
  -> 200 [{"category_id":1,"is_verified":true,"identity_verified":true,"service_categories":{"name":"Plumbing"}}]
```

**Fix (two small changes, same function):**

1. Qualify the embed:
   `'category_id, is_verified, identity_verified, service_categories!category_id(name)'`.
2. Stop swallowing the error so the next ambiguity fails loudly instead of reporting "unverified":
   ```ts
   const { data: profile, error: profileError } = await this.supabase.admin /* … */;
   if (profileError) throw new BadRequestException(profileError.message);
   ```
   `mine()` (line 390) is the only caller of `verificationState`, so the throw can only turn today's wrong answer on
   `GET /verifications/me` into a 400. If you would rather the status screen degrade, log the error and return the
   old shape from `mine()` instead; either is acceptable, silent success is not.

**Tests first** (`verifications.service.spec.ts`; the existing `describe('verificationState services')` near line 552
shows the mock style):

- the string passed to `.select` for `provider_profiles` contains `service_categories!category_id(name)`;
- a `{ data: null, error: { message: 'PGRST201' } }` result makes `verificationState` reject instead of returning
  `identity: 'none'`.

**Done when**, after deploy, for a provider whose ID and Plumbing certificate an admin approved:

```json
{ "identity": "approved", "certificate": "approved", "verified": true,
  "services": [{ "category_id": 1, "name": "Plumbing", "primary": true, "certificate": "approved" }] }
```

and in the app the provider's job detail shows the payout step or the apply button, not "Verify first". Findings
SMOKE-007 (review screen said the certificate was only "sent for review") and SMOKE-011 (a payout-account gate that
never appeared) were hidden behind this bug; re-check both after the deploy.

## 2. Deploy state

Live `/health` reports commit `7cc773b`, database up. There is no backend commit after it on `main`, so nothing else
is waiting to be deployed. The two mobile commits after `7cc773b` (#113, #114) are UI only.

## 3. Stripe Identity (SMOKE-008): please confirm intent

The smoke provider's ID check went to the admin queue with `method = manual` and no Stripe session; the app's progress
line said "Starting the secure check: waiting". That is the expected path if Stripe Identity is unconfigured. Please
confirm it is intentionally off (see [`backend-handoff-stripe-identity-config.md`](./backend-handoff-stripe-identity-config.md)).
If it should be on, this is a configuration task.

## 4. Open product questions (not decided by mobile)

- **Chat messages and notifications (SMOKE-012).** A chat message increments the Messages badge but creates no entry
  in the in-app notification list (`chat.service.ts` `notifyRecipient`; a code comment says chat needs no push).
  Should it also create a notification entry?
- **Stale notification (SMOKE-014).** The client's "Work ready for review" notification stays unread after the job is
  completed and reviewed. Should it be marked read (or removed) at that point?
- **Chat on a Completed job (SMOKE-015).** The message input stays enabled on a completed job. Is that intended?

## 5. Corrections and things still true

- `payout_account_required` is HTTP **403** (`applications.service.ts:72`), not 400 as the smoke log first recorded.
  The mobile gate reads the `code`, so nothing breaks.
- `GET /health` reports `ml_service: down (HTTP 429)`. The recommendation and invite path was not exercised.
- The Xendit hosted checkout page was blank for about 30 seconds once during the run (cold start?). It then worked,
  and the hire completed through the webhook.

## 6. Re-test after the fix is deployed

1. As the approved provider: `GET /verifications/me` returns the object in section 1.
2. As that provider with a linked payout account (`PUT /payouts/account`):
   `POST /jobs/:id/applications` with a `cover_message` on an open Plumbing job inside the provider's radius -> `201`.
3. In the app, as the same provider: Home shows "Get verified: Verified", the job detail shows an apply or payout
   action, and "Check again" no longer opens the wizard.

Until the fix is live, a tester can apply through the API (step 2) to carry on with the rest of the flow.
