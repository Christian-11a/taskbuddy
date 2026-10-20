# TaskBuddy Project Knowledge Base

- **Audit snapshot:** 2026-10-20
- **Main repository:** `/Users/eduardking/Desktop/taskbuddy`
- **Audited commit:** `790be292da8bc014d0495a45d6fddbb7ff7886a8` (`main`)
- **Purpose:** a source-linked map of the project and its important behavior
  for development, QA, and thesis work.

This is the entry point for project knowledge, not a replacement for the
implementation. For current behavior, source code and SQL migrations control;
the schema guide describes data and lifecycle rules; READMEs explain setup and
operations; the manuscript records what the study says it built and measured.
This audit inspected the checked-out application, its migrations, model
service/artifacts, the separate ML experiment directory, and the attached
manuscript. It is an architecture and behavior audit, not a line-by-line
security review or a live deployment/database audit.

## Authority and source selection

Use the following order when sources differ:

1. Current checked-out application code and checked-in database migrations for
   intended behavior. Check the deployed database separately before claiming
   what is live.
2. [`backend/BACKEND_SCHEMA.md`](../backend/BACKEND_SCHEMA.md) for the current
   schema contract, database functions, feature calculation, and lifecycle
   explanation.
3. Component READMEs for setup and operational notes: [backend](../backend/README.md),
   [mobile](../mobile/README.md), [web](../web/README.md), and
   [ML service](../ml-service/README.md).
4. The thesis manuscript for study design, reported results, and limitations;
   it is not proof that a deployed system was independently measured.
5. Dated handoff documents for historical context only; verify them against
   current source and migrations.

The manuscript supplied for this audit is
`/Users/eduardking/Downloads/Real-Full Manuscript_IOTG9 (2).pdf` (245 pages,
SHA-256 `36208706705062fca00d05b527774b9dd5773d17798c34458f083b28acd1f6e3`).
The similarly named checked-out file
[`test-docs/Real-Full Manuscript_IOTG9.pdf`](../test-docs/Real-Full%20Manuscript_IOTG9.pdf)
is a different two-page PDF (SHA-256
`0ef2e285dc5788a02eb473370cf6661437dfa5e780c2d01648c5f984a582c9b4`). The
findings and slide citations below refer to the 245-page attachment.

The model-comparison scripts and their experiment outputs live in
`/Users/eduardking/Desktop/TaskBuddy ML`, a separate Git repository, not a
submodule of this one. Its audited HEAD was
`387d9014d95d1d5b93756353e4022e7241bc3277`; its working tree was dirty. Its
dataset CSV bytes differ from the main repository copy, but both parse to the
same 40,000-row, 21-column table at this snapshot. Treat the experiment files
and their checked-in results as evidence with that provenance, not as a
reproducible artifact committed to this repository.

## System at a glance

TaskBuddy is an Android-first local home-services marketplace for clients and
service providers. A client posts a job; providers apply; the client chooses a
provider; the payment is confirmed and held against the hire; the provider
records task completion; and client confirmation triggers settlement. If an
unfilled job reaches its configured urgency window, the backend can score
eligible job-provider pairs and invite up to eight providers. The client still
makes the hiring choice.

```text
Android app (Expo / React Native) ─┐
                                   ├─ HTTPS ─ NestJS API ── Supabase
Admin / public web (Next.js) ──────┘              ├──────── FastAPI / Random Forest
                                                  ├──────── Xendit / Stripe
                                                  ├──────── Google OAuth / Stripe Identity
                                                  ├──────── Geoapify
                                                  └──────── Expo Push
```

Both user interfaces use the NestJS API as their application boundary. The
backend talks to Supabase using server-side credentials, calls the model
service for recommendation scores, and integrates with payment, identity,
geocoding, and push services. Client uploads use short-lived signed Supabase
Storage URLs, so image bytes go directly from the device to storage. The API
still validates ownership and allowed upload types.

## Repository map

| Area | Responsibility | Main source |
|---|---|---|
| API and domain logic | REST endpoints, auth/role checks, jobs, proposals, bookings, reviews, chat, payments, verification, recommendations, admin | [`backend/src`](../backend/src), [`backend/src/app.module.ts`](../backend/src/app.module.ts) |
| Database and access controls | Postgres schema, RPCs, triggers, RLS, escrow/ledger transitions | [`backend/supabase/migrations`](../backend/supabase/migrations), [`backend/BACKEND_SCHEMA.md`](../backend/BACKEND_SCHEMA.md) |
| Android client | Client and provider flows, auth, API client, uploads, SSE/chat, notifications | [`mobile/app`](../mobile/app), [`mobile/src`](../mobile/src) |
| Web application | Public information/auth pages and administrator console | [`web/src/app`](../web/src/app), [`web/src/lib/api`](../web/src/lib/api) |
| Recommendation inference | Load the fitted sklearn pipeline, validate feature records, return recommendation probabilities | [`ml-service/app/main.py`](../ml-service/app/main.py), [`ml-service/train_model.py`](../ml-service/train_model.py) |
| Offline model study | Synthetic data generation and RF/LR/SVC model comparison | Separate repo `/Users/eduardking/Desktop/TaskBuddy ML` |

The NestJS app registers domain modules in `backend/src/app.module.ts`. The
main areas are authentication/profiles; jobs/applications/bookings; provider
credentials and identity verification; escrow/payments/payouts; reviews/chat;
recommendations; notifications/push; uploads/geocoding; and administration.
The repository contains 74 numbered Supabase migrations, through 0074 in this
snapshot.

## Important application flows

### Identity, roles, and authorization

- Supabase Auth supplies user identity; the API verifies signed-in requests and
  resolves the profile role. The platform roles are client, provider, and
  administrator.
- NestJS installs a global request validation pipe that transforms inputs,
  rejects unknown fields, and applies DTO validation (`backend/src/main.ts`).
- The API uses server-side Supabase access for protected domain operations.
  Database RLS remains defense in depth; migration 0072 restricts direct
  PostgREST reads and uploads. Migration 0070 restricts roles assigned during
  public sign-up.
- Provider invitations/proposals/hiring depend on approved identity and a
  service-appropriate, current certificate (migration 0068 and the provider
  credential/verification modules).

### Jobs, applications, completion, and reviews

- The client posts a job with category, description, location, schedule/urgency,
  and optional budget/media. Providers browse and submit proposals; a client
  accepts one provider.
- The backend owns status transitions and checks eligibility again when needed.
  The client confirms completion after the provider records checklist work and
  proof media. Reviews are tied to completed work.
- The schema guide and migrations are the place to verify exact statuses and
  transition constraints. Historical handoff notes may describe removed wallet,
  warranty, or early-release behavior.

### Payments and settlement

- There is no customer-facing stored-value wallet. `wallet_transactions` is an
  internal accounting ledger; the escrow row tracks the job-level hold and
  state. Database functions make the hold/ledger transition atomically.
- Xendit checkout/payout integration is configured for sandbox use in the
  manuscript and project documentation. The code also contains a Stripe card
  fallback; the captured card charge is held in the platform Stripe balance
  before a later transfer. Actual custody depends on the configured payment
  rail, and the sandbox does not demonstrate real-money settlement.
- Verified payment callbacks drive the hire/hold; the client app's return from
  checkout does not itself prove payment. On client-confirmed completion, the
  ledger settles the held amount and queues the provider's net payout, with the
  commission rate locked at hire. Disputes prevent normal settlement and route
  through administrator review. Refunds in the reported sandbox workflow are
  simulated.
- See [`backend/src/escrow/escrow.service.ts`](../backend/src/escrow/escrow.service.ts),
  [`backend/src/payments/hire-funding.service.ts`](../backend/src/payments/hire-funding.service.ts),
  and migrations 0056, 0058, 0060, 0064, 0066, 0067, and 0073.

### Recommendations and the Random Forest

**Production inference path:**

1. The backend asks database function `fn_job_provider_features` for the live
   eligible provider pool and the 14 raw features for each job-provider pair.
2. It sends those feature records to `POST /score` in the FastAPI service. IDs
   are excluded from the model input. The fitted preprocessing and classifier
   are loaded from the versioned joblib artifact.
3. FastAPI returns one positive-class probability per input row and a model
   version. The backend checks the result count, ranks the rows, rechecks
   eligibility, saves the recommendation run and feature snapshots, then
   notifies at most the top eight providers.
4. An invitation lets a provider propose; it does not automatically hire them.
   The client remains the decision maker.

Key implementation references:
[`backend/src/recommendations/recommendations.service.ts`](../backend/src/recommendations/recommendations.service.ts),
[`backend/src/recommendations/recommendations.scheduler.ts`](../backend/src/recommendations/recommendations.scheduler.ts),
[`ml-service/app/main.py`](../ml-service/app/main.py), and
[`ml-service/train_model.py`](../ml-service/train_model.py).

**Training data and labels:** the experiment generator creates 5,000 synthetic
jobs, samples eight providers per job from a 3,000-profile pool, and emits
40,000 job-provider rows. It creates structured fields and Taglish job/bio text
from templates. It computes a hiring probability from programmed factors
(including skill match, distance, rating, availability, experience, response
time, urgency, idle time, and weekend availability), then samples the binary
`is_recommended` label from that probability. These are simulated labels, not
records of actual client hiring decisions. They test whether a model can learn
the simulator's pattern; real matching quality requires validation on
representative outcome data.

The main repository includes the production trainer and serving pipeline, the
saved model at [`ml-service/model/rf-a-v1.joblib`](../ml-service/model/rf-a-v1.joblib),
metadata, and [`ml-service/taskbuddy_synthetic_dataset.csv`](../ml-service/taskbuddy_synthetic_dataset.csv).
The three-family comparison runner and generator are only in the separate
`TaskBuddy ML` repository described above.

**Inputs and preprocessing:** the serving contract has 14 raw inputs: nine
numeric features, three categorical features, and two text fields. Each text
field is processed by TF-IDF followed by 20-component TruncatedSVD; the three
categorical values are ordinal encoded. That yields 52 model features (12
structured plus 40 text components). `hire_probability` and record IDs are
excluded from model inputs to avoid target leakage. The saved pipeline keeps
transformations together with the classifier so scoring uses training-fitted
preprocessing.

**Comparison reported by the study:** the separate comparison runner evaluates
Random Forest, Logistic Regression, and SVC, each with three configurations,
over 100 repeated 70/30 `GroupShuffleSplit` partitions grouped by `job_id`.
This keeps candidate rows belonging to the same job on one side of a split.
Across the reported best configurations:

| Best configuration | Accuracy (mean ± SD) | Macro F1 (mean ± SD) | ROC-AUC | Fit time |
|---|---:|---:|---:|---:|
| Random Forest A | 0.8123 ± 0.0029 | 0.8098 ± 0.0028 | 0.8827 | 2.24 s |
| Logistic Regression A | 0.8050 ± 0.0031 | 0.8034 ± 0.0030 | 0.8792 | 0.64 s |
| SVC B | 0.8045 ± 0.0031 | 0.8029 ± 0.0031 | 0.8701 | 29.96 s |

The manuscript reports RF Config A as better than the best LR and SVC configs
on all 100 paired splits (Wilcoxon p < .001; Friedman χ² = 550.59, p < .001).
The selected model is `rf-a-v1` (50 trees, max depth 10). These results measure
agreement with the synthetic generator's labels, not observed success rates on
the live marketplace.

**Metric provenance discrepancy:** the checked-in model metadata records a
separate one-split sanity evaluation with 12,000 rows: accuracy 0.8155, macro
F1 0.8123, ROC-AUC 0.8820. The manuscript reports accuracy 0.8140 for a
12,000-pair held-out partition (pp. 213–215). The sources do not establish that
these are the same run. Keep the comparative 100-split figures and the
artifact's one-split metrics labeled by source; do not merge them into one
result.

### Messaging and integrations

- Chat and workflow updates run through the backend; the mobile app receives
  live updates using Server-Sent Events (SSE) alongside REST endpoints.
- The project integrates Supabase Auth/Postgres/Storage, Xendit checkout and
  payouts, Stripe card checkout and Identity, Geoapify geocoding/maps, Google
  OAuth sign-in, and Expo Push delivery. Credentials are environment-specific;
  never copy values from local env files into audit notes.
- The manuscript and architecture diagram are system-level descriptions. Use
  deployed configuration and current provider callbacks to establish whether a
  particular external integration is live; this audit did not make network
  calls or verify third-party accounts.

## System evaluation and limits

The attached manuscript reports 4,852 software tests: 4,829 passed and 23
failed (99.53% overall). Integration was 219/219, system was 72/72, and
security was 213/213. The 23 failures were unit tests on two client mobile
screens. The manuscript says 19 timed out during heavy host load and passed
when rerun individually; four failures remained unresolved at the time of
reporting (pp. 216–217). These are the manuscript's QA counts, not the local
test run below.

UAT involved 26 purposively selected people in Lipa City using guided Android
sessions: 12 clients, 13 providers, and one technical tester. Client overall
rating was 4.97/5; provider overall was 4.99/5; the single technical tester
rated overall 4.03/5 and efficiency 3.50/5 (pp. 218–223). The study identifies
small purposive sampling and guided sessions as limitations (pp. 232–233).
Ratings represent perceived quality, not measured system speed.

The manuscript says k6 testing was not carried out, so live inference latency
and behavior under concurrent use were not measured (pp. 212, 217, 223, 232–233).
Do not present a response-time, throughput, or load-capacity result as an
observed system metric. This is the principal measurement gap to state in a
defense.

The attached manuscript's p. 218 technical-tester description still contains
an editorial placeholder asking the authors to state the tester's technical
background. Resolve it in the final thesis or be ready to explain the
evaluator's qualification.

## Verification record

Local commands were run in this checkout during this audit on 2026-10-20:

| Area | Command | Result |
|---|---|---|
| Backend tests | `cd backend && npm test -- --runInBand` | Passed: 63 suites, 823 tests |
| SQL tests | `cd backend && npm run test:sql` | Passed: 25 suites, 203 tests |
| Backend build | `cd backend && npm run build` | Passed |
| Backend ESLint | `cd backend && ./node_modules/.bin/eslint "{src,apps,libs,test}/**/*.ts"` | Failed with 22 existing lint findings; no code was changed in this audit |
| Web tests | `cd web && npm test -- --reporter=dot` | Passed: 730 tests; 1 skipped test. One test file skipped. Existing config/render warnings appeared. |
| Web lint/build | `cd web && npm run lint`; `cd web && npm run build` | Passed |
| Mobile tests/typecheck | `cd mobile && npm test -- --runInBand`; `cd mobile && npm run typecheck` | Passed: 196 suites, 3,055 tests; typecheck passed |
| ML source syntax | Python AST parse of `ml-service/train_model.py`, `ml-service/app/main.py`, and the separate experiment generator/runner | Passed |

This audit did not query the live API, database, payment accounts, identity
provider, or deployment platform. README deployment notes are therefore
repository-reported status, not independently verified live status.

The root README's October 2026 status section reports that the ML service had
been returning HTTP 429, that a new mobile preview build/device checks were
still needed, that push delivery needed Firebase/FCM setup, and that live
Xendit keys and real refunds were pending. Treat those as dated repository
notes; check the deployed services and accounts before describing their current
state.

## Thesis-ready performance slide evidence

The companion two-slide deck in `presentations/` is based on the attached
manuscript and checked-in source evidence:

- **Model Performance Evaluation:** manuscript pp. 138–140 and 212–215; repeated
  split protocol, model comparison, and significance test. Cross-check with the
  separate `TaskBuddy ML` experiment results and the `rf-a-v1` artifact.
- **System Performance Metrics:** manuscript pp. 216–223 and 232–234; software
  test pass rates, UAT results, unresolved unit-test failures, and explicit
  absence of measured load/latency results.

These slide figures should be kept source-labeled when reused. The PDF is a
study report; the repository audit distinguishes those reported results from
what this code checkout and its test commands establish.
