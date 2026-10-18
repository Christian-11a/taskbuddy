-- Complaints are only accepted before completion. Payment is released when the
-- client confirms the job is done (0060), so a completed job can no longer be
-- disputed. This replaces the three-day post-completion window from 0040/0041.
-- Only the completed-job rule changes; participants, allowed statuses,
-- cancellation handling and escrow freezing are as in 0041.

begin;

create or replace function public.raise_job_dispute(p_job_id uuid, p_actor_id uuid, p_reason text, p_details text)
returns public.disputes language plpgsql security definer set search_path = public as $$
declare job jobs; payment escrow_transactions; complaint disputes;
begin
  select * into job from jobs where id = p_job_id for update;
  if not found then raise exception 'Job not found'; end if;
  if p_actor_id is null or (p_actor_id <> job.client_id and p_actor_id is distinct from job.assigned_provider_id) then
    raise exception 'Not your job';
  end if;
  if job.status = 'completed' then
    raise exception 'Complaints must be raised before the job is confirmed done';
  elsif job.status not in ('assigned', 'confirmed', 'in_progress', 'cancelled') or job.assigned_provider_id is null then
    raise exception 'This job is not eligible for a complaint';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 200 then raise exception 'A complaint reason is required'; end if;
  select * into complaint from disputes where job_id = p_job_id and status = 'open' for update;
  if found then
    if complaint.cancellation_state <> 'pending' or complaint.cancellation_state is null then
      raise exception using errcode = '23505', message = 'There is already an open complaint for this job';
    end if;
    if now() >= complaint.cancellation_deadline then raise exception 'The cancellation response window has ended'; end if;
    update disputes set cancellation_state = 'contested' where id = complaint.id returning * into complaint;
    insert into dispute_entries(dispute_id, author_id, kind, body)
      values (complaint.id, p_actor_id, 'appeal', btrim(p_reason));
    if p_details is not null and btrim(p_details) <> '' then
      insert into dispute_entries(dispute_id, author_id, kind, body)
        values (complaint.id, p_actor_id, 'statement', btrim(p_details));
    end if;
  else
    select * into payment from escrow_transactions where job_id = p_job_id for update;
    insert into disputes(escrow_id, job_id, raised_by, reason, details)
      values (payment.id, p_job_id, p_actor_id, btrim(p_reason), p_details) returning * into complaint;
  end if;
  update escrow_transactions set status = 'disputed' where job_id = p_job_id and status = 'held';
  insert into notifications(recipient_id, type, title, body, data)
    select id, 'dispute_update', 'Complaint opened', 'A complaint is awaiting admin review. Both participants can add statements and evidence.',
      jsonb_build_object('job_id', job.id, 'dispute_id', complaint.id)
    from profiles where id in (job.client_id, job.assigned_provider_id);
  return complaint;
end;
$$;

revoke all on function public.raise_job_dispute(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.raise_job_dispute(uuid, uuid, text, text) to service_role;

commit;
