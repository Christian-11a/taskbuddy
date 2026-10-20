# Backend handoff: proposal send fails, migration 0075 not live (2026-10-20)

## Symptom

A provider opens a job, chooses "Quote a different total", enters ₱5,000 and taps **Send proposal**. The app shows:

```
Could not find the 'posted_budget' column of 'job_applications' in the schema cache
```

Every proposal send hits this, not only custom quotes, because the insert always writes `posted_budget`.

## Cause

- PR #118 (`c2fa71c7`, 2026-10-20) added migration `backend/supabase/migrations/0075_proposal_quotes.sql`. It adds
  `job_applications.quote_amount` and `job_applications.posted_budget`, and the RPC `escrow_place_proposal_hold`.
- The same PR changed `backend/src/applications/applications.service.ts:108` so the insert writes
  `posted_budget: job.budget`.
- The API with that code is live, but the live database has no `posted_budget` column. Either 0075 was not applied, or it
  was applied and PostgREST's schema cache was not reloaded. This is deployment drift. The mobile app is not at fault.

## Fix (ID `PQ-B1`)

1. Apply `0075_proposal_quotes.sql` to the TaskBuddy Supabase project.
2. Run `notify pgrst, 'reload schema';`.
3. Check: `select column_name from information_schema.columns where table_name='job_applications' and column_name in ('quote_amount','posted_budget');` returns 2 rows.
4. Send a proposal in the app again.

## Note

The migration deploy order is in `backend/README.md`. 0075 must be applied **before** the API that writes `posted_budget`
is serving.
