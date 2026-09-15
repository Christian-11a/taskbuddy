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

- **URL:** `https://taskbuddy-kpek.onrender.com/payments/webhook`
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

Add all three keys under **Environment** on the Render service, then redeploy.
For provider payouts, add the Connect variables from §6 as well. The boot log
confirms the state:

```
WARN [StripeService] Stripe is disabled — missing env: ... ← not configured
```

No warning means the keys were read.

## 6. Stripe Connect — provider payouts

Providers are paid through **Connect Express** accounts, onboarded on Stripe's
own hosted pages (`BACKEND_SCHEMA.md` §29). The API only creates the account,
hands out links, and records what Stripe reports. Bank details never reach
TaskBuddy.

**Optional.** Without it everything else works. Card-funded payouts then stay
in the provider's TaskBuddy wallet, the same as a wallet-funded job.

### Enable Connect (test mode first)

1. Dashboard → **Connect → Get started** → choose **Platform or marketplace**.
2. **Settings → Connect → Branding**: set the name, icon and colour. Account
   links fail with a confusing error until branding is set.
3. **Settings → Connect → Express**: leave the defaults. The API asks only for
   the `transfers` capability. Providers never take card payments themselves;
   TaskBuddy charges the homeowner and sends the provider their share
   ("separate charges and transfers").

### The Connect webhook endpoint

This is a **second** endpoint, separate from the one in §2. Stripe delivers
events about connected accounts only to an endpoint created for them, and
that endpoint has its own signing secret.

Dashboard → **Developers → Webhooks → Add endpoint**:

- **URL:** `https://taskbuddy-kpek.onrender.com/payments/connect/webhook`
- **Listen to:** **Events on Connected accounts**
- **Events:** `account.updated`, `capability.updated`
- **API version:** the same as the platform endpoint

```env
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_...   # this endpoint's secret, not §2's
```

Without it the API warns at boot, and a provider's status updates only when
they tap **Refresh status** or return from onboarding (the app syncs on
return either way).

### Where providers' accounts are created

```env
STRIPE_CONNECT_COUNTRY=US                  # default
STRIPE_CONNECT_SERVICE_AGREEMENT=full      # default; 'recipient' for cross-border
```

Stripe has no Philippine platform accounts. A PH provider can only be a
**cross-border recipient** account on a platform in a supported country:
`STRIPE_CONNECT_COUNTRY=PH` plus `STRIPE_CONNECT_SERVICE_AGREEMENT=recipient`,
and only once Stripe has confirmed cross-border payouts for this platform. In
test mode, leave the defaults: US Express accounts onboard with Stripe's test
data (below) on any test platform.

### Test-mode onboarding data

On Stripe's hosted form: phone `000 000 0000` with SMS code `000000`; date of
birth `1901-01-01`; SSN `000-00-0000`; address line 1 `address_full_match`;
routing number `110000000` with account number `000123456789`. The account
becomes **Active** in the app a few seconds later.

### Local development

```bash
stripe listen \
  --forward-to localhost:3000/payments/webhook \
  --forward-connect-to localhost:3000/payments/connect/webhook
```

The CLI signs both streams with the **one** secret it prints. Locally, set
`STRIPE_WEBHOOK_SECRET` and `STRIPE_CONNECT_WEBHOOK_SECRET` both to it.

## 7. Card-at-hire and payout transfers — the test-mode check

Card-at-hire needs no new configuration: its payments arrive as `payment_intent.succeeded` on the
§2 endpoint, told apart by `metadata.purpose = 'hire_funding'`.

Payout transfers depend on two facts about **this** platform account, which can only be read from
Stripe. Run the checks below once in test mode before relying on transfers, and record the answers
here. `BACKEND_SCHEMA.md` §29.5 explains why they matter.

```bash
# 1. The settlement currency. The code transfers in the charge's balance-transaction currency
#    whatever it is; this just tells you what it will be.
stripe get /v1/account | grep -E '"country"|"default_currency"'

# 2. What a PHP card charge became. Pay a hire by card with 4242 4242 4242 4242, then:
stripe charges retrieve ch_... --expand balance_transaction
#    → balance_transaction.currency / .amount / .exchange_rate

# 3. A source_transaction transfer for the full gross settled amount (the basis the code uses).
#    Expected: success.
stripe transfers create --amount <bt.amount> --currency <bt.currency> \
  --destination acct_... --source-transaction ch_...

# 4. The same in PHP. Expected: a currency error. That is why wallet balances are not sent.
stripe transfers create --amount 100 --currency php --destination acct_... --source-transaction ch_...
```

If step 3 is refused for exceeding the charge, the platform must transfer the **net** settled
amount instead. Change `computeTransferAmount`'s basis from `bt.amount` to `bt.net`, a one-line
change covered by its unit test. For a cross-border PH recipient account, repeat onboarding with
`STRIPE_CONNECT_COUNTRY=PH` and `STRIPE_CONNECT_SERVICE_AGREEMENT=recipient`, and record whether
Stripe allows it.

**Recorded results:** _not yet run_. Fill in the account country, settlement currency, and the
outcome of steps 3–4.

**End to end, in test mode** (with `stripe listen` from §6 running):

1. A provider finishes **Profile → Payouts**. Their status turns Active, and
   `provider_payout_accounts.transfers_active = true`.
2. A homeowner posts a ₱1,000 job, the verified provider applies, and the homeowner taps **Accept →
   Pay by card** with `4242…`. The proposal turns Hired, and the escrow reads
   `held` / `card` / `pi_…` / `ch_…`.
3. `stripe events resend evt_…` for that payment adds no rows.
4. The provider starts the job and the homeowner completes it. The provider's ledger shows
   `payout +1000` and a completed `connect_transfer −1000`, and the escrow is `transferred`.
   `stripe transfers retrieve tr_…` shows the `source_transaction`.
5. Failure path: complete a card job for a provider with no payout account. It lands `not_eligible`
   and the money stays in their wallet. Finish onboarding, then use **Retry transfer** on the
   console's Escrow tab, or `POST /internal/tick/payments`.
6. `4000 0000 0000 9995` (declined) produces no webhook and no hire. `4000 0025 0000 3155` runs 3D
   Secure first.

Never refund a card hire from the Stripe Dashboard. Refunds go to the wallet through the app, and a
Dashboard refund would pay the client twice.

---

## Flow reference

### Wallet top-up — hosted Checkout (what the app uses)

`@stripe/stripe-react-native` ships native code, and the app runs in **Expo Go**, which cannot
load native modules. Checkout needs only a browser, so this path works in Expo Go, in a dev
build and on the web.

```
App  →  POST /payments/checkout-session { amount, app_redirect }
          ← url  (checkout.stripe.com/...)
App  →  WebBrowser.openAuthSessionAsync(url, app_redirect)
          User pays on Stripe's page
          Stripe →  302 to GET /payments/return?status=success&app_redirect=...
            Backend → 302 to  <app_redirect>?topup=success   ← browser closes
          Stripe →  POST /payments/webhook  payment_intent.succeeded
            Backend → wallet_transactions row (kind 'topup') + 'payment_update' notification
```

`/payments/return` exists because Stripe accepts only http(s) in `success_url` — the
`taskbuddy://` deep link cannot be handed to it directly, so the backend does the final hop.
`app_redirect` is allowlisted (same check as the Google flow) at both ends; without that,
`/payments/return` would be an open redirect.

**No new Dashboard subscription is needed.** The session sets the payer identity in
`payment_intent_data.metadata`, so the existing `payment_intent.succeeded` handler credits the
wallet for Checkout and PaymentSheet alike.

### Wallet top-up — PaymentSheet (needs an EAS dev build)

```
App  →  POST /payments/topup { amount }
          ← payment_intent_client_secret, ephemeral_key_secret, customer_id, publishable_key
App  →  initPaymentSheet(...) / presentPaymentSheet()   (@stripe/stripe-react-native)
          Stripe →  POST /payments/webhook  payment_intent.succeeded
            Backend → wallet_transactions row (kind 'topup') + 'payment_update' notification
```

Kept for when the team moves off Expo Go — better UX and saved cards. Nothing in the backend
has to change to switch.

**Neither path's success callback credits the wallet** — the webhook does, on Stripe's word
that the charge settled. Refresh `GET /wallet` afterwards; on a slow webhook the balance may
lag by a second or two, which is why the app polls briefly before giving up.

> `POST /wallet/transactions` refuses `direction: 'credit'`. It used to accept it, back when
> there was no gateway — which meant any authenticated caller could mint balance for free, and
> balance buys real labour through escrow. Funding now has exactly one entry point: a signed
> Stripe webhook. Withdrawals (`direction: 'debit'`) still go through that endpoint.

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
