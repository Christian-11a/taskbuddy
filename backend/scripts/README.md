# Local payout demonstration

From repository root, run `node backend/scripts/payout-demo.mjs` with the existing
backend dependencies installed. The command uses a disposable migrated PGlite
database, creates simulated funding and a receiving ledger, reserves/settles one
withdrawal and rejects another, then checks the combined ₱1,100 balance.

No bank, GCash, Stripe or deployed API is called. `payout_demo` is local only and
must not be installed as a production rail. See
[verification and evidence](../../test-docs/PAYOUT_VERIFICATION.md).

Verification: `npm run test:sql` from `backend/`, including
`test/sql/payout-simulator.test.mjs`.
