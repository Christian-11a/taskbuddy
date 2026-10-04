# Phase 9 payout verification

Selected outcome: **LOCAL SIMULATION — no real bank/GCash delivery**. The simulator
uses production migrations in a disposable PGlite database and a separate local
`payout_demo` receiving ledger. It does not call the production API, Stripe,
a bank, GCash or a deployed service. The receiving schema is not a migration.

## Run and inspect

From repository root, using the already installed backend dependencies:

```sh
node backend/scripts/payout-demo.mjs
cd backend
npm run test:sql
```

The demo emits before/reservation/after balances and matched withdrawal/receipt
references. [Captured output](PAYOUT_SIMULATION_EVIDENCE.json) was generated on
October 4, 2026. Re-running creates new disposable IDs; matching references and
reconciled balances, rather than exact IDs, are the invariant.

| Stage | Settled provider wallet | Spendable wallet | Receiving balance | Combined settled funds |
| --- | ---: | ---: | ---: | ---: |
| Initial simulated funding | ₱1,000 | ₱1,000 | ₱100 | ₱1,100 |
| Reserve ₱350 | ₱1,000 | ₱650 | ₱100 | ₱1,100 |
| Settle ₱350; reject another ₱200 request | ₱650 | ₱650 | ₱450 | ₱1,100 |

The completed withdrawal and receiving receipt share `SIM-<withdrawal-id>`.
Rejected requests credit no receiver and release their reservation. Settlement
and simulated receipt insertion are one transaction: a receiver failure rolls
both back. Repeated settlement is refused. SQL tests also cover insufficient
funds, overlapping requests, use of reserved funds by escrow, ownership,
missing receiver, and migration replay. PGlite serializes work; this does not
establish PostgreSQL multi-connection concurrency.

## Production paths remain distinct

- Manual wallet requests reserve funds. An admin records an external payout with
  a required nonblank 1–500-character reference; the endpoint itself sends no money.
  Provider history shows transaction IDs and recorded settlement references.
- Card-linked Connect transfers depend on authoritative account eligibility and
  warranty expiry without an open complaint. A transfer to Stripe is not proof of
  bank delivery. Provider history exposes returned Stripe transfer IDs.
- Payout setup syncs on screen entry, browser return and foreground. Component
  tests cover not-started, onboarding, restricted and active states, expired
  links, refresh errors and retaining the last known status. Failed wallet loads
  and cancellation failures remain visible; failed transfers show no debit sign.
- Migration 0045 closes a verified database gap: API prechecks alone allowed
  direct ledger rows to reserve already committed funds. The trigger shares the
  existing wallet advisory lock with escrow/Connect spending. Deployment must
  inspect existing reservations and verify independent-connection contention.

## Local gate

Backend: 656 tests, lint/build passed. SQL: 120 tests passed. Mobile: 184 tests,
typecheck passed; no lint script exists. Web: 219 passed, one live-only test
skipped; lint/typecheck passed. The backend end-to-end command has no test files
and exits with “No tests found.” Production web build, live account eligibility,
external payout delivery, and deployed/device checks remain separate pending gates.
