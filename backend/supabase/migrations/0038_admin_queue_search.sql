-- Search and paginate service requests in SQL; include booking titles in both
-- the booking page and its status totals.
create or replace function public.admin_list_skill_requests(
  p_search text,
  p_status public.skill_request_status,
  p_limit integer,
  p_offset integer
)
returns table(rows jsonb, total bigint)
language sql stable security definer set search_path = '' as $$
  with filtered as (
    select
      to_jsonb(request) || jsonb_build_object(
        'category', jsonb_build_object('id', category.id, 'name', category.name),
        'provider', jsonb_build_object('full_name', provider.full_name)
      ) as row,
      request.created_at as sort_at,
      request.id
    from public.skill_change_requests request
    join public.profiles provider on provider.id = request.provider_id
    join public.service_categories category on category.id = request.category_id
    where (p_status is null or request.status = p_status)
      and (p_search is null
        or provider.full_name ilike '%' || p_search || '%'
        or category.name ilike '%' || p_search || '%')
  ), page as (
    select row, sort_at, id from filtered
    order by sort_at desc, id desc
    offset p_offset limit p_limit
  ), counted as (select count(*) as total from filtered)
  select coalesce(jsonb_agg(page.row order by page.sort_at desc, page.id desc)
    filter (where page.row is not null), '[]'::jsonb), counted.total
  from counted left join page on true
  group by counted.total;
$$;
revoke all on function public.admin_list_skill_requests(text, public.skill_request_status, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_list_skill_requests(text, public.skill_request_status, integer, integer) to service_role;

create or replace function public.admin_list_bookings(
  p_search_term pg_catalog.text,
  p_status public.job_status,
  p_category_id pg_catalog.int2,
  p_limit pg_catalog.int4,
  p_offset pg_catalog.int4
)
returns table(rows pg_catalog.jsonb, total pg_catalog.int8)
language sql
stable
security definer
set search_path = ''
as $$
  with filtered as (
    select
      pg_catalog.to_jsonb(job) || pg_catalog.jsonb_build_object(
        'service_categories', pg_catalog.jsonb_build_object('name', category.name),
        'client', pg_catalog.jsonb_build_object('id', client.id, 'full_name', client.full_name),
        'provider', case when provider.id is null then null else
          pg_catalog.jsonb_build_object('id', provider.id, 'full_name', provider.full_name)
        end
      ) as row,
      job.created_at as sort_at,
      job.id as id
    from public.jobs as job
    join public.profiles as client on client.id = job.client_id
    left join public.profiles as provider on provider.id = job.assigned_provider_id
    join public.service_categories as category on category.id = job.category_id
    where (p_search_term is null
        or job.id::pg_catalog.text ilike '%' || p_search_term || '%'
        or job.title ilike '%' || p_search_term || '%'
        or client.full_name ilike '%' || p_search_term || '%'
        or provider.full_name ilike '%' || p_search_term || '%'
        or category.name ilike '%' || p_search_term || '%')
      and (p_status is null or job.status = p_status)
      and (p_category_id is null or job.category_id = p_category_id)
  ), page as (
    select row, sort_at, id
    from filtered
    order by sort_at desc, id desc
    offset p_offset limit p_limit
  ), total as (
    select pg_catalog.count(*) as total from filtered
  )
  select
    coalesce(
      pg_catalog.jsonb_agg(page.row order by page.sort_at desc, page.id desc)
        filter (where page.row is not null),
      '[]'::pg_catalog.jsonb
    ),
    total.total
  from total left join page on true
  group by total.total;
$$;

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
          or job.title ilike '%' || p_search || '%'
          or client.full_name ilike '%' || p_search || '%'
          or provider.full_name ilike '%' || p_search || '%'
          or category.name ilike '%' || p_search || '%')
    ) j on j.status = s.status
    group by s.status
  ) counts;
$$;

-- Supabase's Admin User response does not expose whether a password exists.
-- This flag lets Google-only users avoid a Change Password action they cannot use.
create or replace function public.auth_user_has_password(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(length(user_record.encrypted_password) > 0, false)
  from auth.users user_record where user_record.id = p_user_id;
$$;
revoke all on function public.auth_user_has_password(uuid) from public, anon, authenticated;
grant execute on function public.auth_user_has_password(uuid) to service_role;
