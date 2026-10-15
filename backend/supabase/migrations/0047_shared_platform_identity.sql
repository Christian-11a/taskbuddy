begin;
alter table public.platform_settings add column if not exists platform_name text not null default 'TaskBuddy';
alter table public.platform_settings add column if not exists support_email text;
alter table public.platform_settings add column if not exists identity_version integer not null default 1;
do $$ begin if not exists(select 1 from pg_constraint where conname='platform_name_valid') then alter table public.platform_settings add constraint platform_name_valid check (char_length(btrim(platform_name)) between 1 and 120); end if; end $$;
do $$ begin if not exists(select 1 from pg_constraint where conname='support_email_valid') then alter table public.platform_settings add constraint support_email_valid check (support_email is null or support_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'); end if; end $$;
create or replace function public.admin_update_platform_identity(p_actor uuid, p_expected_version integer, p_name text, p_email text)
returns public.platform_settings language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_row public.platform_settings;
begin
  if not exists (select 1 from public.profiles where id = p_actor and role = 'admin' and deactivated_at is null and deleted_at is null) then
    raise exception using errcode = 'TB403', message = 'Admin access required';
  end if;
  update public.platform_settings set platform_name = btrim(p_name),
    support_email = nullif(btrim(p_email), ''), identity_version = identity_version + 1,
    updated_at = now(), updated_by = p_actor
    where id = true and identity_version = p_expected_version returning * into v_row;
  if not found then raise exception using errcode = 'TB409', message = 'Platform settings changed; reload and try again'; end if;
  insert into public.admin_actions(actor_id, action, target_type, target_id, metadata)
    values(p_actor, 'platform.identity.update', 'platform_settings', '00000000-0000-0000-0000-000000000000',
      jsonb_build_object('platform_name',v_row.platform_name,'support_email',v_row.support_email));
  return v_row;
end; $$;
revoke all on function public.admin_update_platform_identity(uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.admin_update_platform_identity(uuid, integer, text, text) to service_role;
commit;
