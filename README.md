# TaskBuddy

A Philippine home-services marketplace. Clients post jobs — Plumbing, Cleaning,
Handyman, Manicure, Pedicure — and freelance providers apply to them. Job
descriptions and provider bios are written in Taglish.

What makes it more than a job board is the matching: when a job sits unfilled
past its urgency deadline, a trained Random Forest model scores every eligible
provider against it and invites the best-matched few. Hiring moves real money
through an escrow-backed wallet, so a provider who completes a job is paid from
funds that were held the moment they were assigned.

**Live API:** https://taskbuddy-kpek.onrender.com
([status page](https://taskbuddy-kpek.onrender.com/) ·
[health JSON](https://taskbuddy-kpek.onrender.com/health)) — frontends call this;
see the [backend README](./backend/README.md#base-url).

**Live ML-SERVICE:** https://taskbuddy-ml-service-8ppc.onrender.com

---

## How it works

1. A client posts a job: category, Taglish description, location, urgency, and
   optionally a budget, schedule and photos.
2. Providers browse open jobs and **apply organically**. The client may approve
   **exactly one**.
3. If nobody is approved by the urgency deadline — **urgent 5 min, normal
   10 min, flexible 15 min** — the recommendation engine runs. It builds the
   eligible provider pool, computes 14 features per job–provider pair, scores
   them, and invites the **top 8** by notification.
4. Invited providers apply like any other applicant; the client still approves
   exactly one.
5. Approval **confirms** the job and **holds the budget in escrow**, debiting the
   client's wallet. A booking and chat thread open automatically; the provider
   starts actual work later, without another acceptance.
6. Client completion confirmation starts a **72-hour warranty hold**. Funds
   release after that window if no timely complaint remains open. Hired-job
   cancellation keeps funds held during the response/admin-review process;
   a decision determines whether they release or refund.
7. The client leaves a rating, which feeds back into the provider's score for
   future recommendations.

## Architecture

Both frontends talk to the NestJS API and nothing else — never to Supabase or
the model service directly.

```
   ┌──────────────┐        ┌──────────────┐
   │  mobile/     │        │  web/        │
   │  Expo · RN   │        │  Next.js     │
   │  clients +   │        │  admin only  │
   │  providers   │        │              │
   └──────┬───────┘        └──────┬───────┘
          │      HTTPS · JWT      │
          └───────────┬───────────┘
                      ▼
             ┌──────────────────┐         ┌────────────────────┐
             │    backend/      │────────▶│    ml-service/     │
             │  NestJS REST API │  score  │  FastAPI · sklearn │
             └────────┬─────────┘         │  rf-a-v1           │
                      │                   └────────────────────┘
                      ▼
             ┌──────────────────┐         ┌────────────────────┐
             │    Supabase      │         │  Stripe · Brevo    │
             │  Postgres · Auth │         │  Expo Push         │
             │  Storage · RLS   │         └────────────────────┘
             └──────────────────┘
```

The API holds the service-role key and enforces every authorization rule in
code; RLS is defence in depth, not the primary gate. Images never pass through
the API — clients upload straight to Supabase Storage using short-lived signed
URLs and submit the resulting object path.

## Repository layout

| Folder | What it is |
|---|---|
| [`backend/`](./backend) | **NestJS REST API + Supabase schema** — the active focus. Start here: [`backend/README.md`](./backend/README.md) |
| [`ml-service/`](./ml-service) | **Python FastAPI recommendation scorer** serving the trained `rf-a-v1` Random Forest: [`ml-service/README.md`](./ml-service/README.md) |
| [`mobile/`](./mobile) | **Expo / React Native app** — the marketplace itself (clients + providers): [`mobile/README.md`](./mobile/README.md) |
| [`web/`](./web) | **Next.js admin console** — back-office only, no client/provider surface: [`web/README.md`](./web/README.md) |

The authoritative data-schema and product spec is
[`backend/BACKEND_SCHEMA.md`](./backend/BACKEND_SCHEMA.md). Treat it as the
source of truth for tables, lifecycle rules and ML feature computation.

## The recommendation engine

`rf-a-v1` is a scikit-learn Random Forest trained on 40,000 synthetic
job–provider pairs, scoring how likely a pairing is to end in a hire. It reads
14 raw features — distance, skills match, provider rating and history,
availability, timing, plus the Taglish job description and provider bio as text.

All preprocessing (ordinal encoding, TF-IDF + SVD on the two text fields,
scaling) lives **inside the persisted sklearn Pipeline**, so the backend passes
raw values with exact column names and never pre-encodes anything.

Every scored candidate is snapshotted with its feature vector and eventual
outcome, so production data accumulates as future retraining rows. Details in
[`BACKEND_SCHEMA.md` §8–9](./backend/BACKEND_SCHEMA.md).

## Money

The wallet ledger is the **only account of record** — balances are derived from
it, never stored. Hiring holds the job budget in escrow, so a client whose
balance can't cover it is refused at the point of accepting an application.

Clients fund their wallet through Stripe (test mode), or pay a hire by card at
the moment they accept. Either way **the wallet is credited by Stripe's webhook,
never by the app reporting its own success**. Balance buys labour, so a client
able to mint it could hire for free, and for a card hire it is the webhook that
places the escrow hold. Balance can appear one other way: an admin issuing a
recovery credit after a dispute, which is a separate audited route for that
reason ([§28.1](./backend/BACKEND_SCHEMA.md)).

Providers can connect a Stripe Connect Express account. A card-paid job's
payout is then sent to it automatically when the job completes, and everything
else is withdrawn by request. Full rules in
[`BACKEND_SCHEMA.md` §18, §21 and §29](./backend/BACKEND_SCHEMA.md).

Stripe is not available to Philippine businesses, and cannot hold pesos, which
is why only card-funded payouts can be sent on through it (§29). A production
launch would move to PayMongo, Xendit or Maya, which also support GCash. The
escrow design, with the ledger as the account of record, is gateway-independent.

## Getting started

Each part has its own setup instructions — start with the backend, since both
frontends depend on it:

```bash
# each from the repository root, in its own terminal
(cd backend && npm install && npm run start:dev)   # API on :3000
(cd mobile  && npm install && npm start)           # Expo — press a / i / scan QR
(cd web     && npm install && npm run dev)         # admin console
```

The mobile app defaults to the deployed API, so it runs with no local setup.

> **Free-tier note:** the Render backend spins down after ~15 minutes idle, so
> the first request can take 30–60 s. A slow first load is a cold start, not a
> crash. `ml-service` is not kept warm, so recommendations may be unavailable
> until it wakes.

## Setup guides

| Guide | Covers |
|---|---|
| [`docs/google-auth-setup.md`](./docs/google-auth-setup.md) | Server-side Google OAuth (works in Expo Go) |
| [`docs/password-reset-setup.md`](./docs/password-reset-setup.md) | Supabase email template + SMTP for reset codes |
| [`docs/stripe-setup.md`](./docs/stripe-setup.md) | Stripe keys, webhooks, Identity, local CLI testing |

## Backend handoff

**For backend / Render / Stripe / Supabase / Firebase work, start at
[`HANDOFF.md`](./HANDOFF.md).** Check its dated updates against the current
environment before acting: some older deployment and webhook asks have since
been completed.

| Priority | Ask | Needs | Details |
|---|---|---|---|
| High | Verify a fresh sandbox wallet top-up credits the wallet exactly once, then test card-at-hire and Stripe Identity on a device. A resent `payment_intent.succeeded` returned HTTP 200 after the signing-secret change, but this does not prove the full flows | Stripe + Render + mobile | [`docs/backend-handoff-stripe-webhook-secret.md`](./docs/backend-handoff-stripe-webhook-secret.md) |
| High | Check the current Render `STRIPE_MOBILE_API_VERSION` and exercise Identity/top-up creation; an earlier Identity request failed with `Invalid Stripe API version: 2025-21-27` | Render + Stripe | [`docs/backend-handoff-stripe-identity-config.md`](./docs/backend-handoff-stripe-identity-config.md) |
| High | Migration 0038 is applied to the linked Supabase project. Verify the restarted Render API serves the new admin search and `has_password` contracts; the health check does not identify the deployed commit. Deploy the web/mobile clients separately | Render + Vercel + EAS | [`backend/README.md`](./backend/README.md) |
| Medium | Investigate the ML service's HTTP 429 before claiming recommendations work end to end | Render + ML service | [`HANDOFF.md`](./HANDOFF.md) |
| Medium | Push notifications: add Firebase `google-services.json` + FCM credentials, then rebuild | Firebase + EAS | `HANDOFF.md` §4 |
| Low | Run the k6 money-path load test (it writes to prod, so it needs a go-ahead) | Render/Supabase tier visibility | `HANDOFF.md` §3, [`backend/load/README.md`](./backend/load/README.md) |

Product decisions that block further backend work are listed in `HANDOFF.md` (Update 2026-09-24 and
2026-09-29). `docs/backend-handoff-*.md` has deeper writeups on specific subsystems, for example
[`docs/backend-handoff-wallet-payout-rail-spike.md`](./docs/backend-handoff-wallet-payout-rail-spike.md)
(why the withdrawal payout rail can't reuse the Stripe Connect payout service as-is).

The linked project's migration 0038 functions were verified after application.
Its older migration-history mismatch still prevents a clean `supabase db push
--dry-run`; do not repair history based only on a dry-run suggestion. The
Render API restarted after the fork's `main` push and returned HTTP 200 with
database `up`, but exact deployed-commit identity and client releases remain
unverified. Password-reset OTP expiry is configured in Supabase Auth to one
hour; see [`docs/password-reset-setup.md`](./docs/password-reset-setup.md) for
the template and failure-log checks.

## Test-document implementation — October 4

[Implementation plan](test-docs/IMPLEMENTATION_PLAN.md) and
[requirement verification matrix](test-docs/VERIFICATION_MATRIX.md) track all 22
populated PDF requirements. Phases 1–9 are implemented locally: confirmed hiring,
warranty/cancellation review, shared notifications, approved services and saved
location, job filters, owned portfolios, readable signup/policy/photo viewing,
reactive themes, and traceable payout requests. Migrations **0039–0045** were applied and registered atomically on October 4.
Render is live at `68feb6f`; database and ML health checks pass. Web deployment
requires the Vercel project owner; deployed workflows and device checks remain open.

The selected withdrawal demonstration is a **local simulator**, not bank/GCash
delivery. Run `node backend/scripts/payout-demo.mjs`; see
[payout evidence](test-docs/PAYOUT_VERIFICATION.md). Automated validation does not
replace deployed two-role/admin or physical-device verification.

Local QA credential files are excluded by the root `.gitignore` so EAS build
archives omit them. A local archive inspection verified this before upload;
`.git/info/exclude` alone was insufficient for EAS.
