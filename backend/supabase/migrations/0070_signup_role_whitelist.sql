-- Security fix (audit C3). handle_new_user (0016) cast the role from the new
-- user's own metadata, so anyone holding the public anon key could call
-- Supabase's auth.signUp with { data: { role: 'admin' } } and get an admin
-- profile: past /auth/admin/login, every @Roles('admin') route, and
-- is_admin() storage policies (ID documents).
--
-- Sign-up metadata may now only choose 'client' or 'provider'. Anything else
-- becomes 'client'. Admins are created only by POST /admin/admins, which
-- signs the user up as a client and promotes them with the service role.
-- Behaviour is otherwise identical to 0016 (no role = Google sign-in pending
-- role selection).

begin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
    v_role_raw text;
    v_role     user_role;
    v_pending  boolean;
begin
    v_role_raw := new.raw_user_meta_data ->> 'role';
    v_pending := (v_role_raw is null);
    v_role := case
                when v_role_raw in ('client', 'provider') then v_role_raw::user_role
                else 'client'::user_role
              end;

    insert into public.profiles (
        id,
        role,
        full_name,
        phone,
        google_signup_pending
    )
    values (
        new.id,
        v_role,
        coalesce(new.raw_user_meta_data ->> 'full_name', 'Unnamed User'),
        new.raw_user_meta_data ->> 'phone',
        v_pending
    );

    return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

commit;
