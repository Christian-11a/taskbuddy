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

## Read-only release preflight

`release-preflight.sql` is a reviewable query file for the selected target before
migration/release work. It reads a consistent snapshot of applied migration
versions, relevant functions/permissions and trigger activation, aggregate wallet
reservations/overspending, legacy missing references, and portfolio bucket settings.
It returns no profile IDs/names or credentials and rolls the transaction back.

Target execution requires approval. Use an authorized database session with
stop-on-error enabled; a missing schema/query failure must be investigated, not
silently skipped. Missing new functions/bucket rows before migrations are expected
but do not prove readiness. An overreserved-wallet count above zero needs review
before applying 0045; this file neither refunds nor repairs records. Legacy paid
rows without references are reported separately, not treated as evidence of a
new settlement. Verify exact function definitions and PostgreSQL contention as
separate release checks; presence alone is insufficient.
