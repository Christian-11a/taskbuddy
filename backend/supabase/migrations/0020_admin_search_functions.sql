-- PostgREST cannot reliably OR filters across embedded resources. These
-- service-role-only list functions filter, count, order, and paginate in SQL,
-- returning the existing nested API row shape as JSON.

drop function if exists public.admin_search_booking_ids(pg_catalog.text);
drop function if exists public.admin_search_activity_ids(pg_catalog.text);
drop function if exists public.admin_search_transaction_ids(pg_catalog.text);

create function public.admin_list_bookings(
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

create function public.admin_list_activity(
  p_search_term pg_catalog.text,
  p_from pg_catalog.timestamptz,
  p_to pg_catalog.timestamptz,
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
      pg_catalog.jsonb_build_object(
        'id', history.id,
        'old_status', history.old_status,
        'new_status', history.new_status,
        'changed_at', history.changed_at,
        'jobs', pg_catalog.jsonb_build_object('title', job.title),
        'changed_by', case when changed_by.id is null then null else
          pg_catalog.jsonb_build_object('full_name', changed_by.full_name)
        end
      ) as row,
      history.changed_at as sort_at,
      history.id as id
    from public.job_status_history as history
    join public.jobs as job on job.id = history.job_id
    left join public.profiles as changed_by on changed_by.id = history.changed_by
    where (p_search_term is null or job.title ilike '%' || p_search_term || '%')
      and (p_from is null or history.changed_at >= p_from)
      and (p_to is null or history.changed_at <= p_to)
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

create function public.admin_list_transactions(
  p_search_term pg_catalog.text,
  p_status public.escrow_status,
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
      pg_catalog.to_jsonb(escrow) || pg_catalog.jsonb_build_object(
        'jobs', pg_catalog.jsonb_build_object(
          'title', job.title,
          'service_categories', pg_catalog.jsonb_build_object('name', category.name)
        ),
        'client', pg_catalog.jsonb_build_object('id', client.id, 'full_name', client.full_name),
        'provider', pg_catalog.jsonb_build_object('id', provider.id, 'full_name', provider.full_name)
      ) as row,
      escrow.held_at as sort_at,
      escrow.id as id
    from public.escrow_transactions as escrow
    join public.profiles as client on client.id = escrow.client_id
    join public.profiles as provider on provider.id = escrow.provider_id
    join public.jobs as job on job.id = escrow.job_id
    join public.service_categories as category on category.id = job.category_id
    where (p_search_term is null
        or escrow.id::pg_catalog.text ilike '%' || p_search_term || '%'
        or client.full_name ilike '%' || p_search_term || '%'
        or provider.full_name ilike '%' || p_search_term || '%'
        or job.title ilike '%' || p_search_term || '%')
      and (p_status is null or escrow.status = p_status)
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

revoke all on function public.admin_list_bookings(pg_catalog.text, public.job_status, pg_catalog.int2, pg_catalog.int4, pg_catalog.int4) from public, anon, authenticated;
revoke all on function public.admin_list_activity(pg_catalog.text, pg_catalog.timestamptz, pg_catalog.timestamptz, pg_catalog.int4, pg_catalog.int4) from public, anon, authenticated;
revoke all on function public.admin_list_transactions(pg_catalog.text, public.escrow_status, pg_catalog.int4, pg_catalog.int4) from public, anon, authenticated;
grant execute on function public.admin_list_bookings(pg_catalog.text, public.job_status, pg_catalog.int2, pg_catalog.int4, pg_catalog.int4) to service_role;
grant execute on function public.admin_list_activity(pg_catalog.text, pg_catalog.timestamptz, pg_catalog.timestamptz, pg_catalog.int4, pg_catalog.int4) to service_role;
grant execute on function public.admin_list_transactions(pg_catalog.text, public.escrow_status, pg_catalog.int4, pg_catalog.int4) to service_role;
