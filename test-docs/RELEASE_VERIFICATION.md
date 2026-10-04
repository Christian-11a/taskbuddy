# Phase 10 release verification

Status: local regression and project documentation complete; external release,
integration and physical-device verification remain open. This task has not
changed deployed services, applied migrations, rebuilt a native artifact or
performed a real/sandbox external payout.

## Local evidence — October 4, 2026

| Project | Commands run | Result |
| --- | --- | --- |
| Backend | `npm run lint`; `npm run build`; `npm test -- --runInBand` | Passed; 656 tests / 51 suites |
| Database | `npm run test:sql` | Passed; 120 tests; production migration chain in disposable PGlite |
| Mobile | `npm run typecheck`; `npm test -- --runInBand` | Passed; 184 tests / 42 suites; no configured lint command |
| Web | `npm run lint`; `npx --no-install tsc --noEmit`; `npm test` | Passed; 219 tests, one unconfigured live-login test skipped |
| Payout demonstration | `node backend/scripts/payout-demo.mjs` | Matched simulated receipt and withdrawal; total ₱1,100 conserved |
| Backend end-to-end command | `npm run test:e2e -- --runInBand` | No tests found, exit 1; no end-to-end files exist |
| Production web build | `npm run build` | Passed after approved network access; optimized build and 38 generated pages |

[The 22-item matrix](VERIFICATION_MATRIX.md) links each PDF requirement to local
implementation/tests and records separate deployed/device gaps. Existing
`job-lifecycle.spec.ts` exercises both participants and admin decisions against a
shared in-memory store; SQL tests verify migrated constraints, transactions,
permissions, deadlines and replay. Neither proves deployed integration nor real
multi-connection concurrency. No new production dependency/native plugin was added.

## History and migration review

Current checkout: `codex/backend-handover-followups`; starting commit `dcebaae`.
Configured origin is `Eduard-K-A/taskbuddy`; upstream is `erianthe17/taskbuddy`.
Both remotes were fetched with user approval on October 4. Origin main is
`773003a`; upstream main is `d9af9d4`. Relative to the starting tree, origin
contains only merges; upstream also adds CSV anonymization and admin-settings
changes. Neither remote changes the migration folder or includes 0039–0045.
The implementation branch has 12 task commits and is 2 commits behind origin /
6 behind upstream at this inspection; no merge or history rewrite was performed.
Target database versions remain unverified. The earlier handoff reports a database
history mismatch: reconcile actual applied versions before deciding which migrations
are missing. Never
apply the whole directory blindly or rewrite already applied migrations.

| Migration | Required behavior | Target verification |
| --- | --- | --- |
| 0039 | Hire confirms; provider starts later | Wallet/card hire, future schedule, booking/chat/notification replay |
| 0040 | 72-hour warranty and release guard | Deadline boundary, open complaint blocking and scheduler replay |
| 0041 | Participant complaints/cancellation review/appeals | Pre-start 48-hour response, contest/timeout, post-start review, zero-budget cases, settled appeals |
| 0042 | Atomic service notices/decisions | Submit/approve/reject rollback and exact-once notices |
| 0043 | Approved-service assignment consistency | Primary/secondary category eligibility and existing assignments |
| 0044 | Private owned portfolio | Bucket/MIME/cap/RLS, signed image access, ownership and client viewing |
| 0045 | Shared wallet debit affordability lock | Existing reservations audit; independent withdrawal/escrow/Connect contention and rollback |

## Controlled release order

1. Confirm the target environment, current remote/API revisions, migration
   history, database backup and controlled client/provider/admin accounts.
2. Review/apply only missing migrations 0039–0045 in order. Audit existing wallet
   reservations and verify PostgreSQL contention with independent connections.
3. Release matching API, then admin web and mobile. Record exact revision/build
   identifiers. No native package change was introduced, but an old APK does not
   establish that this JS revision was exercised.
4. Exercise two-role/admin state changes against that environment: confirm/start,
   completion/warranty, cancellation agreement/contest/timeout, complaint evidence,
   clarification/appeals/decisions, service approval/rejection, notifications,
   location reload, filters, portfolio and wallet reference visibility.
5. Run every populated PDF scenario on small and larger devices, enlarged text,
   light/dark modes, Android gesture/three-button navigation, native keyboard,
   camera/gallery/location permissions, foreground/background/reconnect and
   cold-start push taps. Include logout/account switch and failed requests.
6. Capture expected/actual results, exact environment, sanitized screenshots and
   case/ledger/payment references in the matrix. Real Stripe eligibility and
   external bank delivery require their own receiving-account evidence; the
   selected simulator proves only its labeled local outcome.

## Open approvals and evidence

The working agreement requires confirmation for network/deploy/configuration
calls. The approved remote-history fetch and existing web build/font download completed
successfully. Next, select the controlled environment and approve read-only
inspection of its database history. Deployment then needs permission to apply
reviewed migrations and release revisions;
physical checks need device/build access. No supplied account/device artifacts
currently establish these gates. Final completion is unproven until they close.

## Focused implementation commits

| Commit | Scope |
| --- | --- |
| `29fa7b2` | Confirmed hiring, warranty and complaint/cancellation review |
| `f948dc1` | Notification consistency and approved-service decisions |
| `7bbeac7` | Signed saved locations and approved-service profiles |
| `dc134f5` | Private provider-owned portfolios |
| `46117ce` | Debit reservation guard and traceable payout simulator |
| `b797816` | Shared mobile palettes, state and photo components |
| `ce7ae67` | Three-consent signup and readable themed auth forms |
| `9e5b1e2` | Client job/review/filter/portfolio/theme screens |
| `423c485` | Provider confirmed work, portfolios and payout screens |
| `c24fdea` | Admin complaint review and required payout references |

Commits are local; no push or deployment has been performed. Unrelated existing
changes and supplied PDF/image/thesis assets remain outside these batches.

## Prepared read-only preflight

[release-preflight.sql](../backend/scripts/release-preflight.sql) reads applied
versions, relevant function/trigger metadata, aggregate reservations/overdrawn
wallets, legacy missing settlement references and the portfolio bucket from a
read-only repeatable-read transaction, then rolls back. It was executed locally
against migrated PGlite with a fixture migration-history table; no deployed
evidence is implied. Target execution remains pending approval. Presence checks
do not replace definition review or independent-connection contention checks.

A local `git merge-tree --write-tree HEAD upstream/main` review found a conflict
only in `web/README.md`; the working checkout was not merged or changed. Before
a release from main, integrate the newer upstream CSV-privacy/admin-settings
changes, resolve documentation, and rerun web gates so those changes are not
regressed. No permission to merge unrelated upstream work or release was inferred
from approval for history/build checks.
