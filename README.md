# TaskBuddy

A Philippine home-services marketplace. Clients post jobs — Plumbing, Cleaning,
Handyman, Manicure, Pedicure — and freelance providers apply to them. Job
descriptions and provider bios are written in Taglish.

What makes it more than a job board is the matching: when a job sits unfilled
past its urgency deadline, a trained Random Forest model scores every eligible
provider against it and invites the best-matched few. Hiring moves real money
through an escrow-backed wallet, so a provider who completes a job is paid from
funds that were held the moment they were assigned.

**Live API:** https://taskbuddy-1d48.onrender.com
([status page](https://taskbuddy-1d48.onrender.com/) ·
[health JSON](https://taskbuddy-1d48.onrender.com/health)) — frontends call this;
see the [backend README](./backend/README.md#base-url).

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
5. Approval **assigns** the job and **holds the budget in escrow**, debiting the
   client's wallet. A booking and a chat thread open automatically.
6. The provider starts and finishes the work. When the client marks it complete,
   escrow **releases to the provider**. Cancelling, or a dispute resolved in the
   client's favour, **refunds the client** instead.
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

Clients fund their wallet through Stripe (test mode), and **the wallet is
credited by Stripe's webhook, never by the app reporting its own success** —
balance buys labour, so a client able to mint it could hire for free. Full rules
in [`BACKEND_SCHEMA.md` §18 and §21](./backend/BACKEND_SCHEMA.md).

Stripe is not available to Philippine businesses; a production launch would move
to PayMongo, Xendit or Maya, which also support GCash. The escrow design is
gateway-independent.

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
