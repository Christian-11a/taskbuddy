alter type dispute_resolution add value if not exists 'reviewed';

-- FullTest bug remediation. Apply before deploying the matching/dispute API.
-- Existing primary and admin-approved secondary categories form the skill set.
create or replace function public.provider_approved_categories(p_provider_id uuid)
returns table(category_id smallint)
language sql stable security definer set search_path = public as $$
  select pp.category_id from provider_profiles pp
  where pp.profile_id = p_provider_id and pp.is_verified
  union
  select sc.category_id from provider_secondary_categories sc
  join provider_profiles pp on pp.profile_id = sc.provider_id
  where sc.provider_id = p_provider_id and pp.is_verified;
$$;
revoke all on function public.provider_approved_categories(uuid) from public, anon, authenticated;
grant execute on function public.provider_approved_categories(uuid) to service_role;

-- Check requests and approval-time category changes, not just the mobile form.
create or replace function public.guard_active_skill_change()
returns trigger language plpgsql set search_path = public as $$
declare provider uuid;
begin
  if tg_table_name = 'skill_change_requests' then
    if new.type <> 'change_primary' then return new; end if;
    provider := new.provider_id;
  else
    if new.category_id = old.category_id then return new; end if;
    provider := new.profile_id;
  end if;
  perform 1 from profiles where id = provider for update;
  if exists (select 1 from jobs where assigned_provider_id = provider
      and status in ('assigned', 'confirmed', 'in_progress')) then
    raise exception 'Finish accepted jobs before changing your main service';
  end if;
  return new;
end;
$$;
create or replace trigger trg_skill_request_active_work before insert on skill_change_requests
for each row execute function guard_active_skill_change();
create or replace trigger trg_primary_skill_active_work before update of category_id on provider_profiles
for each row execute function guard_active_skill_change();

-- Notification insertion and message persistence succeed or fail together.
create or replace function public.notify_chat_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare conversation conversations;
begin
  select * into strict conversation from conversations where id = new.conversation_id;
  insert into notifications(recipient_id, type, title, body, data)
  values (case when new.sender_id = conversation.client_id then conversation.provider_id else conversation.client_id end,
    'job_update', 'New message', case when new.body = '' then 'Sent a photo' else left(new.body, 200) end,
    jsonb_build_object('job_id', conversation.job_id, 'conversation_id', conversation.id, 'message_id', new.id));
  return new;
end;
$$;
create or replace trigger trg_message_notification after insert on messages
for each row execute function notify_chat_message();

-- Cancelling work already started must not immediately refund the client.
-- Preserve the job, checklist and conversation and open the existing admin queue.
create or replace function public.review_work_cancellation()
returns trigger language plpgsql security definer set search_path = public as $$
declare payment escrow_transactions;
begin
  if old.status = 'in_progress' and new.status = 'cancelled' then
    select * into payment from escrow_transactions where job_id = old.id for update;
    if found and payment.status = 'held' then
      update escrow_transactions set status = 'disputed' where id = payment.id;
      insert into disputes(escrow_id, job_id, raised_by, reason, details)
      values (payment.id, old.id, old.client_id, 'Cancellation after work started',
        'Admin review required before held funds can be released or refunded. Both participants can provide evidence through the job conversation.')
      on conflict (escrow_id) where status = 'open' do nothing;
    end if;
  end if;
  return new;
end;
$$;
create or replace trigger trg_review_work_cancellation before update of status on jobs
for each row execute function review_work_cancellation();

-- One notification when the last task becomes done, not when work merely starts.
create or replace function public.notify_work_ready()
returns trigger language plpgsql security definer set search_path = public as $$
declare task_job jobs;
begin
  select * into strict task_job from jobs where id = new.job_id for update;
  if new.is_done and not old.is_done and task_job.status = 'in_progress'
      and not exists (select 1 from job_tasks where job_id = new.job_id and not is_done) then
    insert into notifications(recipient_id, type, title, body, data)
    values (task_job.client_id, 'job_update', 'Work ready for review',
      'All tasks are marked done. Review the work before confirming completion.', jsonb_build_object('job_id', new.job_id));
  end if;
  return new;
end;
$$;
create or replace trigger trg_work_ready after update of is_done on job_tasks
for each row execute function notify_work_ready();

-- Freeze held money atomically with the complaint. Completed jobs have a
-- seven-day warranty; a settled payment is evidence, never charged a second time.
create or replace function public.raise_job_dispute(p_job_id uuid, p_actor_id uuid, p_reason text, p_details text)
returns disputes language plpgsql security definer set search_path = public as $$
declare job jobs; payment escrow_transactions; complaint disputes;
begin
  select * into job from jobs where id = p_job_id for update;
  if not found then raise exception 'Job not found'; end if;
  if p_actor_id <> job.client_id and p_actor_id is distinct from job.assigned_provider_id then
    raise exception 'Not your job';
  end if;
  if job.status = 'completed' then
    if job.completed_at is null or now() > job.completed_at + interval '7 days' then
      raise exception 'The seven-day dispute window has ended';
    end if;
  elsif job.status not in ('assigned', 'confirmed', 'in_progress', 'cancelled') then
    raise exception 'This job is not eligible for a dispute';
  end if;
  select * into payment from escrow_transactions where job_id = p_job_id for update;
  if not found then raise exception 'This job has no payment to dispute'; end if;
  insert into disputes(escrow_id, job_id, raised_by, reason, details)
  values (payment.id, p_job_id, p_actor_id, p_reason, p_details) returning * into complaint;
  if payment.status = 'held' then
    update escrow_transactions set status = 'disputed' where id = payment.id;
  end if;
  return complaint;
end;
$$;
revoke all on function public.raise_job_dispute(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.raise_job_dispute(uuid, uuid, text, text) to service_role;

create or replace function fn_job_provider_features(p_job_id uuid)
returns table (
    provider_id uuid,
    skills_match smallint,
    distance_km numeric,
    provider_avg_rating numeric,
    provider_completed_jobs integer,
    provider_availability smallint,
    job_idle_duration_hrs numeric,
    provider_response_time_hrs numeric,
    provider_years_experience numeric,
    hour_posted smallint,
    provider_skill_category text,
    day_of_week text,
    job_urgency text,
    job_description text,
    provider_bio text
)
language sql stable as $$
    select
        pp.profile_id,
        1::smallint,
        round(haversine_km(j.latitude, j.longitude, pr.latitude, pr.longitude)::numeric, 2),
        coalesce(pp.cached_avg_rating, 3.0),
        pp.cached_completed_jobs,
        pp.is_available::int::smallint,
        round((extract(epoch from (now() - j.posted_at)) / 3600)::numeric, 2),
        coalesce(pp.cached_avg_response_hrs, 2.0),
        pp.years_experience,
        extract(hour from j.posted_at at time zone 'Asia/Manila')::smallint,
        (select name from service_categories where id = j.category_id),
        trim(to_char(j.posted_at at time zone 'Asia/Manila', 'Day')),
        j.urgency::text,
        j.description,
        pp.bio
    from jobs j
    cross join provider_profiles pp
    join profiles pr on pr.id = pp.profile_id
    join service_categories sc on sc.id = pp.category_id
    where j.id = p_job_id
      and j.category_id in (select category_id from provider_approved_categories(pp.profile_id))
      and pp.is_available
      and pp.is_verified
      and pp.bio is not null
      and pr.deactivated_at is null
      and pr.deleted_at is null
      and pr.latitude is not null and pr.longitude is not null
      and not exists (select 1 from job_applications ja
                      where ja.job_id = j.id and ja.provider_id = pp.profile_id)
      and haversine_km(j.latitude, j.longitude, pr.latitude, pr.longitude)
          <= pp.service_radius_km;
$$;

-- Enforce the same skills on direct applications and on hiring, including
-- applications made before an admin changed the provider's primary category.
create or replace function public.guard_job_skill()
returns trigger language plpgsql set search_path = public as $$
declare provider uuid; category smallint;
begin
  if tg_table_name = 'job_applications' then
    provider := new.provider_id;
    select category_id into strict category from jobs where id = new.job_id;
  else
    if new.assigned_provider_id is null or new.assigned_provider_id is not distinct from old.assigned_provider_id then return new; end if;
    provider := new.assigned_provider_id;
    category := new.category_id;
  end if;
  perform 1 from profiles where id = provider for update;
  if not exists (select 1 from provider_approved_categories(provider) where category_id = category) then
    raise exception 'This job requires an approved skill on your verified provider profile';
  end if;
  return new;
end;
$$;
create or replace trigger trg_application_approved_skill before insert on job_applications
for each row execute function guard_job_skill();
create or replace trigger trg_assignment_approved_skill before update of assigned_provider_id on jobs
for each row execute function guard_job_skill();

create or replace function public.guard_task_progress()
returns trigger language plpgsql set search_path = public as $$
declare current_status job_status;
begin
  select status into strict current_status from jobs where id = new.job_id for update;
  if current_status <> 'in_progress' then
    raise exception 'Start the job before updating its checklist; closed work cannot be edited';
  end if;
  return new;
end;
$$;
create or replace trigger trg_task_progress before update of is_done on job_tasks
for each row execute function guard_task_progress();

create or replace function public.guard_job_completion()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'completed' and old.status <> 'completed' and exists (
    select 1 from job_tasks where job_id = old.id and not is_done
  ) then
    raise exception 'Finish the task checklist before confirming completion';
  end if;
  return new;
end;
$$;
create or replace trigger trg_job_completion before update of status on jobs
for each row execute function guard_job_completion();
