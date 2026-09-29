# Backend/infra handoff — Stripe API version env var blocks provider verification

**Status: open, blocking.** Needs someone with **Render dashboard access** for the backend service
(`taskbuddy-kpek`). No code change is needed to unblock; steps 2–3 make it resilient and need a deploy.

**Who this is for:** whoever holds the Render dashboard and the Stripe Dashboard. The mobile developer
has neither.

## What is broken

In the provider app, **Get Verified → step 3 → Start verification** fails with:

> `Invalid Stripe API version: 2025-21-27`

The mobile app uploads both images successfully, then calls `POST /verifications/identity-session`. The
backend creates a Stripe Identity session and then an ephemeral key pinned to
`process.env.STRIPE_MOBILE_API_VERSION`. On the deployed API that variable holds `2025-21-27`, which is not
a real date (there is no month 21), so Stripe refuses it. The typo exists **only in the Render environment**:
it is not in any commit, in `backend/.env.example` or in the repo defaults.

The same variable feeds `POST /payments/topup` (`payments.service.ts`), so **wallet top-ups by card are very
likely failing with the same error**. Please check both after the fix.

## 1. Fix the variable (unblocks the app immediately, no deploy)

Render dashboard → the backend service → **Environment**:

1. Find `STRIPE_MOBILE_API_VERSION`.
2. Set it to `2025-01-27.acacia` (Stripe's full name for that version), **or delete the variable** so the
   code default is used.
3. **Save.** Render restarts the service.

Cold starts on the free tier take 30–60 s, so allow a minute before testing.

## 2. Deploy the hardening (recommended)

**2026-09-29 local audit:** this hardening is already merged into `upstream/main`
(pulled at `170a288`). Deployment and the Render environment remain unverified.
The branch/merge wording below records the original handoff.


Branch `fix/identity-stripe-version` contains:

- `backend/src/payments/stripe-api-version.ts`. A malformed `STRIPE_MOBILE_API_VERSION` is logged
  (`STRIPE_MOBILE_API_VERSION "…" is not a valid Stripe API version; using 2025-01-27.acacia`) and the default
  is used instead of sending garbage to Stripe.
- `startIdentitySession` now turns a Stripe-side refusal into **503** instead of Stripe's 400, and cancels the
  orphaned Identity session. The app falls back to manual review on a 5xx, so a future Stripe configuration
  problem sends the provider to the admin queue instead of blocking them.

Merge it into `main` and let Render deploy it. Before assuming the deploy carries this, confirm the live API
matches `main`; the project has been bitten by a stale deployment before (`HANDOFF.md` §0).

## 3. Confirm Stripe Identity is activated

Stripe Dashboard → **Identity → Get started**. Identity must be activated on the account
(`docs/stripe-setup.md` §3). If it isn't, step 3 fails even with the right version string. On the deployed
hardening that shows up as the provider being placed in manual review, and Render logs read
`Stripe Identity: could not create the Identity session: …`.

## How to verify

1. In the app: provider account → **Get Verified** → step 3 → **Start verification**. Expected: Stripe's hosted
   Identity page opens in the browser (or, if Identity isn't activated and step 2 is deployed, the screen says
   the documents were submitted for manual review).
2. Render logs must **not** contain `Invalid Stripe API version`.
3. Wallet → top up by card: the PaymentSheet should open.

## Report back

Tell the mobile developer which of these you did: variable changed to what value, whether step 2 is
deployed, and whether Identity is activated. Do not paste any secret values.
