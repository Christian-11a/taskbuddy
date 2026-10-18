-- Let the admin bookings list filter by "disputed". 'disputed' is not a job
-- status: it is derived from jobs.dispute_state = 'open' (see 0063), so
-- p_status can no longer be the job_status enum. The parameter becomes text:
--   'disputed'  jobs whose dispute_state is 'open', whatever their status
--   any other  jobs whose status equals the value, as before
-- Disputed jobs still match their real status filter (e.g. 'in_progress').
-- admin_booking_status_counts is intentionally unchanged: the web Bookings page
-- sums every key for its "All" total, so a 'disputed' key would double-count.
-- The Disputed filter uses the list total instead.
-- The function is dropped first because its signature changes; a second
-- overload would make the PostgREST rpc call ambiguous.

begin;

drop function if exists public.admin_list_bookings(
  pg_catalog.text, public.job_status, pg_catalog.int2, pg_catalog.int4, pg_catalog.int4
);

create or replace function public.admin_list_bookings(
  p_search_term pg_catalog.text,
  p_status pg_catalog.text,
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
      and (p_status is null
        or (p_status = 'disputed' and job.dispute_state = 'open')
        or (p_status <> 'disputed' and job.status::pg_catalog.text = p_status))
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

revoke all on function public.admin_list_bookings(
  pg_catalog.text, pg_catalog.text, pg_catalog.int2, pg_catalog.int4, pg_catalog.int4
) from public, anon, authenticated;
grant execute on function public.admin_list_bookings(
  pg_catalog.text, pg_catalog.text, pg_catalog.int2, pg_catalog.int4, pg_catalog.int4
) to service_role;

commit;
