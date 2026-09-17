# Load test — money path

[`money-path.js`](./money-path.js) is a [k6](https://k6.io) script for HANDOFF.md §3. It puts
TaskBuddy's core money path under concurrent use and reports how long each step takes:

| Step | Request | What it exercises |
|---|---|---|
| 1 | `POST /jobs` (client) | job insert, checklist, triggers |
| 2 | `POST /jobs/:id/applications` (provider) | verification gate, application insert, notification |
| 3 | `GET /jobs/:id/applications` (client) | the applicant list join |
| 4 | `POST /applications/:id/accept` (client) | `escrow_place_hold`: wallet lock, ledger debit, assignment trigger |
| 5 | `POST /jobs/:id/cancel` (client) | escrow refund, status transition |

> ⚠️ **It writes real data.** Every iteration creates a job, an application, an escrow hold and
> two ledger rows (debit and refund) in the database behind `BASE_URL`, which **defaults to the
> deployed API**. Each job ends `cancelled` and the wallet ends where it started, but the rows
> remain. They're easy to spot: titles start with `Load test job`.
>
> It also creates **notifications**: "New application" for the client and "hired" / "Job cancelled"
> for the provider, one set per iteration. If either test account has a push device registered,
> the push sweep delivers them, so expect a burst of notifications on that phone.

## Not covered

- **The recommendation cron.** A job only reaches `recommending` after its urgency timeout
  (5–15 real minutes) or a manual SQL nudge. That can't be done per iteration under load.
  `POST /jobs/:id/recommendations/trigger` exists, but it scores through ml-service and sends
  invite notifications to real providers, so it's left out deliberately.
- **Completion and payout.** Completing a job releases escrow to the provider, which moves the
  balance permanently. Cancelling keeps the test repeatable.

## Prerequisites

1. Install k6: `brew install k6` (macOS). For other platforms see k6's install docs.
2. Test accounts on the target API:
   - a **client** with wallet balance of at least `BUDGET` × the number of concurrent virtual
     users (each hold is refunded before the iteration ends).
   - an **ID-verified provider**. An unverified one gets `403 verification_required` at step 2.

   The deployed API's `maestro.client@taskbuddy.test` / `maestro.provider@taskbuddy.test` are
   already set up this way (`mobile/maestro/flows/00_setup_test_accounts.md`). To top the client
   back up, see `docs/backend-handoff-mobile-e2e-test-environment.md` §2.

## Run

Pass the passwords through the environment. The script has no default for them and stops
if either is missing.

```bash
cd backend
CLIENT_PASSWORD='…' PROVIDER_PASSWORD='…' k6 run load/money-path.js
```

| Env | Default | Meaning |
|---|---|---|
| `BASE_URL` | `https://taskbuddy-kpek.onrender.com` | API to test. Use `http://localhost:3000` for a local API |
| `CLIENT_EMAIL` / `PROVIDER_EMAIL` | the maestro.* accounts | test accounts |
| `CLIENT_PASSWORD` / `PROVIDER_PASSWORD` | — (required) | their passwords |
| `CATEGORY_ID` | `1` | category for the posted jobs |
| `BUDGET` | `20` | peso budget held in escrow per job |

The default load ramps from 1 to 5 virtual users over about 2 minutes. To change it without
editing the file, override on the command line, e.g. `k6 run --vus 2 --duration 30s load/money-path.js`.

## Reading the results

- `step_*`: per-step timings. The thresholds fail the run when a step's p95 goes over 2 s
  (steps 1–3) or 3 s (the money steps, 4–5).
- `checks`: the share of requests that returned the expected status. The threshold is 95%.
- `flows_completed`: iterations that got all the way through the hold and the refund.
- `rate_limited`: `429`s. **This should be 0.** If it isn't, the run measured the rate limiter
  instead of the platform (below).

## Caveats that show up as false failures

- **Rate limits are per endpoint, per IP** (`BACKEND_SCHEMA.md` §28.4). Every virtual user runs
  from your one machine, so each route tops out at 240 requests a minute, about 4 iterations a
  second. To test beyond that, the load has to come from several IPs.
- **Login happens once**, in `setup()`, because `POST /auth/login` allows only 10 a minute. The
  tokens are never refreshed, so keep the run shorter than the Supabase access-token lifetime
  (1 hour by default; check Authentication settings).
- **Render free tier cold start.** `setup()` waits up to 120 s on `/health` first. A cold instance
  during the run still shows up as slow steps.
- **Supabase free-tier connection limits.** The API talks to PostgREST over HTTP, but the pooler
  behind it has a small connection budget. Errors that appear only as load rises, while the
  per-step p95 still looks fine, usually come from there.
