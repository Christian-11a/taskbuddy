-- Review before use. Target-environment execution requires user approval.
-- One result for CLI/Management API; no account names, IDs or credentials returned.
begin transaction isolation level repeatable read read only;

with migration_history as (
  select version from supabase_migrations.schema_migrations order by version
), function_metadata as (
  select n.nspname as schema_name, p.proname as function_name,
         pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
           as authenticated_can_execute
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'wallet_lock', 'wallet_available_balance', 'guard_wallet_debit_reservation',
      'admin_search_audit', 'admin_search_wallet', 'admin_dashboard_counts',
      'admin_booking_status_counts', 'handle_application_accepted',
      'raise_job_dispute', 'expire_job_cancellations', 'resolve_job_dispute',
      'review_service_request', 'notification_snapshot', 'limit_provider_portfolio'
    )
  order by p.proname
), trigger_metadata as (
  select c.relname as table_name, t.tgname as trigger_name, t.tgenabled
  from pg_catalog.pg_trigger t
  join pg_catalog.pg_class c on c.oid = t.tgrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not t.tgisinternal
    and c.relname in ('wallet_transactions', 'jobs', 'job_applications', 'provider_portfolio')
  order by c.relname, t.tgname
), balances as (
  select profile_id, sum(case
    when status = 'completed' and direction = 'credit' then amount
    when status in ('pending', 'completed') and direction = 'debit' then -amount
    else 0 end) as available
  from public.wallet_transactions
  group by profile_id
), wallet_risks as (
  select count(*) filter (where available < 0) as overreserved_wallet_count,
         coalesce(sum(-available) filter (where available < 0), 0) as overreserved_amount
  from balances
), pending_withdrawals as (
  select count(*) as pending_withdrawal_count, coalesce(sum(amount), 0) as reserved_amount
  from public.wallet_transactions where kind = 'withdrawal' and status = 'pending'
), missing_bookings as (
  select count(*) as active_jobs_without_booking
  from public.jobs j
  where j.status in ('confirmed', 'in_progress')
    and j.assigned_provider_id is not null
    and not exists (select 1 from public.bookings b where b.job_id = j.id)
), missing_references as (
  select count(*) as legacy_settlements_without_reference
  from public.wallet_transactions
  where kind = 'withdrawal' and status = 'completed'
    and (review_note is null or btrim(review_note) = '')
), portfolio_bucket as (
  select id as bucket, public, file_size_limit, allowed_mime_types
  from storage.buckets where id = 'provider-portfolio'
)
select jsonb_build_object(
  'migration_versions', (select coalesce(jsonb_agg(version), '[]'::jsonb) from migration_history),
  'functions', (select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) from function_metadata f),
  'triggers', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from trigger_metadata t),
  'wallet_risks', (select to_jsonb(w) from wallet_risks w),
  'pending_withdrawals', (select to_jsonb(w) from pending_withdrawals w),
  'missing_bookings', (select to_jsonb(b) from missing_bookings b),
  'legacy_missing_references', (select to_jsonb(r) from missing_references r),
  'portfolio_bucket', (select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) from portfolio_bucket b)
) as preflight;

rollback;
