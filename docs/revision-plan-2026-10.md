# Revision plan — October 2026 (mobile + backend)

Status (2026-10-16): all six items are built on branch
`feat/terms-identity-credentials`, not yet deployed. Decisions: Xendit test (switched from PayMongo on 2026-10-16) 
mode for pay-in and simulated payouts (Q1); existing wallet balances removed
(Q2); the provider portfolio already existed (Q3); no service requires a
credential, approved credentials only add a Certified badge (Q4). Still open:
the web admin's withdrawal/recovery-credit pages, and price change requests,
which assume a wallet.

## 0. Order of work

1. Pricing tiers (self-contained, no payment-provider decision needed)
2. Terms & conditions rewrite + versioned acceptance
3. Automated Stripe Identity (KYC) approval
4. Provider credentials (TESDA, licences, certificates)
5. Sample work portfolio ("sample port" — see open question Q3)
6. Wallet removal → linked bank / GCash / Maya, Chat tab replaces Wallet

Wallet removal goes last because it touches escrow, hiring, payouts, disputes,
recovery credits and the web admin queues; the other items don't depend on it.

---

## 1. Remove the in-app wallet; pay through banks / GCash / Maya

**Goal:** the app never holds a peso balance of its own. Money goes from the
client's bank/e-wallet into a held payment for one job, and out to the
provider's bank/e-wallet on release.

### Backend
- **Payment provider decision (Q1).** Stripe does not offer GCash/Maya or PH
  online banking as pay-in methods. PayMongo (PH) supports GCash, Maya, cards,
  GrabPay and online banking (BPI/UnionBank), plus payouts. Recommended:
  PayMongo for pay-in and payouts; keep Stripe only for Identity (KYC).
- **Hire = one payment per job.** Replace wallet-funded hires with a
  checkout/payment intent per job (`funding_method` = `gcash` | `maya` | `card`
  | `online_banking`). The webhook places the `held` escrow and accepts the
  application — the same shape as today's card-at-hire path (§29.4).
- **Release = payout to the provider's linked account**, not a ledger credit.
  New `provider_payout_accounts` (type `bank` | `gcash` | `maya`, account name,
  masked number, provider reference, verified flag).
- **Refund = refund to the original payment method** via the provider API.
- **Retire:** `GET /wallet`, `POST /wallet/withdrawals`, `POST
  /wallet/transactions`, recovery credits, the admin withdrawal queue. Keep the
  ledger table read-only for history/audit; add a migration that blocks new
  `wallet_transactions` rows except imported history.
- **Existing balances (Q2):** decide how to pay out/refund balances left in
  wallets before the switch (one-time admin settlement run).
- Price change requests (0049) and early release (0046/0050) must re-point to
  the new payment rows: a price increase needs a top-up charge, a decrease a
  partial refund.

### Mobile
- Remove `HOWalletScreen`, `SPWalletScreen`, `WithdrawModal`, wallet branch of
  `HirePaymentModal`. Hire flow offers GCash / Maya / bank / card.
- **Bottom nav: Wallet tab → Chat tab** (conversation list, unread badge; the
  chat screens already exist).
- Provider Profile → Payouts becomes "Payout account" (link bank / GCash / Maya).
- Payment history moves to a read-only list under Profile.

### Web admin (follow-up)
- Withdrawal and recovery-credit pages retired; Transactions shows provider
  payments/payouts/refunds.

---

## 2. Estimated price tiers instead of manual budget

**Goal:** client cannot type a price. They pick one of three tappable options
computed from category, tasks and urgency.

### Backend
- Migration: `category_pricing` (category_id, base_min, base_max),
  `task_weights` (per task template: `light` 1.0 / `moderate` 1.5 /
  `heavy` 2.2 — "demanding" tasks), `urgency_multipliers`
  (`normal` 1.0, `soon` 1.25, `urgent` 1.6). Admin-editable.
- `POST /jobs/price-estimate` `{ category_id, tasks[], urgency }` →
  `{ options: [{ tier: 'basic'|'standard'|'premium', min, max, amount }] ,
  quote_id, expires_at }`. Formula:
  `base × Σ task weights (diminishing after N tasks) × urgency multiplier`,
  rounded to ₱50.
- `POST /jobs` takes `quote_id` + `tier` instead of `budget`; the server sets
  `budget` from the stored quote. Reject a raw `budget` field.
- Job change requests (`type = price`) offer a re-quote instead of free entry.

### Mobile
- `HOCreateJobScreen` step 4: remove the budget input; show three price cards
  (range + chosen amount) that re-quote when urgency or tasks change.
- Job cards / provider feed show the tier and range.

---

## 3. Automated Stripe Identity (KYC)

Stripe Identity sessions already exist (`docs/backend-handoff-stripe-identity-config.md`).

- Webhook `identity.verification_session.verified` → mark the verification
  `approved` automatically (name/DOB match against the profile);
  `requires_input` → `rejected` with Stripe's reason; low-confidence or
  mismatch → stays `pending` for admin review.
- Retire the manual ID + selfie upload path once Identity is reliable (keep it
  as a fallback behind a flag).
- Gate: provider cannot apply until identity is `approved`.
- Mobile: one "Verify identity" button that opens the Identity sheet and shows
  live status.
- Still needed: a successful sandbox Identity completion (none on record yet).

---

## 4. Provider credentials (TESDA NC, licences, certificates)

- Migration `provider_credentials`: provider_id, category_id (skill it backs),
  type (`tesda_nc` | `prc_license` | `trade_certificate` | `other`), issuer,
  credential number, issued/expiry dates, document path (private bucket),
  status (`pending` | `approved` | `rejected` | `expired`), reviewer note.
- Endpoints: provider CRUD under `/credentials`; admin review under
  `/admin/credentials` (web page follows the Verifications page pattern).
- Scheduler marks expired credentials.
- Recommendation scoring and the provider card get a "Certified" badge per
  category; optional per-category `requires_credential` flag (e.g.
  electrical) blocks applying without an approved credential.
- TESDA has a public certificate lookup but no API — admin checks manually;
  store the lookup result in the review note.
- Mobile: Provider Profile → "Certifications" section with upload + status.

---

## 5. Sample work portfolio

Assumed meaning: providers can show photos of past work (Q3).
- `provider_portfolio_items` (provider_id, category_id, caption, photo paths,
  created_at), max ~12 items, public read.
- Mobile: provider profile gallery; client sees it on the provider detail and
  application screens.

---

## 6. Terms & conditions rewrite

- New sections: payment and escrow; urgency levels and their price effect;
  payment release (automatic after the 3-day warranty, early release by the
  client, provider release requests); disputes must be raised **before**
  release; after release the platform does not refund or reimburse —
  the contract for the service is between client and provider; platform acts
  only as a marketplace/payment facilitator; provider warrants their own
  qualifications; limitation of liability; third-party payment processors.
- **Legal caution:** under the Philippine Consumer Act (RA 7394) and the
  Internet Transactions Act (RA 11967) a platform cannot fully disclaim
  liability, and RA 11967 puts some obligations on e-marketplaces. Have the
  final text reviewed by counsel; the plan drafts it, it does not make it
  binding.
- Backend: `terms_versions` table + `profiles.accepted_terms_version`;
  `POST /auth/accept-terms`. Users on an old version are asked to re-accept
  at next sign-in.
- Mobile: rewrite `TermsAndConditions.tsx`, show a re-accept modal, link the
  terms from the hire confirmation and release confirmation screens.

---

## Open questions

- **Q1.** Payment provider: PayMongo (GCash/Maya/banks) or another PH gateway?
- **Q2.** What happens to wallet balances that exist at cut-over?
- **Q3.** "Create a sample port" — sample work portfolio for providers, or
  something else (a sample port/environment for testing, a demo build)?
- **Q4.** Which categories should require a credential before applying?
