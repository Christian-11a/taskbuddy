# Backend/infra handoff — Stripe webhook deliveries all failing (wallet never credited)

**Status: open, blocking (2026-10-01).** Needs someone with **Render dashboard** access for the backend
service (`taskbuddy-kpek`) and the **Stripe Dashboard (sandbox)**. No code change is expected.

**Who this is for:** whoever holds Render and Stripe. The mobile developer has neither.

## What is broken

Homeowner **Wallet → Add Money** takes the user through Stripe Checkout, and the payment succeeds. But the balance
**never** increases. The wallet is credited only by Stripe's webhook (`POST /payments/webhook` →
`PaymentsService.creditWallet`), and Stripe has not delivered a single event successfully:

- Sandbox webhook endpoint `we_1U18ZLGTYKYLCNTZIBqViPD3` →
  `https://taskbuddy-kpek.onrender.com/payments/webhook`, enabled, subscribed to
  `payment_intent.succeeded` + the two `identity.verification_session.*` events. URL and events are correct.
- Every `payment_intent.succeeded` since at least **2026-09-28** has `pending_webhooks = 1` (never got a 2xx).
  All carry correct `purpose=wallet_topup` / `profile_id` metadata.
- The live route exists. A POST with a bogus signature returns **400**, and Checkout creation works, so
  `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` and `STRIPE_WEBHOOK_SECRET` are all *set*.

**Most likely cause:** `STRIPE_WEBHOOK_SECRET` on Render is not this endpoint's signing secret. It might be a
`stripe listen` secret, one from an older/deleted endpoint, or one from the non-sandbox account. Then every delivery fails signature
verification with a 400.

The same webhook drives **card-at-hire** (the webhook accepts the application and places the escrow hold,
`BACKEND_SCHEMA.md` §29.4) and **Stripe Identity results**. Both are broken by this too.

## 1. Confirm the failure reason

Stripe Dashboard (sandbox) → **Developers → Webhooks** → the `taskbuddy-kpek…/payments/webhook` endpoint →
**Event deliveries** → open a failed `payment_intent.succeeded` → read the response.

| Response | Meaning | Next |
|---|---|---|
| 400 `Webhook signature verification failed…` | wrong secret on Render | §2 |
| 400/500 mentioning Supabase / a DB error | handler bug | send the body to the mobile dev; don't resend yet |
| Timeout / 502 / 503 | Render asleep or down | §3 (retries usually land once warm) |

## 2. Set the right secret

1. Same endpoint page → **Signing secret → Reveal** → copy the `whsec_…`.
2. Render → `taskbuddy-kpek` → **Environment** → set `STRIPE_WEBHOOK_SECRET` to it → **Save** (restarts the
   service; allow ~1 min on the free tier).

## 3. Replay the failed events

Stripe auto-retries for 3 days, so the oldest events are about to expire. On each failed delivery, click **Resend**.
This is **safe**: the ledger insert is keyed on the PaymentIntent (`uq_wallet_txn_stripe_pi`), so a
payment credits at most once. A replay of an already-credited payment logs
`PaymentIntent … was already credited` and returns 200.

**Note:** the mobile developer's own test account was credited by hand in the meantime, via SQL rows carrying the real
`stripe_payment_intent_id`s. Replaying those events is a no-op by design. Don't delete those rows.

## How to verify

1. Resent events show **200** in Event deliveries.
2. In the app: Wallet → Add Money → ₱500 → test card `4242 4242 4242 4242`. The dialog should say
   **"Money added"**. If it says "Payment received", the credit didn't land within ~18 s.
3. Render logs show `Handled Stripe event payment_intent.succeeded (evt_…)` and `Credited ₱… to …`.

## Report back

Tell the mobile developer what §1 showed, whether the secret was changed, and whether the resends returned 200.
Do not paste the secret.
