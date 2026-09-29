-- Historical accepted ASAP jobs predate JobsService.accept's calendar insert.
-- Preserve existing bookings and use the original confirmation/start date,
-- not the day this migration runs. Safe to run again.
insert into public.bookings (job_id, provider_id, client_id, scheduled_at)
select j.id, j.assigned_provider_id, j.client_id,
       coalesce(j.scheduled_at,
         (select min(h.changed_at) from public.job_status_history h
          where h.job_id = j.id and h.new_status in ('confirmed', 'in_progress')),
         j.assigned_at, j.posted_at)
from public.jobs j
where j.status in ('confirmed', 'in_progress')
  and j.assigned_provider_id is not null
  and not exists (select 1 from public.bookings b where b.job_id = j.id)
on conflict (job_id) do nothing;
