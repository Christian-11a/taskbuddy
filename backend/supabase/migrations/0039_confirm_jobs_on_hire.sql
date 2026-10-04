-- A client's funded hire confirms the booking; the provider starts work later.
-- Both wallet hiring and card-webhook hiring accept the same application row.
create or replace function public.handle_application_accepted()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
    v_job jobs%rowtype;
begin
    if new.status = 'accepted' and old.status is distinct from 'accepted' then
        update jobs
           set assigned_provider_id = new.provider_id,
               assigned_at = now(),
               status = 'confirmed'
         where id = new.job_id
           and status in ('open', 'recommending')
           and assigned_provider_id is null
        returning * into v_job;
        if not found then
            raise exception 'This job is no longer available for hiring';
        end if;

        update job_applications
           set status = 'rejected', decided_at = now()
         where job_id = new.job_id and id <> new.id and status = 'pending';

        insert into bookings (job_id, provider_id, client_id, scheduled_at)
        values (v_job.id, new.provider_id, v_job.client_id,
                coalesce(v_job.scheduled_at, v_job.assigned_at))
        on conflict (job_id) do nothing;

        insert into conversations (job_id, client_id, provider_id)
        values (v_job.id, v_job.client_id, new.provider_id)
        on conflict (job_id) do nothing;
    end if;
    return new;
end;
$$;

-- Existing funded hires no longer need a second acceptance. Preserve schedules,
-- assignment dates, existing bookings, and all completed/cancelled work.
update public.jobs set status = 'confirmed'
where status = 'assigned' and assigned_provider_id is not null;

insert into public.bookings (job_id, provider_id, client_id, scheduled_at)
select j.id, j.assigned_provider_id, j.client_id,
       coalesce(j.scheduled_at, j.assigned_at, j.posted_at)
from public.jobs j
where j.status = 'confirmed' and j.assigned_provider_id is not null
on conflict (job_id) do nothing;
