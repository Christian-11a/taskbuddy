# Spike: can the wallet withdrawal payout rail reuse ConnectPayoutsService?

**Question:** docs/backend-handoff-mobile-todo-gaps.md §2 left the wallet withdrawal
payout rail unbuilt (withdrawals land in an admin queue for manual settlement). Now
that Stripe Connect exists (migration 0028, ConnectPayoutsService), can that same
mechanism send an automated payout for a *wallet-balance* withdrawal, not just a
card-funded escrow release?

**Short answer:** No.

**Why:**

*Step 1 — `ConnectPayoutsService.attempt()` (`backend/src/payments/connect/connect-payouts.service.ts:202-383`).*
Every eligibility check and every Stripe call in this method is scoped to one
specific charge. The entry guard at lines 204-212 refuses to run at all unless
`escrow.funding_method === 'card'` and `escrow.funding_charge_id` is present. The
method then retrieves that exact charge (`charges.retrieve(escrow.funding_charge_id, …)`,
line 234), reads its `balance_transaction` to know the settled amount and currency
(lines 238-247), and the one `stripe.transfers.create` call in the file (lines
299-322) passes `source_transaction: charge.id` — never omitted, never conditional.
There is no code path in this file that creates a transfer without
`source_transaction`, and no path that draws from the platform's general Stripe
balance. Confirmed: this is the only shape of transfer `ConnectPayoutsService`
knows how to make.

*Step 2 — does a wallet withdrawal have an equivalent charge to source from?*
`WalletService.balanceFor` (`backend/src/wallet/wallet.service.ts:416-433`) sums
`wallet_transactions` rows by `direction`/`status` only — no charge reference of any
kind enters the computation. Checking where wallet_transactions rows actually
originate confirms why: `escrow_settle` in migration 0028
(`backend/supabase/migrations/0028_stripe_connect_and_card_funding.sql:333-488`)
inserts the provider's job-earning credit as a pure ledger row; the only
Stripe-related column added to `wallet_transactions` in that migration is
`stripe_transfer_id` (line 157-171), which is *written after* a transfer completes,
not a charge id available beforehand to source one. `funding_charge_id` lives only
on `escrow_transactions` (line 80), tied one-to-one to a card-funded job's own
escrow row, and is never copied onto a wallet credit. So:
- Job earnings paid into the wallet (wallet-funded jobs, i.e. hires paid from the
  client's pre-funded balance rather than by card) have no Stripe charge behind
  them at all — there is nothing to source a transfer from.
- Top-ups do have a real charge, but it belongs to whichever client topped up,
  settled at whatever time they did it — unrelated in identity, amount, and timing
  to the provider now withdrawing. A withdrawal is satisfied out of the fungible
  ledger sum, not out of any one client's original charge, so there is no
  1:1 charge to point `source_transaction` at even when top-up charges exist in
  the history.
This spike could not verify Stripe's live payout-schedule setting for this
account (Balance → Payouts requires dashboard access not available in this
environment) — that number would matter for Step 3's balance-headroom question,
not for this one: regardless of schedule, a wallet withdrawal has no *specific*
settled charge of its own, so `source_transaction` has nothing to name even in the
best case.

*Step 3 — is a plain `stripe.transfers.create` (no `source_transaction`) a viable
alternative?*
Yes, as a distinct and currently-unbuilt code path — Stripe's API does support
`transfers.create({ amount, currency, destination })` sourced from the platform's
general available balance rather than one charge, and nothing here rules it out on
Stripe's side. But it does not reuse `ConnectPayoutsService`: every method in that
class assumes a `TransferEscrow` row (`funding_charge_id`, `escrow_id`,
`transfer_status` columns that don't exist for a `wallet_transactions` withdrawal
row) and every retry/reservation/idempotency mechanism (`markEscrow`,
`wallet_reserve_connect_transfer`, the `escrow-transfer:{id}:{attempts}`
idempotency key) is keyed off an escrow. A wallet-balance rail would need its own
service with its own reservation RPC, retry bookkeeping, and idempotency key
scheme against `wallet_transactions` instead — new code of comparable shape and
size to `ConnectPayoutsService`, not a call into it. It would also carry a risk
`ConnectPayoutsService` was deliberately built to avoid: a plain transfer draws
from whatever is currently in the platform's *available* (settled, not pending)
Stripe balance, which depends on Stripe's payout schedule for this account and on
how much of that balance other in-flight transfers/refunds/disputes are already
claiming at the same moment — there is no guarantee the balance covers a given
withdrawal amount at request time, so the new service would need its own
insufficient-balance failure handling (retry/queue/admin-fallback) that
`ConnectPayoutsService` gets for free from `source_transaction` capping the
transfer at what one charge actually settled for.

**If a "yes, with X" or "partially" answer:** N/A — the direct question
("can `ConnectPayoutsService` do this") is no. The closest to a qualified yes is:
a *new*, differently-scoped service reusing only the Connect *infrastructure*
already built (provider onboarding, connected-account records, `isPayable`
eligibility) — not `ConnectPayoutsService`'s transfer logic — could plausibly
implement wallet-balance payouts via plain transfers, sized to the platform's
actually-available Stripe balance at send time.

**Recommendation:** Keep the manual admin-settlement queue as-is — a plain-transfer
rail is a real, buildable option but is new work of comparable size to
`ConnectPayoutsService` itself (new reservation RPC, new retry/idempotency
bookkeeping, new insufficient-balance handling), not a reuse of what already
exists, so it belongs in its own future plan rather than as an extension of this
one.

**Not done as part of this spike:** any code change. This file is the entire
deliverable of Phase D.
