-- TaskBuddy schema — escrow and disputes
-- Source of truth: backend/BACKEND_SCHEMA.md §18 (added alongside this migration).
--
-- `wallet_transactions` (migration 0006) is a one-party ledger: each row belongs
-- to a single profile and carries a direction. The admin console's Transactions
-- page needs the opposite — a two-party record (client + provider + service +
-- amount) with escrow and dispute states — and the mobile dispute screen had no
-- backend at all. This migration adds both. Backlog stories #17, #18, #20.
--
-- Money actually moves. Holding escrow DEBITS the client's wallet, releasing
-- CREDITS the provider, and cancelling or refunding CREDITS the client back.
-- There is still no payment gateway — the wallet ledger is the only account of
-- record — but a hold that didn't debit anyone was not really a hold.
--
-- Because a hold needs real funds, `POST /applications/:id/accept` now fails
-- with 400 when the client's balance can't cover the job budget. Clients top up
-- through `POST /wallet/transactions` (mobile's Add Money button).
--
-- Conventions mirror 0001–0008.

-- ===========================================================================
-- 1. Enums
-- ===========================================================================
create type escrow_status as enum (
    'held',       -- job assigned, funds notionally held
    'released',   -- job completed, provider paid out
    'disputed',   -- client raised a dispute; awaiting admin resolution
    'refunded',   -- admin resolved in the client's favour
    'cancelled'   -- job cancelled before completion
);

create type dispute_status as enum ('open', 'resolved', 'cancelled');

create type dispute_resolution as enum (
    'released_to_provider',
    'refunded_to_client'
);

-- Clients and providers are notified as a dispute moves. See the note in 0008
-- about ALTER TYPE ... ADD VALUE inside a transaction — nothing here uses it.
alter type notification_type add value if not exists 'dispute_update';

-- What a ledger row represents. Direction alone is no longer enough to tell
-- them apart: a payout and a refund are both credits carrying a job_id, and
-- counting a refund as revenue would inflate every figure on the admin
-- dashboard. Revenue is now defined as `kind = 'payout'`, nothing else.
create type wallet_txn_kind as enum (
    'topup',        -- client adds funds
    'withdrawal',   -- funds taken out
    'escrow_hold',  -- client debited when a job is assigned
    'payout',       -- provider credited when escrow is released  ← revenue
    'refund',       -- client credited when escrow is cancelled or refunded
    'adjustment'    -- anything else (manual corrections)
);

-- ===========================================================================
-- 2. Classify wallet ledger rows
-- ===========================================================================
alter table wallet_transactions
    add column kind wallet_txn_kind not null default 'adjustment';

-- Before this migration the only job-linked credits the API ever wrote were
-- provider payouts, and that is exactly what the analytics query counted. Tag
-- them so existing revenue figures survive the switch to `kind = 'payout'`.
update wallet_transactions
   set kind = 'payout'
 where direction = 'credit'
   and job_id is not null;

create index idx_wallet_txn_kind on wallet_transactions (kind, created_at);

comment on column wallet_transactions.kind is
    'Row purpose. Platform revenue = completed rows where kind = ''payout''.';

-- ===========================================================================
-- 3. Escrow — one record per job that had a budget when it was assigned.
-- ===========================================================================
create table escrow_transactions (
    id          uuid primary key default gen_random_uuid(),
    job_id      uuid not null unique references jobs (id) on delete cascade,
    client_id   uuid not null references profiles (id),
    provider_id uuid not null references profiles (id),
    amount      numeric(12,2) not null check (amount > 0),
    status      escrow_status not null default 'held',
    held_at     timestamptz not null default now(),
    released_at timestamptz,
    refunded_at timestamptz,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create index idx_escrow_status   on escrow_transactions (status, held_at desc);
create index idx_escrow_client   on escrow_transactions (client_id);
create index idx_escrow_provider on escrow_transactions (provider_id);

create trigger trg_escrow_updated_at
    before update on escrow_transactions
    for each row execute function set_updated_at();

-- ===========================================================================
-- 4. Disputes
-- ===========================================================================
create table disputes (
    id          uuid primary key default gen_random_uuid(),
    escrow_id   uuid not null references escrow_transactions (id) on delete cascade,
    job_id      uuid not null references jobs (id) on delete cascade,
    raised_by   uuid not null references profiles (id),
    reason      text not null check (char_length(reason) between 1 and 200),
    details     text check (char_length(details) <= 1000),
    status      dispute_status not null default 'open',
    resolution  dispute_resolution,
    resolution_note text check (char_length(resolution_note) <= 1000),
    resolved_by uuid references profiles (id),
    resolved_at timestamptz,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),

    -- A resolved dispute must say how it was resolved, and an open one must not.
    constraint chk_dispute_resolution_consistency check (
        (status = 'resolved' and resolution is not null and resolved_at is not null)
        or (status <> 'resolved' and resolution is null)
    )
);

-- Only one live dispute per escrow — what makes POST /jobs/:id/disputes safe to retry.
create unique index uq_disputes_one_open
    on disputes (escrow_id)
 where status = 'open';

create index idx_disputes_status on disputes (status, created_at desc);

create trigger trg_disputes_updated_at
    before update on disputes
    for each row execute function set_updated_at();

-- ===========================================================================
-- 5. Row Level Security (defense-in-depth; API uses the service-role key)
-- ===========================================================================
alter table escrow_transactions enable row level security;

create policy escrow_participant_read on escrow_transactions
    for select using (client_id = auth.uid() or provider_id = auth.uid());

alter table disputes enable row level security;

create policy disputes_participant_read on disputes
    for select using (
        exists (
            select 1 from escrow_transactions e
             where e.id = escrow_id
               and (e.client_id = auth.uid() or e.provider_id = auth.uid())
        )
    );
