-- A client may waive the remainder of the 72-hour hold after completion.
-- The job lock serializes this with disputes and scheduled settlement.
begin;
create or replace function public.escrow_release_early(p_job_id uuid, p_client_id uuid)
returns public.escrow_transactions
language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_job public.jobs;
  v_escrow public.escrow_transactions;
  v_rate numeric;
  v_commission numeric;
begin
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found or v_job.client_id <> p_client_id then
    raise exception using errcode = 'TB403', message = 'Not your job';
  end if;
  if v_job.status <> 'completed' then
    raise exception using errcode = 'TB409', message = 'The job is not complete yet';
  end if;
  if exists (select 1 from public.disputes where job_id = p_job_id and status = 'open') then
    raise exception using errcode = 'TB409', message = 'A complaint is open';
  end if;
  select * into v_escrow from public.escrow_transactions where job_id = p_job_id for update;
  if not found then
    raise exception using errcode = 'TB409', message = 'No payment is held for this job';
  end if;
  if v_escrow.status <> 'held' then
    raise exception using errcode = 'TB409', message = 'Payment already released or disputed';
  end if;
  select coalesce(commission_rate, 0) into v_rate from public.platform_settings where id = true;
  v_commission := round(v_escrow.amount * coalesce(v_rate, 0), 2);
  update public.escrow_transactions set status = 'released', released_at = now(),
    commission_amount = v_commission,
    transfer_status = case when funding_method = 'card' then 'pending' else transfer_status end
    where id = v_escrow.id returning * into v_escrow;
  if v_escrow.amount - v_commission > 0 then
    insert into public.wallet_transactions(profile_id, direction, kind, status, amount, title, job_id)
    values(v_escrow.provider_id, 'credit', 'payout', 'completed', v_escrow.amount - v_commission,
      left('Payout — ' || v_job.title, 120), p_job_id);
  end if;
  insert into public.notifications(recipient_id,type,title,body,data)
    values(v_escrow.provider_id,'wallet_update','Payment released',
      'The client released payment for ' || v_job.title,
      jsonb_build_object('job_id',p_job_id));
  return v_escrow;
end; $$;
revoke all on function public.escrow_release_early(uuid, uuid) from public, anon, authenticated;
grant execute on function public.escrow_release_early(uuid, uuid) to service_role;
commit;
