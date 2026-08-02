-- TaskBuddy schema — classify wallet ledger rows
-- Source of truth: backend/BACKEND_SCHEMA.md §18.
--
-- Splitting this out of 0009: that file had already been applied when the
-- problem below surfaced, and an applied migration must not be edited in place.
--
-- The problem: `direction` alone cannot tell a payout from a refund. Both are
-- credits carrying a job_id, so the pre-existing revenue rule
--
--     direction = 'credit' AND job_id IS NOT NULL
--
-- counts refunds as income, inflating every revenue figure on the admin
-- dashboard by the value of each cancelled or disputed job. Escrow (0009) makes
-- refunds routine, so this stops being theoretical.
--
-- After this migration, platform revenue is `kind = 'payout'` and nothing else.
--
-- Written to be safely re-runnable: a partially-applied earlier attempt may
-- already have created the type or the column.

-- ===========================================================================
-- 1. What a ledger row represents
-- ===========================================================================
do $$
begin
    if not exists (select 1 from pg_type where typname = 'wallet_txn_kind') then
        create type wallet_txn_kind as enum (
            'topup',        -- client adds funds
            'withdrawal',   -- funds taken out
            'escrow_hold',  -- client debited when a job is assigned
            'payout',       -- provider credited when escrow is released  ← revenue
            'refund',       -- client credited when escrow is cancelled or refunded
            'adjustment'    -- anything else (manual corrections)
        );
    end if;
end $$;

-- ===========================================================================
-- 2. Tag every ledger row
-- ===========================================================================
alter table wallet_transactions
    add column if not exists kind wallet_txn_kind not null default 'adjustment';

-- Before escrow, the only job-linked credits the API ever wrote were provider
-- payouts — exactly what the old revenue query counted. Tagging them keeps
-- existing revenue figures identical across this migration.
--
-- Restricted to rows still on the default so re-running cannot reclassify
-- refunds (also credits with a job_id) that escrow has written since.
update wallet_transactions
   set kind = 'payout'
 where direction = 'credit'
   and job_id is not null
   and kind = 'adjustment';

create index if not exists idx_wallet_txn_kind
    on wallet_transactions (kind, created_at);

comment on column wallet_transactions.kind is
    'Row purpose. Platform revenue = completed rows where kind = ''payout''. '
    'Derived server-side and never accepted from a request body.';
