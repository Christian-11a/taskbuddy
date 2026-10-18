-- Security fixes from the October audit (H7, H8, M5). The apps talk only to
-- the API, which uses the service role; these close what a signed-in user
-- (or anyone with the public anon key) could read or upload directly.
--
-- 1. profiles: any signed-in user could read every profile's phone, address
--    and coordinates through PostgREST. Only a user's own row stays readable.
-- 2. jobs: open jobs (with address and coordinates) were readable by every
--    role. Only providers may read open jobs; clients read their own and
--    providers their assigned ones, as before.
-- 3. stripe_events: idempotency rows must not be readable or deletable with
--    the anon key (a deleted row lets Stripe re-deliver an event twice).
-- 4. Storage: avatars, chat-attachments, job-photos and verification-docs had
--    no size or type limit, so a signed upload URL could store any file of
--    any size. Same limits as the newer buckets: 10 MB, JPEG/PNG/WebP.

begin;

drop policy if exists profiles_select_authenticated on public.profiles;

drop policy if exists jobs_provider_read on public.jobs;
create policy jobs_provider_read on public.jobs
  for select to authenticated
  using (
    assigned_provider_id = auth.uid()
    or (
      status in ('open', 'recommending')
      and exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role = 'provider'
      )
    )
  );

alter table public.stripe_events enable row level security;
revoke all on public.stripe_events from anon, authenticated;

update storage.buckets
   set file_size_limit = 10485760,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id in ('avatars', 'chat-attachments', 'job-photos', 'verification-docs');

commit;
