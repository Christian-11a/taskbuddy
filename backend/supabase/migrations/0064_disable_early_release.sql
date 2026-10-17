-- Early payment release is removed along with the warranty period: payment is
-- now released when the client confirms completion (escrow_settle, 0060).
-- This disables the early-release RPCs from 0046 and 0050 without dropping
-- anything: provider_release_requests and its rows are kept for the record.
-- Deploy this migration BEFORE the API that no longer calls these functions.

begin;

create or replace function public.escrow_release_early(p_job_id uuid, p_client_id uuid)
returns public.escrow_transactions
language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  raise exception using errcode = 'TB409', message = 'early release removed';
end; $$;

create or replace function public.request_early_payment_release(p_job_id uuid, p_provider_id uuid)
returns public.provider_release_requests
language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  raise exception using errcode = 'TB409', message = 'early release removed';
end; $$;

revoke all on function public.escrow_release_early(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.request_early_payment_release(uuid, uuid) from public, anon, authenticated, service_role;

commit;
