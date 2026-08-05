# Stripe Setup — Payments & Identity

Two integrations share one Stripe account and one webhook endpoint:

- **Wallet top-up** — PaymentSheet in the app, credited by webhook (`BACKEND_SCHEMA.md` §21).
- **Stripe Identity** — provider ID verification, decided by webhook instead of by an admin.

Nothing here is required to run the API. Missing keys produce a boot warning, and only
`/payments/*` and `POST /verifications/identity-session` return **503**.

---

## 1. Keys

Stripe Dashboard → **Developers → API keys**. Start in **test mode**.

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
```

The publishable key is served to the app from `POST /payments/config` rather than compiled into
it, so switching between test and live is a backend env change and not a new app build.

## 2. Webhook endpoint

Dashboard → **Developers → Webhooks → Add endpoint**.

- **URL:** `https://taskbuddy-1d48.onrender.com/payments/webhook`
- **Events:**
  - `payment_intent.succeeded`
  - `identity.verification_session.verified`
  - `identity.verification_session.requires_input`

Copy the endpoint's **Signing secret**:

```env
STRIPE_WEBHOOK_SECRET=whsec_...
```

> Each endpoint has its own signing secret, and test and live mode are separate endpoints with
> separate secrets. A test secret will not verify live events — signature verification fails and
> the webhook returns 400 for everything.

The signature is the **only** thing authenticating this endpoint — Stripe has no session, so
there is no JWT. That is also why `main.ts` sets `rawBody: true`: Stripe signs the exact bytes it
sent, and a body that has been parsed and re-serialised will not match.

### Local development

Render can't reach your laptop, so use the Stripe CLI:

```bash
stripe login
stripe listen --forward-to localhost:3000/payments/webhook
# prints: Ready! Your webhook signing secret is whsec_...  ← use this locally
stripe trigger payment_intent.succeeded
```

The CLI prints a **different** signing secret from the Dashboard endpoint. Use the CLI's in your
local `.env`.

## 3. Enable Stripe Identity

Dashboard → **Identity → Get started**. Identity is billed per verification and must be activated
on the account before `POST /verifications/identity-session` will succeed.

## 4. Philippine peso notes

- Amounts are sent in **centavos** — the API multiplies by 100 and rounds.
- Minimum charge is roughly **₱20**; `POST /payments/topup` enforces this so the failure is a
  validation message rather than a confusing gateway error. Maximum is ₱100,000, a blast-radius
  limit rather than a product rule.
- The account's country determines which payment methods appear. Configure them under
  **Settings → Payment methods**; the API requests `automatic_payment_methods`, so whatever is
  enabled there shows up in the sheet without a code change.

## 5. Render

Add all three keys under **Environment** on the Render service, then redeploy. The boot log
confirms the state:

```
WARN [StripeService] Stripe is disabled — missing env: ... ← not configured
```

No warning means the keys were read.

---

## Flow reference

### Wallet top-up

```
App  →  POST /payments/topup { amount }
          ← payment_intent_client_secret, ephemeral_key_secret, customer_id, publishable_key
App  →  initPaymentSheet(...) / presentPaymentSheet()   (@stripe/stripe-react-native)
          Stripe →  POST /payments/webhook  payment_intent.succeeded
            Backend → wallet_transactions row (kind 'topup') + 'payment_update' notification
```

**The app's success callback does not credit the wallet** — the webhook does. Refresh
`GET /wallet` after the sheet closes; on a slow webhook the balance may lag by a second or two.

### Identity

```
App  →  POST /verifications/identity-session
          ← session_id, ephemeral_key_secret, url, publishable_key
App  →  useStripeIdentity({ sessionId, ephemeralKeySecret }).present()
          Stripe →  POST /payments/webhook  identity.verification_session.verified
            Backend → provider_verifications approved + provider_profiles.is_verified = true
```

The result is asynchronous — poll `GET /verifications/me` after the sheet closes. `url` is a
browser fallback for clients that cannot present the native sheet.

## Testing cards

| Card | Result |
|------|--------|
| `4242 4242 4242 4242` | succeeds |
| `4000 0000 0000 9995` | declined (insufficient funds) |
| `4000 0025 0000 3155` | requires 3D Secure authentication |

Any future expiry, any CVC. In Identity test mode the document upload step accepts Stripe's
sample documents — see Stripe's Identity testing docs for the fixture images.

## Verifying idempotency

Redelivering an event must not credit twice. From the Dashboard, open a processed event and click
**Resend**, then check the wallet: the API logs

```
LOG [PaymentsService] PaymentIntent pi_... was already credited
```

and no second ledger row appears. That collision on `uq_wallet_txn_stripe_pi` *is* the
idempotency mechanism (§21).
