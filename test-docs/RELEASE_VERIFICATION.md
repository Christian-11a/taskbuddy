# Phase 10 release verification

Status: local regression and project documentation complete; external release,
integration and physical-device verification remain open. Approved Supabase/Render inspection, protected public-schema/data backups and controlled account preparation have run. Migrations 0039–0045 and the matching API release are deployed. Native artifact,
web release and full cross-role/device gates remain open; no external payout ran.

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
Upstream `d9af9d4` is integrated by merge commit `4a0dcdd`. The README conflict was resolved, the existing uncommitted AppContext comment edit was preserved, and web lint, typecheck, tests and production build passed after integration. No history rewrite was performed.
Applied registry versions were read on October 4; see the target findings below. The earlier handoff reports a database
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

## Authorization and remaining access

The user approved pending work in the existing Supabase, Render and Vercel
environments, including controlled dummy accounts and sandbox-only payment
verification. No additional permission for these approved steps is pending.

The supplied admin credentials authenticate successfully against the deployed
API. Dedicated QA client/provider accounts were created; both API logins and
roles were verified. The provider has a Cleaning profile and is unavailable for
real jobs. Credentials/sessions are stored outside the repository with mode
600; the supplied credential file is also mode 600 and locally excluded from Git.
No funds were added and no payment was attempted. These confirmed fixtures do
not establish signup/OTP UI or provider-verification evidence.

Render access is now verified for the existing API and ML services. The API
deploys `Eduard-K-A/taskbuddy`, branch `main`, root `backend`, with live revision
`773003a`. The ML service is at `282adf1`; its own health endpoint and the API
health check now both report the loaded model healthy. No ML config change was
needed. The deployed Stripe publishable and secret key prefixes are test mode;
no values were recorded or payments attempted. Actual payment `livemode` still
needs verification. The user reports no Vercel access; web deployment needs the
project owner. API/database work remains authorized independently. Physical
device/build and deployed workflow evidence remain open.

## Protected backups — October 4

Public-schema and public-data exports completed successfully using the existing
Supabase CLI and installed PostgreSQL tools. Files are outside the repository in
a protected directory, with mode 600. Schema export: 129,985 bytes, SHA-256
`24bbdeec75c6dbc05093478e8218db87ddffde7e280da03fa0f5a4c78f8bede2`.
Data export: 284,668 bytes, SHA-256
`660afd3ce7308ed7fba71f5fec2f07b1791780e9abb6de26fc8f82ae35041f1b`.
The exports include public application tables and financial records. The data export also contains 26 auth tables and seven storage metadata tables.
Storage object bytes and migration registry are not part of these exports.
[Local restore evidence](BACKUP_RESTORE_EVIDENCE.json) verifies all 28 public
table counts and two sequences. Auth identities/publication were stubbed and
Supabase-only cron/net/Vault extensions omitted locally, so full Supabase
recovery is unverified. New migrations 0039–0045 passed on the restored public
schema/data. Migration registry was also exported privately before applying new versions.
A short maintenance window was used and the original off state restored.

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

Implementation commits through `68feb6f` were pushed to the fork main and
implementation branch; Render deployed that exact revision successfully. Unrelated existing
changes and supplied PDF/image/thesis assets remain outside these batches.

## Prepared read-only preflight

[release-preflight.sql](../backend/scripts/release-preflight.sql) reads applied
versions, relevant function/trigger metadata, aggregate reservations/overdrawn
wallets, legacy missing settlement references and the portfolio bucket from a
read-only repeatable-read transaction, then rolls back. It was executed locally
against migrated PGlite with a fixture migration-history table; no deployed
evidence is implied. Approved target execution is captured in the snapshot below. Presence checks
do not replace definition review or independent-connection contention checks.

The earlier merge preview identified only a README conflict. Upstream integration
is now complete (`4a0dcdd`), including CSV privacy and admin settings updates;
all web gates passed on the merged checkout. No push or deployment has occurred.

## Approved target inspection — October 4

[Sanitized evidence](TARGET_PREFLIGHT_EVIDENCE.json) contains the eight-section
database snapshot and Render health response. No account identities/credentials
are included. The preflight was corrected to return one structured result because
the CLI exposed only the last nonempty result of the initial multi-query file;
the actual application trigger table is `job_applications`. Local verification
of all sections and the full 120-test SQL suite passed after this correction.

- Registry: numbered 0001–0024, 0037–0038 and three dated versions. Numbered
  0025–0036 and new 0039–0045 are absent; absence in the registry alone does not
  mean the SQL is missing. Wallet lock/balance and all four 0036 admin functions
  exist with authenticated execution denied. Historical mapping/definitions still
  need verification before any repair/replay.
- Financial snapshot: zero overreserved wallets/amount; one pending withdrawal
  reserves ₱100; one legacy completed withdrawal lacks a reference. Do not
  invent a reference or infer external delivery from that legacy row.
- Zero active confirmed/in-progress jobs lack bookings. New wallet debit guard,
  service-review/snapshot/cancellation-expiry/portfolio-cap functions and portfolio
  bucket are absent. These observations are consistent with new migrations pending.
- Render reports database up and overall status `ok`, while its ML check is down
  with HTTP 429. The response contains no deployed commit/version identifier;
  exact API revision and ML-dependent integration remain unverified.

The definition read completed on sequential retry after temporary-role
authentication failed during parallel CLI calls. Never run linked CLI login-role
inspections concurrently. The four 0036 admin functions and wallet lock/balance
match whitespace-normalized local definitions. Hire, escrow settlement, complaint
and cancellation-review routines differ, consistent with the new release pending.
The three dated registry names correspond to 0032–0034; only 0034's stored text
hash matches its local file exactly. Names alone do not authorize repairing 0032/0033.
No migration, history repair, payout or code release was performed.

The next release batch is coordinated deployment access, backup completion and
restore verification, then only reviewed new 0039–0045 migrations with atomic
history registration. Do not replay/rewrite older history gaps. The existing
pending ₱100 withdrawal remains reserved; do not invent its legacy payout
reference. API/web/mobile releases and controlled transaction/device checks
remain separate evidence gates.

## Independent connection checks

[Native PostgreSQL evidence](NATIVE_CONCURRENCY_EVIDENCE.json) records four
checks using independent server connections: withdrawal versus withdrawal,
withdrawal versus escrow hold, withdrawal versus Connect reservation, and
rollback recovery. Competing unaffordable spending was rejected with `TB402`;
rollback released the reservation. This verifies local PostgreSQL 18 contention,
not deployed PostgreSQL 17 behavior. No real payment rail was called.

## Approved API/database release — October 4

Migrations 0039–0045 and their exact source-text registry entries committed in
one transaction. Older registry gaps were not repaired or replayed. Fork main
was fast-forwarded to `68feb6f` (the exact hash is in
[deployed release evidence](DEPLOYED_RELEASE_EVIDENCE.json)); Render reported
that revision live after a one-minute deployment. Database and ML health passed;
maintenance was restored to off.

Ten authenticated client/provider/admin endpoint smoke checks passed, including
combined filter query acceptance, snapshot contracts, empty private portfolio
owner/client reads and denied client access to the provider-owner endpoint.
These reads do not prove nonempty filtering, image rendering, state transitions
or payment settlement. Initial checks used expired fixture tokens and then
unsupported query names; renewed fixture sessions and the documented
`status_group`, `category_id`, `limit`, `offset` contract passed.

EAS local archive inspection found the supplied credential file despite local
Git exclusions. Root `.gitignore` now excludes both credential filenames; a new
mobile preview archive verified their absence before any upload. Mobile
typecheck and the full 184-test suite passed again. No Android device is
currently attached; an existing Pixel_10a AVD and EAS project owner access exist.

## Sandbox collection and corrective payment pass

[Sandbox evidence](SANDBOX_PAYMENT_EVIDENCE.json) records a real deployed
Stripe test intent and webhook: ₱20 was rejected below the account’s converted
settlement minimum; ₱50 succeeded with `livemode=false` checked before/after
confirmation and credited the dedicated client wallet exactly once. No manual
ledger funding or live payment was used. Collection is not withdrawal delivery.

The fixed API/mobile card floor is now ₱50; wallet-funded smaller jobs remain
supported. Boundary validation and rendered wallet-form checks were added.
Payment text on hiring, job creation, wallet and help screens now describes the
three-day warranty and open-complaint hold. Backend lint/build and 667 tests,
mobile typecheck and 185 tests passed. Render released the card minimum/copy revision `efb0047`; the matching preview
Android build finished. Installation and device verification remain pending.

## Completion response and deployed case verification

A real funded completion exposed stale `UPDATE RETURNING` data: the database
AFTER trigger stamps `completed_at` in another update. The endpoint now reads
the persisted job before returning, including the warranty deadline. Backend
lint/build and all 667 tests passed, including a stale-returning regression.
Render shows corrective revision `15bc94a` live; a newly funded completion
returned both timestamps exactly 72 hours apart.

[Controlled deployed workflows](DEPLOYED_WORKFLOW_EVIDENCE.json) passed warranty
holds, refused early release, participant statements, admin clarification and
refund, settled-case appeal, agreed/contested prestart cancellation, poststart
review and no-budget complaints. The dedicated provider remained unavailable;
its temporary verification flag was restored. The client wallet ends at ₱50.
A request during deployment returned HTML; saved case state was checked before
resuming without duplicate settlement. Automatic deadline expiry, native UI
and Vercel owner deployment remain open.
