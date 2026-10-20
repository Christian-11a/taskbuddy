-- A proposal carries the labor amount the provider offered. The job's budget
-- remains the client's starting budget until a funded hire locks the quote.
begin;

alter table public.job_applications
  add column if not exists quote_amount numeric(12,2),
  add column if not exists posted_budget numeric(12,2);

update public.job_applications as a
   set quote_amount = j.budget,
       posted_budget = j.budget
  from public.jobs as j
 where j.id = a.job_id and j.budget > 0
   and a.quote_amount is null and a.posted_budget is null;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'job_applications_quote_amount_bounds'
      and conrelid = 'public.job_applications'::pg_catalog.regclass
  ) then
    alter table public.job_applications
      add constraint job_applications_quote_amount_bounds
      check (quote_amount is null or quote_amount > 0);
  end if;
end;
$$;

-- The job price and escrow hold change in one transaction. Locking the job
-- serializes competing paid checkouts; a losing payment never changes its price.
create or replace function public.escrow_place_proposal_hold(
  p_application_id pg_catalog.uuid,
  p_amount pg_catalog.numeric,
  p_funding_method pg_catalog.text,
  p_payment_intent_id pg_catalog.text default null,
  p_charge_id pg_catalog.text default null
)
returns pg_catalog.jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_application public.job_applications;
  v_job public.jobs;
begin
  select * into v_application
    from public.job_applications
   where id = p_application_id
   for update;
  if not found then
    raise exception using errcode = 'TB404', message = 'Proposal not found';
  end if;

  select * into v_job
    from public.jobs
   where id = v_application.job_id
   for update;
  if v_application.status <> 'pending'
     or v_job.status not in ('open', 'recommending')
     or v_job.assigned_provider_id is not null then
    raise exception using errcode = 'TB409', message = 'Proposal is no longer available';
  end if;
  if v_application.quote_amount is null
     or v_application.quote_amount <> p_amount then
    raise exception using errcode = 'TB409', message = 'Payment does not match the proposal quote';
  end if;

  update public.jobs set budget = v_application.quote_amount where id = v_job.id;
  return public.escrow_place_hold(
    v_job.id,
    v_application.provider_id,
    p_funding_method,
    p_payment_intent_id,
    p_charge_id
  );
end;
$$;

revoke all on function public.escrow_place_proposal_hold(uuid,numeric,text,text,text) from public, anon, authenticated;
grant execute on function public.escrow_place_proposal_hold(uuid,numeric,text,text,text) to service_role;

commit;
