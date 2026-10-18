-- Fixes 0063. Written as 0065 and renumbered because upstream took 0065.
-- Already applied to production by hand on 2026-10-18; re-running it is
-- harmless.
--
-- 0063's sync trigger updated jobs immediately after a dispute row changed.
-- review_work_cancellation (0037/0041) is a BEFORE UPDATE trigger on
-- jobs that inserts the cancellation dispute, so the sync trigger updated the
-- same jobs row while the outer UPDATE was still running, and Postgres
-- aborted the cancellation ("tuple to be updated was already modified by an
-- operation triggered by the current command"). Every client cancellation of
-- a hired job failed.
--
-- A deferred constraint trigger runs at commit, after the outer statement has
-- finished, so it can update jobs safely from any path. It also recomputes the
-- old job when a dispute's job_id changes.

begin;

drop trigger if exists trg_disputes_sync_job_state on public.disputes;

create or replace function public.sync_job_dispute_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
begin
  foreach target in array array_remove(array[
    case when tg_op in ('UPDATE', 'DELETE') then old.job_id end,
    case when tg_op in ('INSERT', 'UPDATE') then new.job_id end
  ], null) loop
    update public.jobs j
       set dispute_state = case
             when exists (select 1 from public.disputes d
                           where d.job_id = target and d.status = 'open')
               then 'open'
             when exists (select 1 from public.disputes d
                           where d.job_id = target and d.status = 'resolved')
               then 'resolved'
             else null
           end
     where j.id = target
       and j.dispute_state is distinct from (case
             when exists (select 1 from public.disputes d
                           where d.job_id = target and d.status = 'open')
               then 'open'
             when exists (select 1 from public.disputes d
                           where d.job_id = target and d.status = 'resolved')
               then 'resolved'
             else null
           end);
  end loop;
  return null;
end;
$$;

create constraint trigger trg_disputes_sync_job_state
  after insert or update of status, job_id or delete on public.disputes
  deferrable initially deferred
  for each row execute function public.sync_job_dispute_state();

revoke all on function public.sync_job_dispute_state() from public, anon, authenticated;

commit;
