-- TaskBuddy schema — the ledger kind for money sent to a provider's Stripe account
-- Source of truth: backend/BACKEND_SCHEMA.md §29 (Stripe Connect payouts).
--
-- Apply after 0026. APPLY THIS FILE ON ITS OWN AND LET IT COMMIT BEFORE 0028.
-- 0028 names the new value in a partial index predicate, and Postgres will not
-- let an enum value be used in the transaction that added it — the same rule
-- that splits 0018 from 0019 and 0022 from 0023. `supabase db push` runs each
-- file in its own transaction and needs no special handling.
--
-- Why a new kind rather than reusing 'withdrawal'
-- -----------------------------------------------
-- When a card-funded job is released, the provider's payout lands in their
-- wallet as it always has, and is then sent on to their Stripe Connect
-- account. That second leg is a debit — but it must not be a 'withdrawal'.
-- Every withdrawal path keys on `kind = 'withdrawal'`: the admin settlement
-- queue, settle/reject, the user's cancel, their own request list. A transfer
-- Stripe is already carrying would show up in the admin queue for someone to
-- "settle" by hand (paying the provider twice), and the provider could cancel
-- it mid-flight. A kind of its own is unreachable from all of them.
--
-- Pending while the transfer is in flight — reserved against the available
-- balance like any other pending debit (WalletService.availableBalanceFor) —
-- then completed with the Stripe transfer id, or failed (money back in the
-- wallet) if Stripe refuses it.

alter type wallet_txn_kind add value if not exists 'connect_transfer';

comment on type wallet_txn_kind is
    'topup | withdrawal | escrow_hold | payout | refund | adjustment | '
    'recovery_credit | connect_transfer. connect_transfer = a card-funded '
    'payout sent on to the provider''s Stripe Connect account (0027).';
