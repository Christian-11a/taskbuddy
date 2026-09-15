-- TaskBuddy schema — Stripe Connect payouts, card-funded escrow, atomic money moves
-- Source of truth: backend/BACKEND_SCHEMA.md §29.
--
-- Apply after 0027 HAS COMMITTED (see that file's header). Re-runnable: every
-- table/column/index is `if not exists`, every function `create or replace`.
--
-- Closes Story 1 of docs/backend-handoff-stripe-connect-escrow.md, decided as
-- Option A: `wallet_transactions` stays the single account of record, a card
-- payment at hire is credited and held by the webhook, and a card-funded
-- job's payout is sent on to the provider's Stripe Connect Express account as
-- a transfer sourced from that job's own charge.
--
-- Four parts:
--   1. provider_payout_accounts — the provider's Connect account and what
--      Stripe last said about it. A table of its own, service-role writes only.
--   2. escrow_transactions gains how the hold was funded, and the state of the
--      onward transfer for card-funded jobs.
--   3. wallet_transactions gains the Stripe transfer id, and at most one live
--      connect_transfer per job.
--   4. Three SECURITY DEFINER functions that do a status change and its ledger
--      row in ONE transaction. Until now every money move was two PostgREST
--      calls — a status flip, then a ledger insert — and a failure between
--      them left an escrow 'held' that no debit backed, or 'released' with no
--      payout (BACKEND_SCHEMA.md §18 "Known limitation", which said to do this
--      "if real money is ever involved". Card payments are real money).

-- ===========================================================================
-- 1. Provider payout accounts
--
--    A separate table rather than columns on provider_profiles, because until
--    0026 a provider could update their own provider_profiles row directly —
--    and a payout account is exactly the kind of column nobody should be able
--    to point at their own Stripe account but us. RLS allows the owner to read
--    their own row and nothing else; there are no write policies at all.
--
--    `transfers_active` (capabilities.transfers = 'active') is what makes
--    stripe.transfers.create succeed; `payouts_enabled` is what gets the money
--    from their Stripe balance to their bank. A provider is payable only when
--    both are true.
-- ===========================================================================
create table if not exists provider_payout_accounts (
    profile_id        uuid primary key
                      references provider_profiles (profile_id) on delete cascade,
    stripe_account_id text not null unique,
    country           text not null check (char_length(country) = 2),
    details_submitted boolean not null default false,
    payouts_enabled   boolean not null default false,
    transfers_active  boolean not null default false,
    -- currently_due ∪ past_due, as Stripe names them — what the provider still
    -- has to hand over before Stripe will move money for them.
    requirements_due  text[] not null default '{}',
    disabled_reason   text,
    stripe_synced_at  timestamptz,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);

drop trigger if exists trg_provider_payout_accounts_updated_at on provider_payout_accounts;
create trigger trg_provider_payout_accounts_updated_at
    before update on provider_payout_accounts
    for each row execute function set_updated_at();

alter table provider_payout_accounts enable row level security;

drop policy if exists provider_payout_accounts_read_own on provider_payout_accounts;
create policy provider_payout_accounts_read_own on provider_payout_accounts
    for select to authenticated using (profile_id = auth.uid());

comment on table provider_payout_accounts is
    'A provider''s Stripe Connect Express account and the state Stripe last '
    'reported for it (account.updated / capability.updated, or a sync on '
    'return from onboarding). Written by the API''s service role only (0028).';

-- ===========================================================================
-- 2. Escrow: how it was funded, and where a card-funded payout went
-- ===========================================================================
alter table escrow_transactions
    add column if not exists funding_method text not null default 'wallet',
    add column if not exists funding_payment_intent_id text,
    add column if not exists funding_charge_id text,
    add column if not exists transfer_status text not null default 'none',
    add column if not exists stripe_transfer_id text,
    add column if not exists transfer_amount_minor bigint,
    add column if not exists transfer_currency text,
    add column if not exists transfer_attempts integer not null default 0,
    add column if not exists transfer_last_error text,
    add column if not exists transfer_attempted_at timestamptz,
    add column if not exists transferred_at timestamptz;

-- Text + CHECK rather than enums, so a value can be added later in one
-- migration without the separate-transaction dance enums need.
do $constraints$
begin
    if not exists (select 1 from pg_constraint where conname = 'chk_escrow_funding_method') then
        alter table escrow_transactions add constraint chk_escrow_funding_method
            check (funding_method in ('wallet', 'card'));
    end if;
    -- A card-funded hold names the payment that funded it; that id is what the
    -- webhook uses to recognise its own hold on a retry, and the charge is
    -- what the payout transfer is sourced from.
    if not exists (select 1 from pg_constraint where conname = 'chk_escrow_card_funding') then
        alter table escrow_transactions add constraint chk_escrow_card_funding
            check (funding_method = 'wallet'
                   or (funding_payment_intent_id is not null and funding_charge_id is not null));
    end if;
    if not exists (select 1 from pg_constraint where conname = 'chk_escrow_transfer_status') then
        alter table escrow_transactions add constraint chk_escrow_transfer_status
            check (transfer_status in
                   ('none', 'pending', 'transferred', 'failed', 'not_eligible', 'abandoned'));
    end if;
    -- Only card money has a charge to source a transfer from (the FX reason in
    -- §29): a wallet-funded escrow's payout stays in the wallet.
    if not exists (select 1 from pg_constraint where conname = 'chk_escrow_transfer_card_only') then
        alter table escrow_transactions add constraint chk_escrow_transfer_card_only
            check (transfer_status = 'none' or funding_method = 'card');
    end if;
    if not exists (select 1 from pg_constraint where conname = 'chk_escrow_transferred_has_id') then
        alter table escrow_transactions add constraint chk_escrow_transferred_has_id
            check (transfer_status <> 'transferred' or stripe_transfer_id is not null);
    end if;
    if not exists (select 1 from pg_constraint where conname = 'chk_escrow_transfer_amount') then
        alter table escrow_transactions add constraint chk_escrow_transfer_amount
            check (transfer_amount_minor is null or transfer_amount_minor > 0);
    end if;
    if not exists (select 1 from pg_constraint where conname = 'chk_escrow_transfer_error_len') then
        alter table escrow_transactions add constraint chk_escrow_transfer_error_len
            check (transfer_last_error is null or char_length(transfer_last_error) <= 500);
    end if;
end
$constraints$;

create unique index if not exists uq_escrow_funding_pi
    on escrow_transactions (funding_payment_intent_id)
    where funding_payment_intent_id is not null;
create unique index if not exists uq_escrow_funding_charge
    on escrow_transactions (funding_charge_id)
    where funding_charge_id is not null;
create unique index if not exists uq_escrow_stripe_transfer
    on escrow_transactions (stripe_transfer_id)
    where stripe_transfer_id is not null;
-- The payments sweep's queue: transfers that still need an attempt.
create index if not exists idx_escrow_transfer_queue
    on escrow_transactions (transfer_status, transfer_attempted_at)
    where transfer_status in ('pending', 'failed');

comment on column escrow_transactions.funding_method is
    '''wallet'' = held from an existing balance; ''card'' = paid by card at hire, '
    'credited and held by the payment_intent.succeeded webhook (0028).';
comment on column escrow_transactions.transfer_status is
    'Card-funded payouts only: none → pending (set atomically with the release) '
    '→ transferred | failed (retried) | not_eligible (provider not payable; money '
    'stays in their wallet) | abandoned (gave up; money stays in their wallet).';

-- ===========================================================================
-- 3. Ledger: the Stripe transfer behind a connect_transfer row
-- ===========================================================================
alter table wallet_transactions
    add column if not exists stripe_transfer_id text;

create unique index if not exists uq_wallet_txn_stripe_transfer
    on wallet_transactions (stripe_transfer_id)
    where stripe_transfer_id is not null;

-- At most one live transfer per job. escrow_transactions.job_id is unique, so
-- this is also at most one per escrow: a retry either finds the live row or,
-- after a failure marked the old one 'failed', inserts the next.
create unique index if not exists uq_wallet_txn_live_connect_transfer
    on wallet_transactions (job_id)
    where kind = 'connect_transfer' and status in ('pending', 'completed');

comment on column wallet_transactions.stripe_transfer_id is
    'The Stripe transfer (tr_…) a connect_transfer row moved the money through.';

-- ===========================================================================
-- 4. Atomic money moves
--
--    Service-role only, exactly like the 0020 list functions. Errors carry
--    custom SQLSTATEs that the API maps to typed exceptions
--    (backend/src/escrow/escrow-errors.ts):
--      TB402  insufficient funds       detail: {"needed": n, "available": n}
--      TB404  nothing to act on
--      TB409  conflicts with the row's current state
--
--    Every function that commits wallet money first takes a transaction-level
--    advisory lock on that profile's wallet, so two commitments for the same
--    person — two hires in the same instant, a hire racing a payout transfer —
--    are serialised and cannot both pass the balance check. That is the
--    overdraw race §18 documented, closed.
-- ===========================================================================

-- What a profile may commit right now: settled balance (completed credits
-- minus completed debits) minus every pending debit. Mirrors
-- WalletService.availableBalanceFor, which is what the app displays.
create or replace function public.wallet_available_balance(p_profile_id pg_catalog.uuid)
returns pg_catalog.numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(pg_catalog.sum(
           case
             when t.status = 'completed' and t.direction = 'credit' then t.amount
             when t.status = 'completed' and t.direction = 'debit' then -t.amount
             when t.status = 'pending' and t.direction = 'debit' then -t.amount
             else 0
           end), 0)
    from public.wallet_transactions as t
   where t.profile_id = p_profile_id;
$$;

create or replace function public.wallet_lock(p_profile_id pg_catalog.uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select pg_catalog.pg_advisory_xact_lock(
           pg_catalog.hashtextextended('wallet:' || p_profile_id::pg_catalog.text, 0));
$$;

-- ---------------------------------------------------------------------------
-- escrow_place_hold — EscrowService.hold()
--
-- Returns {"escrow": row | null, "placed": bool}. `placed` is true only for the
-- call that actually debited the client (ApplicationsService.accept relies on
-- that to know whether a rollback is its to make). Cases, exactly as
-- EscrowService.reuseHold documented them:
--   no budget                         → {escrow: null, placed: false}
--   held, same provider               → {escrow: row,  placed: false}  (a retry)
--   any hold for another provider     → TB409
--   released / refunded / disputed    → TB409
--   cancelled, same provider          → revived, funding overwritten, debited
--   none                              → inserted, debited
-- ---------------------------------------------------------------------------
create or replace function public.escrow_place_hold(
  p_job_id            pg_catalog.uuid,
  p_provider_id       pg_catalog.uuid,
  p_funding_method    pg_catalog.text default 'wallet',
  p_payment_intent_id pg_catalog.text default null,
  p_charge_id         pg_catalog.text default null
)
returns pg_catalog.jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job       record;
  v_existing  public.escrow_transactions;
  v_had_row   boolean;
  v_row       public.escrow_transactions;
  v_amount    pg_catalog.numeric;
  v_available pg_catalog.numeric;
begin
  if p_funding_method not in ('wallet', 'card') then
    raise exception using errcode = 'TB409', message = 'Unknown funding method';
  end if;

  select j.id, j.title, j.budget, j.client_id into v_job
    from public.jobs as j where j.id = p_job_id;
  if not found then
    raise exception using errcode = 'TB404', message = 'Job not found';
  end if;
  if v_job.budget is null then
    return pg_catalog.jsonb_build_object('escrow', null, 'placed', false);
  end if;

  perform public.wallet_lock(v_job.client_id);

  select * into v_existing
    from public.escrow_transactions as e
   where e.job_id = p_job_id
     for update;
  v_had_row := found;

  if v_had_row then
    if v_existing.provider_id <> p_provider_id then
      raise exception using errcode = 'TB409',
        message = 'This job already has an escrow hold for another provider.';
    end if;
    if v_existing.status = 'held' then
      return pg_catalog.jsonb_build_object('escrow', pg_catalog.to_jsonb(v_existing), 'placed', false);
    end if;
    if v_existing.status <> 'cancelled' then
      raise exception using errcode = 'TB409',
        message = pg_catalog.format('This job''s escrow is already ''%s'' and cannot be re-held.', v_existing.status);
    end if;
    v_amount := v_existing.amount;
  else
    v_amount := v_job.budget;
  end if;

  v_available := public.wallet_available_balance(v_job.client_id);
  if v_available < v_amount then
    raise exception using errcode = 'TB402',
      message = 'Insufficient wallet balance',
      detail = pg_catalog.jsonb_build_object('needed', v_amount, 'available', v_available)::pg_catalog.text;
  end if;

  if v_had_row then
    update public.escrow_transactions
       set status = 'held',
           held_at = pg_catalog.now(),
           released_at = null,
           refunded_at = null,
           funding_method = p_funding_method,
           funding_payment_intent_id = p_payment_intent_id,
           funding_charge_id = p_charge_id
     where id = v_existing.id
    returning * into v_row;
  else
    insert into public.escrow_transactions
      (job_id, client_id, provider_id, amount,
       funding_method, funding_payment_intent_id, funding_charge_id)
    values
      (p_job_id, v_job.client_id, p_provider_id, v_amount,
       p_funding_method, p_payment_intent_id, p_charge_id)
    returning * into v_row;
  end if;

  insert into public.wallet_transactions
    (profile_id, direction, kind, status, amount, title, job_id)
  values
    (v_job.client_id, 'debit', 'escrow_hold', 'completed', v_amount,
     pg_catalog.left('Escrow hold — ' || coalesce(v_job.title, 'job'), 120), p_job_id);

  return pg_catalog.jsonb_build_object('escrow', pg_catalog.to_jsonb(v_row), 'placed', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- escrow_settle — every terminal escrow move that pays somebody
--
-- Applies p_expected → p_next only if the row is still in p_expected (the
-- conditional update EscrowService.settle/settleIfUnchanged made), and writes
-- the one ledger row that move earns, in the same transaction:
--   released            → provider credit 'payout' of amount − commission;
--                         a card-funded escrow also becomes transfer 'pending'
--                         here, so the intent to send it on cannot be lost
--   refunded, cancelled → client credit 'refund' of the full amount
--   disputed            → no money moves
-- Returns the updated row as jsonb, or null when the row was no longer in
-- p_expected (lost the race) — the caller decides whether that is an error.
-- ---------------------------------------------------------------------------
create or replace function public.escrow_settle(
  p_escrow_id  pg_catalog.uuid,
  p_expected   public.escrow_status,
  p_next       public.escrow_status,
  p_commission pg_catalog.numeric default 0,
  p_title      pg_catalog.text default null
)
returns pg_catalog.jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row        public.escrow_transactions;
  v_commission pg_catalog.numeric := coalesce(p_commission, 0);
begin
  if p_next = 'held' then
    raise exception using errcode = 'TB409', message = 'Use escrow_place_hold to hold funds';
  end if;

  update public.escrow_transactions as e
     set status = p_next,
         released_at = case when p_next = 'released' then pg_catalog.now() else e.released_at end,
         refunded_at = case when p_next = 'refunded' then pg_catalog.now() else e.refunded_at end,
         commission_amount = case when p_next = 'released' then v_commission else e.commission_amount end,
         transfer_status = case
                             when p_next = 'released' and e.funding_method = 'card' then 'pending'
                             else e.transfer_status
                           end
   where e.id = p_escrow_id
     and e.status = p_expected
  returning * into v_row;

  if not found then
    return null;
  end if;

  if p_next = 'released' then
    if v_commission < 0 or v_commission > v_row.amount then
      raise exception using errcode = 'TB409', message = 'Commission out of range';
    end if;
    if v_row.amount - v_commission > 0 then
      insert into public.wallet_transactions
        (profile_id, direction, kind, status, amount, title, job_id)
      values
        (v_row.provider_id, 'credit', 'payout', 'completed', v_row.amount - v_commission,
         pg_catalog.left(coalesce(p_title, 'Payout'), 120), v_row.job_id);
    end if;
  elsif p_next in ('refunded', 'cancelled') then
    insert into public.wallet_transactions
      (profile_id, direction, kind, status, amount, title, job_id)
    values
      (v_row.client_id, 'credit', 'refund', 'completed', v_row.amount,
       pg_catalog.left(coalesce(p_title, 'Refund'), 120), v_row.job_id);
  end if;

  return pg_catalog.to_jsonb(v_row);
end;
$$;

-- ---------------------------------------------------------------------------
-- wallet_reserve_connect_transfer — the provider-side debit behind a transfer
--
-- Called before stripe.transfers.create. Inserts a PENDING connect_transfer
-- debit for the payout being sent on, which reserves it: the provider cannot
-- withdraw by hand the same money Stripe is about to send. Returns the live
-- row if one already exists (a retry), so it is safe to call repeatedly.
--   escrow not released / not card    → TB409
--   no payout credit for this job      → TB404
--   provider's available balance short → TB402 (they already withdrew it)
-- ---------------------------------------------------------------------------
create or replace function public.wallet_reserve_connect_transfer(
  p_escrow_id pg_catalog.uuid,
  p_amount    pg_catalog.numeric,
  p_title     pg_catalog.text default null
)
returns pg_catalog.jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_escrow    public.escrow_transactions;
  v_live      public.wallet_transactions;
  v_row       public.wallet_transactions;
  v_available pg_catalog.numeric;
begin
  select * into v_escrow from public.escrow_transactions where id = p_escrow_id;
  if not found then
    raise exception using errcode = 'TB404', message = 'Escrow not found';
  end if;
  if v_escrow.status <> 'released' or v_escrow.funding_method <> 'card' then
    raise exception using errcode = 'TB409',
      message = 'Only a released, card-funded escrow can be sent to Stripe';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception using errcode = 'TB409', message = 'Transfer amount must be positive';
  end if;

  perform public.wallet_lock(v_escrow.provider_id);

  select * into v_live
    from public.wallet_transactions as t
   where t.job_id = v_escrow.job_id
     and t.kind = 'connect_transfer'
     and t.status in ('pending', 'completed');
  if found then
    return pg_catalog.to_jsonb(v_live);
  end if;

  if not exists (
    select 1 from public.wallet_transactions as t
     where t.job_id = v_escrow.job_id
       and t.profile_id = v_escrow.provider_id
       and t.kind = 'payout'
       and t.status = 'completed'
  ) then
    raise exception using errcode = 'TB404', message = 'No payout credit to send on for this job';
  end if;

  v_available := public.wallet_available_balance(v_escrow.provider_id);
  if v_available < p_amount then
    raise exception using errcode = 'TB402',
      message = 'Insufficient wallet balance',
      detail = pg_catalog.jsonb_build_object('needed', p_amount, 'available', v_available)::pg_catalog.text;
  end if;

  insert into public.wallet_transactions
    (profile_id, direction, kind, status, amount, title, job_id)
  values
    (v_escrow.provider_id, 'debit', 'connect_transfer', 'pending', p_amount,
     pg_catalog.left(coalesce(p_title, 'Sent to your Stripe account'), 120),
     v_escrow.job_id)
  returning * into v_row;

  return pg_catalog.to_jsonb(v_row);
end;
$$;

revoke all on function public.wallet_available_balance(pg_catalog.uuid) from public, anon, authenticated;
revoke all on function public.wallet_lock(pg_catalog.uuid) from public, anon, authenticated;
revoke all on function public.escrow_place_hold(pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.text, pg_catalog.text) from public, anon, authenticated;
revoke all on function public.escrow_settle(pg_catalog.uuid, public.escrow_status, public.escrow_status, pg_catalog.numeric, pg_catalog.text) from public, anon, authenticated;
revoke all on function public.wallet_reserve_connect_transfer(pg_catalog.uuid, pg_catalog.numeric, pg_catalog.text) from public, anon, authenticated;
grant execute on function public.wallet_available_balance(pg_catalog.uuid) to service_role;
grant execute on function public.wallet_lock(pg_catalog.uuid) to service_role;
grant execute on function public.escrow_place_hold(pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.text, pg_catalog.text) to service_role;
grant execute on function public.escrow_settle(pg_catalog.uuid, public.escrow_status, public.escrow_status, pg_catalog.numeric, pg_catalog.text) to service_role;
grant execute on function public.wallet_reserve_connect_transfer(pg_catalog.uuid, pg_catalog.numeric, pg_catalog.text) to service_role;

-- ===========================================================================
-- 5. A stale comment, corrected
--
--    0013 described stripe_events as "insert-first". The code has always
--    recorded an event AFTER its work (PaymentsService.handleEvent): a crash in
--    between makes Stripe redeliver and the work is redone idempotently, where
--    insert-first would make "marked handled, never done" permanent and silent.
-- ===========================================================================
comment on table stripe_events is
    'Every Stripe webhook event this API has finished processing, platform and '
    'Connect alike. Recorded AFTER the work: a crash in between means Stripe '
    'redelivers and the work is redone idempotently (0028 corrects 0013).';

-- ===========================================================================
-- Verification
-- ===========================================================================
-- select routine_name from information_schema.routines
--  where routine_schema = 'public'
--    and routine_name in ('wallet_available_balance', 'wallet_lock',
--      'escrow_place_hold', 'escrow_settle', 'wallet_reserve_connect_transfer');
--   -- expect all five
--
-- select column_name from information_schema.columns
--  where table_name = 'escrow_transactions'
--    and column_name in ('funding_method', 'funding_charge_id', 'transfer_status');
--   -- expect three rows
--
-- select has_function_privilege('authenticated',
--   'public.escrow_place_hold(uuid, uuid, text, text, text)', 'execute');
--   -- expect false
