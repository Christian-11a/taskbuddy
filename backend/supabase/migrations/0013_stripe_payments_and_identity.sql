-- TaskBuddy schema — Stripe payments and Stripe Identity
-- Source of truth: backend/BACKEND_SCHEMA.md §21.
--
-- §18 states the wallet ledger is the only account of record and that there is
-- no payment gateway. The first half of that stays true — balances are still
-- derived from `wallet_transactions` and nothing else — but topping up stops
-- being an unbacked insert the client asks for. After this migration a topup
-- row exists only because Stripe told us, on its own webhook, that money moved.
--
-- Provider verification gains a second route alongside the manual ID + selfie
-- queue from 0008: Stripe Identity, which decides without an admin looking.
--
-- Conventions mirror 0001–0012.

-- ===========================================================================
-- 0. Notification type for wallet funding
--
--    Postgres allows ALTER TYPE ... ADD VALUE inside a transaction, but the new
--    value cannot be *used* until this migration commits — nothing here inserts
--    a notification, so applying this file in one go is safe (same note as 0008).
-- ===========================================================================
alter type notification_type add value if not exists 'payment_update';

-- ===========================================================================
-- 1. Stripe customers
--
--    PaymentSheet needs a customer id to attach saved payment methods to, and
--    the same customer must come back on the next topup or the user re-enters
--    their card every time. Created lazily by the API on first payment.
-- ===========================================================================
alter table profiles
    add column if not exists stripe_customer_id text;

create unique index if not exists uq_profiles_stripe_customer
    on profiles (stripe_customer_id)
 where stripe_customer_id is not null;

-- ===========================================================================
-- 2. Ledger provenance
--
--    The link back to the PaymentIntent that produced a topup. UNIQUE is the
--    load-bearing part: Stripe retries a webhook until it gets a 2xx, and
--    without this a retried `payment_intent.succeeded` credits the wallet
--    twice. The insert is allowed to fail on this constraint — that failure IS
--    the idempotency check (see §3 for the belt-and-braces event log).
-- ===========================================================================
alter table wallet_transactions
    add column if not exists stripe_payment_intent_id text;

create unique index if not exists uq_wallet_txn_stripe_pi
    on wallet_transactions (stripe_payment_intent_id)
 where stripe_payment_intent_id is not null;

comment on column wallet_transactions.stripe_payment_intent_id is
    'PaymentIntent that funded this row, for topups made through Stripe. NULL '
    'for escrow movements and for rows written before payments existed. The '
    'partial unique index is what makes webhook redelivery non-duplicating.';

-- ===========================================================================
-- 3. Webhook event log
--
--    Stripe guarantees at-least-once delivery, and events other than a topup
--    (an Identity result, say) have no natural unique column to collide on.
--    Recording every processed event id gives all handlers one idempotency
--    mechanism instead of each inventing its own.
--
--    `id` is Stripe's `evt_...` string, so a redelivery is a primary-key
--    conflict on insert.
-- ===========================================================================
create table if not exists stripe_events (
    id           text primary key,
    type         text not null,
    processed_at timestamptz not null default now()
);

create index if not exists idx_stripe_events_processed
    on stripe_events (processed_at desc);

comment on table stripe_events is
    'Every Stripe webhook event this API has finished processing. Insert-first: '
    'a duplicate key means the event was already handled and is skipped.';

-- ===========================================================================
-- 4. Stripe Identity as a second verification route
--
--    0008 assumed a human reviews an uploaded ID and a selfie, so both paths
--    are NOT NULL. A Stripe Identity session collects and destroys those
--    documents inside Stripe — we never receive a file — so those columns have
--    to be droppable, with a CHECK keeping the manual route as strict as it
--    was before.
-- ===========================================================================
do $$
begin
    if not exists (select 1 from pg_type where typname = 'verification_method') then
        create type verification_method as enum ('manual', 'stripe_identity');
    end if;
end $$;

alter table provider_verifications
    add column if not exists method verification_method not null default 'manual';

alter table provider_verifications
    add column if not exists stripe_session_id text;

create unique index if not exists uq_provider_verifications_stripe_session
    on provider_verifications (stripe_session_id)
 where stripe_session_id is not null;

alter table provider_verifications
    alter column id_document_path drop not null,
    alter column selfie_path      drop not null;

-- The manual queue still cannot hold a row with nothing to review.
alter table provider_verifications
    drop constraint if exists chk_provider_verifications_manual_docs;
alter table provider_verifications
    add constraint chk_provider_verifications_manual_docs check (
        method <> 'manual'
        or (id_document_path is not null and selfie_path is not null)
    );

comment on column provider_verifications.method is
    'How this submission is adjudicated. ''manual'' rows carry Storage paths '
    'and appear in the admin queue; ''stripe_identity'' rows carry no documents '
    'and are resolved by webhook, never by an admin.';
