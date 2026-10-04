-- Review before use. Target-environment execution requires user approval.
-- Read-only, consistent snapshot; no account names, IDs or credentials returned.
begin transaction isolation level repeatable read read only;

select version from supabase_migrations.schema_migrations order by version;

select n.nspname as schema_name, p.proname as function_name,
       pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
         as authenticated_can_execute
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'wallet_lock', 'wallet_available_balance', 'guard_wallet_debit_reservation',
    'raise_job_dispute', 'expire_job_cancellations', 'resolve_job_dispute',
    'review_service_request', 'notification_snapshot', 'limit_provider_portfolio'
  )
order by p.proname;

select c.relname as table_name, t.tgname as trigger_name, t.tgenabled
from pg_catalog.pg_trigger t
join pg_catalog.pg_class c on c.oid = t.tgrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and not t.tgisinternal
  and c.relname in ('wallet_transactions', 'jobs', 'applications', 'provider_portfolio')
order by c.relname, t.tgname;

with balances as (
  select profile_id, sum(case
    when status = 'completed' and direction = 'credit' then amount
    when status in ('pending', 'completed') and direction = 'debit' then -amount
    else 0 end) as available
  from public.wallet_transactions
  group by profile_id
)
select count(*) filter (where available < 0) as overreserved_wallet_count,
       coalesce(sum(-available) filter (where available < 0), 0) as overreserved_amount
from balances;

select count(*) as pending_withdrawal_count, coalesce(sum(amount), 0) as reserved_amount
from public.wallet_transactions where kind = 'withdrawal' and status = 'pending';

select count(*) as legacy_settlements_without_reference
from public.wallet_transactions
where kind = 'withdrawal' and status = 'completed'
  and (review_note is null or btrim(review_note) = '');

select id as bucket, public, file_size_limit, allowed_mime_types
from storage.buckets where id = 'provider-portfolio';

rollback;
