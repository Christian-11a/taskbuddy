begin;

alter table public.dispute_entries
  add column if not exists recipient text
    check (recipient in ('client', 'provider', 'both'));
alter table public.dispute_entries
  drop constraint if exists dispute_entries_kind_check;
alter table public.dispute_entries
  add constraint dispute_entries_kind_check
    check (kind in ('statement', 'appeal', 'clarification', 'request_evidence',
                    'resolution', 'cancellation_response', 'system'));

alter table public.notifications
  add column if not exists dismissed_at timestamptz,
  add column if not exists broadcast_id uuid,
  add column if not exists push_attempted_count integer not null default 0
    check (push_attempted_count >= 0),
  add column if not exists push_sent_count integer not null default 0
    check (push_sent_count >= 0),
  add column if not exists push_failed_count integer not null default 0
    check (push_failed_count >= 0);

create table if not exists public.notification_broadcasts (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id),
  audience text not null check (audience in ('all', 'clients', 'providers')),
  title text not null,
  body text not null,
  recipient_count integer not null check (recipient_count >= 0),
  inserted_count integer not null default 0 check (inserted_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  created_at timestamptz not null default now()
);
alter table public.notifications
  drop constraint if exists notifications_broadcast_id_fkey;
alter table public.notifications
  add constraint notifications_broadcast_id_fkey
    foreign key (broadcast_id) references public.notification_broadcasts(id)
    on delete set null;
alter table public.notification_broadcasts enable row level security;
revoke all on public.notification_broadcasts from public, anon, authenticated;
grant all on public.notification_broadcasts to service_role;

create unique index if not exists uq_admin_alert_event
  on public.notifications(recipient_id, (data ->> 'event_key'))
  where type = 'admin_alert' and data ? 'event_key';
create index if not exists idx_notifications_broadcast
  on public.notifications(broadcast_id, pushed_at)
  where broadcast_id is not null;

create or replace function public.write_admin_alert(
  p_event_key text, p_title text, p_body text, p_data jsonb
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications(recipient_id, type, title, body, data)
    select p.id, 'admin_alert', p_title, p_body,
      p_data || jsonb_build_object('event_key', p_event_key)
    from public.profiles p
    where p.role = 'admin' and p.deactivated_at is null and p.deleted_at is null
  on conflict do nothing;
end;
$$;
revoke all on function public.write_admin_alert(text,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.write_admin_alert(text,text,text,jsonb)
  to service_role;

create or replace function public.notify_admin_new_dispute()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.write_admin_alert(
    'dispute:' || new.id::text,
    'New complaint or cancellation review',
    'A job case needs admin review.',
    jsonb_build_object('target', 'disputes', 'dispute_id', new.id, 'job_id', new.job_id)
  );
  return new;
end;
$$;
drop trigger if exists trg_admin_alert_new_dispute on public.disputes;
create trigger trg_admin_alert_new_dispute after insert on public.disputes
  for each row execute function public.notify_admin_new_dispute();

create or replace function public.notify_admin_dispute_entry()
returns trigger language plpgsql security definer set search_path = public as $$
declare job_id uuid;
begin
  if new.kind not in ('appeal', 'request_evidence') then return new; end if;
  select d.job_id into job_id from public.disputes d where d.id = new.dispute_id;
  perform public.write_admin_alert(
    new.kind || ':' || new.id::text,
    case when new.kind = 'appeal' then 'Complaint appealed' else 'Evidence requested' end,
    'A job case was updated and needs admin attention.',
    jsonb_build_object('target', 'disputes', 'dispute_id', new.dispute_id,
                       'job_id', job_id, 'entry_id', new.id)
  );
  return new;
end;
$$;
drop trigger if exists trg_admin_alert_dispute_entry on public.dispute_entries;
create trigger trg_admin_alert_dispute_entry after insert on public.dispute_entries
  for each row execute function public.notify_admin_dispute_entry();

create or replace function public.notify_admin_cancellation_expired()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.cancellation_state = 'expired'
     and old.cancellation_state is distinct from new.cancellation_state then
    perform public.write_admin_alert(
      'cancellation-expired:' || new.id::text,
      'Cancellation response window expired',
      'A cancellation case closed after the response deadline.',
      jsonb_build_object('target', 'disputes', 'dispute_id', new.id, 'job_id', new.job_id)
    );
  end if;
  return new;
end;
$$;
drop trigger if exists trg_admin_alert_cancellation_expired on public.disputes;
create trigger trg_admin_alert_cancellation_expired
  after update of cancellation_state on public.disputes
  for each row execute function public.notify_admin_cancellation_expired();

create or replace function public.notify_admin_verification_submitted()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'pending' then return new; end if;
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;
  perform public.write_admin_alert(
    'verification:' || new.id::text || ':' || new.submitted_at::text,
    'Provider verification submitted',
    'A provider submitted identity documents for review.',
    jsonb_build_object('target', 'verifications', 'verification_id', new.id,
                       'provider_id', new.provider_id)
  );
  return new;
end;
$$;
drop trigger if exists trg_admin_alert_verification_submitted on public.provider_verifications;
create trigger trg_admin_alert_verification_submitted
  after insert or update of status on public.provider_verifications
  for each row execute function public.notify_admin_verification_submitted();

create or replace function public.notify_admin_withdrawal_requested()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'withdrawal' and new.status = 'pending' then
    perform public.write_admin_alert(
      'withdrawal:' || new.id::text,
      'Wallet withdrawal requested',
      'A wallet withdrawal is waiting for admin review.',
      jsonb_build_object('target', 'withdrawals', 'withdrawal_id', new.id,
                         'profile_id', new.profile_id)
    );
  end if;
  return new;
end;
$$;
drop trigger if exists trg_admin_alert_withdrawal_requested on public.wallet_transactions;
create trigger trg_admin_alert_withdrawal_requested
  after insert on public.wallet_transactions
  for each row execute function public.notify_admin_withdrawal_requested();

drop function if exists public.add_dispute_entry(uuid,uuid,text,text,uuid);
create or replace function public.add_dispute_entry(
  p_dispute_id uuid,
  p_actor_id uuid,
  p_kind text,
  p_body text,
  p_message_id uuid default null,
  p_recipient text default null
) returns public.dispute_entries
language plpgsql security definer set search_path = public as $$
declare job public.jobs; complaint public.disputes; actor public.profiles;
        entry public.dispute_entries; addressed uuid[];
begin
  select j.* into job from public.jobs j
    join public.disputes d on d.job_id = j.id
    where d.id = p_dispute_id for update of j;
  if not found then raise exception 'Complaint not found'; end if;
  select * into complaint from public.disputes where id = p_dispute_id for update;
  select * into actor from public.profiles where id = p_actor_id;
  if actor.id is null then raise exception 'Actor not found'; end if;
  if actor.role = 'admin' then
    if p_kind not in ('clarification', 'request_evidence') or complaint.status <> 'open' then
      raise exception 'Only clarification and evidence requests are allowed here';
    end if;
    if p_recipient is null then p_recipient := 'both'; end if;
    if p_recipient not in ('client', 'provider', 'both') then
      raise exception 'Recipient must be client, provider, or both';
    end if;
  else
    if actor.id <> job.client_id and actor.id is distinct from job.assigned_provider_id then
      raise exception 'Not your job';
    end if;
    if p_kind not in ('statement', 'appeal') then
      raise exception 'Invalid participant statement';
    end if;
    if p_recipient is not null then raise exception 'Participants cannot choose a recipient'; end if;
    if complaint.status <> 'open' and p_kind <> 'appeal' then
      raise exception 'Use an appeal for a closed complaint';
    end if;
  end if;
  if p_body is null or char_length(btrim(p_body)) not between 1 and 1000 then
    raise exception 'Statement must contain 1 to 1000 characters';
  end if;
  if p_message_id is not null and not exists (
    select 1 from public.messages m join public.conversations c on c.id = m.conversation_id
      where m.id = p_message_id and c.job_id = job.id and m.sender_id = actor.id
  ) then raise exception 'Evidence must be your own message from this job'; end if;
  if p_kind = 'appeal' then
    if complaint.cancellation_state = 'pending' and now() >= complaint.cancellation_deadline then
      raise exception 'The cancellation response window has ended';
    end if;
    update public.disputes set status = 'open', resolution = null, resolution_note = null,
      resolved_by = null, resolved_at = null,
      cancellation_state = case when cancellation_state = 'pending' then 'contested' else cancellation_state end
      where id = complaint.id;
  end if;
  insert into public.dispute_entries(dispute_id, author_id, kind, body, message_id, recipient)
    values (complaint.id, actor.id, p_kind, btrim(p_body), p_message_id,
      case when actor.role = 'admin' then p_recipient else null end)
    returning * into entry;
  if actor.role = 'admin' then
    insert into public.admin_actions(actor_id, action, target_type, target_id, metadata)
      values(actor.id,
        case when p_kind = 'request_evidence' then 'dispute.request_evidence' else 'dispute.clarification' end,
        'disputes', complaint.id,
        jsonb_build_object('entry_id', entry.id, 'recipient', p_recipient));
    addressed := case p_recipient
      when 'client' then array[job.client_id]
      when 'provider' then array[job.assigned_provider_id]
      else array[job.client_id, job.assigned_provider_id]
    end;
    insert into public.notifications(recipient_id, type, title, body, data)
      select recipient, 'dispute_update',
        case when recipient = any(addressed) and p_recipient <> 'both' then 'Asked of you'
             else 'More information requested' end,
        case when p_kind = 'request_evidence' then 'Attach a photo or chat message to this complaint.' else btrim(p_body) end,
        jsonb_build_object('job_id', job.id, 'dispute_id', complaint.id,
                           'entry_id', entry.id, 'recipient', p_recipient)
      from unnest(array[job.client_id, job.assigned_provider_id]) recipient
      where recipient is not null;
  else
    insert into public.notifications(recipient_id, type, title, body, data)
      select id, 'dispute_update', 'Complaint updated',
        'A participant added a ' || p_kind || '. Open the case to read it.',
        jsonb_build_object('job_id', job.id, 'dispute_id', complaint.id, 'entry_id', entry.id)
      from public.profiles where id in (job.client_id, job.assigned_provider_id) and id <> actor.id;
  end if;
  return entry;
end;
$$;
revoke all on function public.add_dispute_entry(uuid,uuid,text,text,uuid,text)
  from public, anon, authenticated;
grant execute on function public.add_dispute_entry(uuid,uuid,text,text,uuid,text)
  to service_role;

create or replace function public.notification_snapshot(p_recipient uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'notifications', coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at desc, n.id desc)
      from (select * from public.notifications where recipient_id = p_recipient
        and dismissed_at is null order by created_at desc, id desc limit 50) n), '[]'::jsonb),
    'unreadCount', (select count(*) from public.notifications
      where recipient_id = p_recipient and read_at is null and dismissed_at is null)
  );
$$;
revoke all on function public.notification_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.notification_snapshot(uuid) to service_role;

commit;
