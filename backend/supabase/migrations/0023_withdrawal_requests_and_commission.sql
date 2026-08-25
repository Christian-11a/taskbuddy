-- TaskBuddy schema — withdrawal requests and the platform commission
-- Source of truth: backend/BACKEND_SCHEMA.md §27.
--
-- Closes item 2 of docs/backend-handoff-mobile-todo-gaps.md (the interim
-- shape that document recommends: a withdrawal *request* settled by an admin,
-- not Stripe Connect) and the "fee/commission model" entry under "Not yet
-- built" in web/README.md.
--
-- Apply after 0022.

-- ===========================================================================
-- 1. Withdrawal requests
--
--    `POST /wallet/transactions` already derived kind = 'withdrawal' and
--    checked the balance, but wrote the row `status = 'completed'` — the
--    ledger asserting money left the platform when no rail exists for it to
--    leave through. The row now lands `pending` and an admin moves it on.
--
--    Three columns, all NULL until an admin acts:
--      - withdrawal_destination: where the money should go, in the user's own
--        words (a GCash number, a bank account). Free text on purpose — this
--        is settled by a human reading it, and encoding PH disbursement rails
--        into a schema before one is chosen would be guessing.
--      - reviewed_at / reviewed_by: who settled or refused it.
--      - review_note: the reference number on approval, the reason on refusal.
--        It is shown to the account holder, so it is not an internal comment.
-- ===========================================================================
alter table wallet_transactions
    add column if not exists withdrawal_destination text
        check (withdrawal_destination is null
               or char_length(withdrawal_destination) between 1 and 200),
    add column if not exists reviewed_at timestamptz,
    add column if not exists reviewed_by uuid references profiles (id),
    add column if not exists review_note text
        check (review_note is null or char_length(review_note) <= 500);

comment on column wallet_transactions.withdrawal_destination is
    'Where a withdrawal should be paid out, as typed by the account holder. '
    'Only ever set on kind = ''withdrawal'' rows.';
comment on column wallet_transactions.review_note is
    'Admin decision note on a withdrawal — payout reference when approved, '
    'reason when rejected. Surfaced to the account holder.';

-- The admin queue reads pending withdrawals oldest-first; the balance
-- calculation reads a profile's pending debits. Both are served here.
create index if not exists idx_wallet_txn_pending_withdrawals
    on wallet_transactions (status, kind, created_at)
    where status = 'pending';

-- ===========================================================================
-- 2. Platform commission
--
--    Defaults to zero, so applying this migration changes no figure anywhere:
--    providers keep receiving the whole budget until an admin deliberately
--    sets a rate. That is the point — a fee model is a business decision, and
--    a migration should not quietly start taking a cut.
--
--    Capped at 50% in the schema. Not a guess at the right number, just a
--    bound past which a typo (0.15 typed as 15) stops being recoverable after
--    the fact.
-- ===========================================================================
alter table platform_settings
    add column if not exists commission_rate numeric(5,4) not null default 0
        check (commission_rate >= 0 and commission_rate <= 0.5);

comment on column platform_settings.commission_rate is
    'Fraction of a job budget the platform keeps when escrow is released. '
    '0 = providers receive the full budget (the default, and the behaviour '
    'before this column existed). Read at release time only, so changing it '
    'never retroactively alters a settled job.';

-- The rate at the moment of release, frozen onto the escrow row. Reading the
-- live setting to explain an old payout would misreport every job settled
-- under a previous rate.
alter table escrow_transactions
    add column if not exists commission_amount numeric(12,2) not null default 0
        check (commission_amount >= 0);

comment on column escrow_transactions.commission_amount is
    'Peso amount withheld from this escrow when it was released. The provider '
    'was credited amount - commission_amount. Zero for every escrow settled '
    'before a commission rate was configured.';
