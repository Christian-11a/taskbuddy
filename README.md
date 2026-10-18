# TaskBuddy

A Philippine home-services marketplace. Clients post jobs — Plumbing, Cleaning,
Handyman, Manicure, Pedicure — and freelance providers apply to them. Job
descriptions and provider bios are written in Taglish.

What makes it more than a job board is the matching: when a job sits unfilled
past its urgency deadline, a trained Random Forest model scores every eligible
provider against it and invites the best-matched few. A client pays for the
hire at checkout, the payment is held in escrow, and it is released to the
provider's linked GCash, Maya or bank account the moment the client confirms
the job is done. Payments and payouts run in Xendit's test mode.

**Live API:** https://taskbuddy-kpek.onrender.com
([status page](https://taskbuddy-kpek.onrender.com/) ·
[health JSON](https://taskbuddy-kpek.onrender.com/health), which reports the
deployed commit). Render deploys the fork's `main`
(`Eduard-K-A/taskbuddy`), which tracks upstream `erianthe17/taskbuddy`. Frontends call this;
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
5. The client **pays at hire** (Xendit test checkout: GCash, Maya, card or
   online banking). The payment webhook holds the money in escrow and confirms
   the job; a booking and chat thread open automatically. A provider must have
   a linked payout account before they can apply.
6. The provider ticks off the job's checklist with proof photos. When the
   client confirms completion, the payment is **released at once**, minus the
   platform commission, which is locked at the rate in force when the job was
   hired. Complaints can be raised only before completion; an open one freezes
   the money until an admin releases or refunds it, and the job shows as
   `disputed`.
7. The client leaves a rating, which feeds back into the provider's score for
   future recommendations.

## Architecture

Both frontends talk to the NestJS API and nothing else — never to Supabase or
the model service directly.

```
   ┌──────────────┐        ┌──────────────┐
   │  mobile/     │        │  web/        │
   │  Expo · RN   │        │  Next.js     │
   │  clients +   │        │  public site │
   │  providers   │        │  + admin     │
   └──────┬───────┘        └──────┬───────┘
          │     HTTPS · auth      │
          └───────────┬───────────┘
                      ▼
             ┌──────────────────┐         ┌────────────────────┐
             │    backend/      │────────▶│    ml-service/     │
             │  NestJS REST API │  score  │  FastAPI · sklearn │
             └────────┬─────────┘         │  rf-a-v1           │
                      │                   └────────────────────┘
                      ▼
             ┌──────────────────┐         ┌──────────────────────┐
             │    Supabase      │         │ Xendit · Stripe ·    │
             │  Postgres · Auth │         │ Geoapify · Expo Push │
             │                  │         └──────────────────────┘
             │  Storage · RLS   │
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
| [`web/`](./web) | **Next.js public promo/auth site and admin console** — marketplace jobs remain in mobile: [`web/README.md`](./web/README.md) |

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

There is **no user wallet** (migration 0056). Money comes in for one job and
goes straight back out:

- **Paying.** A client pays for a hire at a Xendit test-mode checkout, or by
  Stripe card checkout when Xendit is not configured. The hire is made by the
  payment webhook, never by the app reporting its own success.
- **Releasing.** Confirming completion releases the payment immediately
  (0060). There is no warranty hold, and early release was removed (0064).
- **Payouts.** The provider's share goes to their linked GCash, Maya or bank
  account through Xendit's sandbox Payouts API (0058), sent by the API's
  payments tick and retried automatically if it fails. Providers never request
  a withdrawal. Refunds to clients are simulated.
- **Commission.** A configurable fraction of each released payment is
  withheld, at the rate locked when the job was hired (0067). Providers see the
  fee breakdown up front. Admins see the total earned, this month's figure and a pending
  estimate (`GET /admin/commission`, dashboard totals).
- **Price changes** after hire: a decrease is refunded, and an increase waits
  for the client to pay the difference (0057).

`wallet_transactions` remains as the internal ledger the escrow functions
write to. Full rules: [`backend/README.md` → Payments without a wallet](./backend/README.md#payments-without-a-wallet).

## Getting started

Each part has its own setup instructions — start with the backend, since both
frontends depend on it:

```bash
# each from the repository root, in its own terminal
(cd backend && npm install && npm run start:dev)   # API on :3000
(cd mobile  && npm install && npm run android)     # Android development build
(cd web     && npm install && npm run dev)         # admin console
```

The mobile app defaults to the deployed API, so it runs with no local setup.
The web console defaults to `http://localhost:3001`; set
`NEXT_PUBLIC_API_URL` in `web/.env.local` to use the deployed API (see
[`web/README.md`](./web/README.md)).

> **Free-tier note:** the Render backend spins down after ~15 minutes idle, so
> the first request can take 30–60 s. A slow first load is a cold start, not a
> crash. `ml-service` is not kept warm, so recommendations may be unavailable
> until it wakes.

## Setup guides

| Guide | Covers |
|---|---|
| [`docs/google-auth-setup.md`](./docs/google-auth-setup.md) | Server-side Google OAuth (works in Expo Go) |
| [`docs/password-reset-setup.md`](./docs/password-reset-setup.md) | Supabase email template + SMTP for reset codes |
| [`docs/email-otp-setup.md`](./docs/email-otp-setup.md) | Signup confirmation codes |
| [`docs/stripe-setup.md`](./docs/stripe-setup.md) | Stripe keys, webhooks, Identity (card checkout fallback and identity verification) |

## Status and open work (October 2026)

- **Deployed:** the API on Render runs upstream `main` (check `/health` for
  the commit). Supabase has migrations through **0069**, including 0068
  (certificates required). Some were applied outside the history, so verify by
  the objects each file creates. New migrations start at **0070**.
- **Certificates are now required** to propose, be invited or be hired: an
  approved identity check plus an approved, unexpired TESDA, PRC or trade
  certificate for that service. Applying 0068 left no provider verified until
  certificates are uploaded and approved.
- **Open backend work** is planned in
  [`docs/backend-handoff-plan-2026-10-18.md`](./docs/backend-handoff-plan-2026-10-18.md):
  deploy what is merged, harden payouts before real money, the audit's
  security items, real refunds, and the handoff leftovers.
- **Admin website:** Disputed status and filter, Failed payouts page, one
  verification case per provider (ID, selfie and certificate), commission
  headline; warranty, Issue Credit and the separate Credentials tab removed. It
  goes live when the owner syncs Vercel.
- **Mobile** needs a new EAS preview build with the certificate step; older
  builds expect the removed wallet and warranty.
- **Device checks** of the newest mobile flows (pay at hire, completion
  release, payout account gate, notification routing, proof photos) are open.
- **ML service** health has been returning HTTP 429; recommendations may be
  unavailable.
- **Push notifications** need Firebase `google-services.json` and FCM
  credentials, then a new EAS build (EAS owner `taskbuddy-android`).
- **Admin verification emails** need a verified sending domain.
- **Production payments** would need live Xendit keys and real refunds.

[`HANDOFF.md`](./HANDOFF.md) and `docs/backend-handoff-*.md` hold older,
dated handoff notes, many from the wallet and Stripe era. Check them against
the READMEs before acting on them.

Local QA credential files are excluded by the root `.gitignore`, so EAS build
archives omit them (`.git/info/exclude` alone was not enough for EAS).
