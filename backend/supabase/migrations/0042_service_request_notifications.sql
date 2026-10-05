begin;
-- Persist acknowledgements and decisions with the request write, exactly once.
create or replace function public.notify_service_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    insert into notifications(recipient_id, type, title, body, data)
    values(new.provider_id, 'skill_request_update', 'Service request submitted',
      'Your service request is awaiting review.', jsonb_build_object('request_id', new.id, 'status', new.status));
  elsif new.status is distinct from old.status and new.status in ('approved', 'rejected') then
    insert into notifications(recipient_id, type, title, body, data)
    values(new.provider_id, 'skill_request_update',
      case when new.status = 'approved' then 'Service request approved' else 'Service request not approved' end,
      case when new.status = 'approved' then 'Your approved services have been updated.' else 'Your service request was not approved.' end ||
      case when new.review_note is null then '' else ' ' || new.review_note end,
      jsonb_build_object('request_id', new.id, 'status', new.status, 'review_note', new.review_note));
  end if;
  return new;
end;
$$;
drop trigger if exists service_request_notification on public.skill_change_requests;
create trigger service_request_notification after insert or update of status on public.skill_change_requests
for each row execute function public.notify_service_request();
revoke all on function public.notify_service_request() from public, anon, authenticated;
-- Decision, service change, audit and notification must succeed together.
create or replace function public.review_service_request(p_id uuid, p_admin uuid, p_status text, p_note text)
returns public.skill_change_requests language plpgsql security definer set search_path = public as $$
declare request skill_change_requests; provider provider_profiles;
begin
  if not exists(select 1 from profiles where id = p_admin and role = 'admin') then raise exception 'Admin access required'; end if;
  if p_status not in ('approved', 'rejected') or p_status is null then raise exception 'Unknown decision'; end if;
  select * into request from skill_change_requests where id = p_id for update;
  if not found then raise exception 'Request not found'; end if;
  if request.status <> 'pending' then raise exception 'This request has already been decided'; end if;
  if p_status = 'approved' then
    select * into provider from provider_profiles where profile_id = request.provider_id for update;
    if not found then raise exception 'Provider profile not found'; end if;
    if not exists(select 1 from service_categories where id = request.category_id and is_active) then raise exception 'Unknown or inactive service'; end if;
    if request.type = 'change_primary' then
      update provider_profiles set category_id = request.category_id where profile_id = request.provider_id;
      delete from provider_secondary_categories where provider_id = request.provider_id and category_id = request.category_id;
    else
      if provider.category_id = request.category_id then raise exception 'That is already the main service'; end if;
      insert into provider_secondary_categories(provider_id, category_id) values(request.provider_id, request.category_id) on conflict do nothing;
    end if;
  end if;
  update skill_change_requests set status = p_status::skill_request_status, reviewed_by = p_admin, reviewed_at = now(), review_note = p_note
    where id = p_id returning * into request;
  insert into admin_actions(actor_id, action, target_type, target_id, metadata)
    values(p_admin, case when p_status = 'approved' then 'skill_request.approve' else 'skill_request.reject' end,
      'skill_change_requests', p_id, jsonb_build_object('type', request.type, 'category_id', request.category_id, 'note', p_note));
  return request;
end;
$$;
revoke all on function public.review_service_request(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.review_service_request(uuid,uuid,text,text) to service_role;
-- A single statement gives the bounded list and uncapped count one snapshot.
create or replace function public.notification_snapshot(p_recipient uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'notifications', coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at desc, n.id desc)
      from (select * from notifications where recipient_id = p_recipient order by created_at desc, id desc limit 50) n), '[]'::jsonb),
    'unreadCount', (select count(*) from notifications where recipient_id = p_recipient and read_at is null)
  );
$$;
revoke all on function public.notification_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.notification_snapshot(uuid) to service_role;
commit;
