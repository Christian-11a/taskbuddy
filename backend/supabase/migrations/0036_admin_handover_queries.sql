-- Admin handover: count/search in SQL before pagination, without REST row caps.

create or replace function public.admin_search_audit(p_search text, p_action text, p_actor_id uuid, p_from timestamptz, p_to timestamptz, p_limit integer, p_offset integer)
returns table(rows jsonb, total bigint)
language sql stable security definer set search_path = '' as $$
  with filtered as (
    select to_jsonb(a) || jsonb_build_object('actor', case when p.id is null then null else jsonb_build_object('id', p.id, 'full_name', p.full_name) end) as row,
           a.created_at, a.id
    from public.admin_actions a
    left join public.profiles p on p.id = a.actor_id
    where (p_action is null or a.action = p_action)
      and (p_actor_id is null or a.actor_id = p_actor_id)
      and (p_from is null or a.created_at >= p_from)
      and (p_to is null or a.created_at <= p_to)
      and (p_search is null or strpos(lower(concat_ws(' ', p.full_name, a.action, a.target_type, a.target_id, a.metadata->>'reason')), lower(p_search)) > 0)
  ), page as (
    select * from filtered order by created_at desc, id desc
    limit p_limit offset p_offset
  )
  select coalesce((select jsonb_agg(row order by created_at desc, id desc) from page), '[]'::jsonb),
         (select count(*) from filtered);
$$;
revoke all on function public.admin_search_audit(text, text, uuid, timestamptz, timestamptz, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_search_audit(text, text, uuid, timestamptz, timestamptz, integer, integer) to service_role;

create or replace function public.admin_search_wallet(p_search text, p_direction public.wallet_txn_direction, p_kind public.wallet_txn_kind, p_status public.wallet_txn_status, p_limit integer, p_offset integer)
returns table(rows jsonb, total bigint)
language sql stable security definer set search_path = '' as $$
  with filtered as (
    select to_jsonb(w) || jsonb_build_object('profile', case when p.id is null then null else jsonb_build_object('id', p.id, 'full_name', p.full_name) end) as row,
           w.created_at, w.id
    from public.wallet_transactions w
    left join public.profiles p on p.id = w.profile_id
    where (p_direction is null or w.direction = p_direction)
      and (p_kind is null or w.kind = p_kind)
      and (p_status is null or w.status = p_status)
      and (p_search is null or strpos(lower(concat_ws(' ', p.full_name, w.title, w.id)), lower(p_search)) > 0)
  ), page as (
    select * from filtered order by created_at desc, id desc
    limit p_limit offset p_offset
  )
  select coalesce((select jsonb_agg(row order by created_at desc, id desc) from page), '[]'::jsonb),
         (select count(*) from filtered);
$$;
revoke all on function public.admin_search_wallet(text, public.wallet_txn_direction, public.wallet_txn_kind, public.wallet_txn_status, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_search_wallet(text, public.wallet_txn_direction, public.wallet_txn_kind, public.wallet_txn_status, integer, integer) to service_role;

create or replace function public.admin_dashboard_counts()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'escrow_held_total', (select coalesce(sum(amount), 0) from public.escrow_transactions where status = 'held'),
    'escrow_held_count', (select count(*) from public.escrow_transactions where status = 'held'),
    'open_jobs', (select count(*) from public.jobs where status = 'open'),
    'matching_jobs', (select count(*) from public.jobs where status = 'recommending')
  );
$$;
revoke all on function public.admin_dashboard_counts() from public, anon, authenticated;
grant execute on function public.admin_dashboard_counts() to service_role;

-- Counts respect search/category, but not the selected status or page.
create or replace function public.admin_booking_status_counts(p_search text, p_category_id smallint)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_object_agg(status, total) from (
    select s.status, count(j.id) as total
    from unnest(enum_range(null::public.job_status)) s(status)
    left join (
      select job.id, job.status from public.jobs job
      join public.profiles client on client.id = job.client_id
      left join public.profiles provider on provider.id = job.assigned_provider_id
      join public.service_categories category on category.id = job.category_id
      where (p_category_id is null or job.category_id = p_category_id)
        and (p_search is null
          or job.id::text ilike '%' || p_search || '%'
          or client.full_name ilike '%' || p_search || '%'
          or provider.full_name ilike '%' || p_search || '%'
          or category.name ilike '%' || p_search || '%')
    ) j on j.status = s.status
    group by s.status
  ) counts;
$$;
revoke all on function public.admin_booking_status_counts(text, smallint) from public, anon, authenticated;
grant execute on function public.admin_booking_status_counts(text, smallint) to service_role;
