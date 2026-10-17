-- Jobs did not show when they were in dispute: only the escrow row and the
-- disputes table knew. A dispute can open while a job is in progress,
-- completed (warranty) or being cancelled, so jobs.status keeps tracking the
-- work and jobs.dispute_state tracks the dispute alongside it:
--   null       never disputed
--   'open'     a dispute is open — payment is frozen until an admin decides
--   'resolved' the last dispute was resolved (see disputes.resolution)
-- The API derives display_status = 'disputed' while dispute_state is 'open'.

begin;

alter table public.jobs
  add column if not exists dispute_state text
    check (dispute_state in ('open', 'resolved'));

create index if not exists idx_jobs_dispute_open
  on public.jobs (updated_at desc) where dispute_state = 'open';

create or replace function public.sync_job_dispute_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(new.job_id, old.job_id);
begin
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
   where j.id = target;
  return null;
end;
$$;

drop trigger if exists trg_disputes_sync_job_state on public.disputes;
create trigger trg_disputes_sync_job_state
  after insert or update of status or delete on public.disputes
  for each row execute function public.sync_job_dispute_state();

revoke all on function public.sync_job_dispute_state() from public, anon, authenticated;

-- Backfill existing jobs.
update public.jobs j
   set dispute_state = case
         when exists (select 1 from public.disputes d
                       where d.job_id = j.id and d.status = 'open') then 'open'
         else 'resolved'
       end
 where exists (select 1 from public.disputes d
                where d.job_id = j.id and d.status in ('open', 'resolved'));

commit;
