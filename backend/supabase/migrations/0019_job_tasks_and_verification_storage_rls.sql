-- TaskBuddy schema — job task lists, the 'confirmed' constraint update, and
-- Row-Level Security over the verification-docs Storage bucket.
-- Source of truth: backend/BACKEND_SCHEMA.md §26.
--
-- APPLY 0018 FIRST, AS A SEPARATE RUN. This file uses the 'confirmed' enum
-- value that 0018 adds, and Postgres rejects a new enum value used in the same
-- transaction that created it.
--
-- Three things land here:
--
--   1. chk_assignment_consistency learns about 'confirmed' — a confirmed job
--      still must have an assigned provider.
--   2. job_tasks — the checklist a client picks when posting a job and the
--      provider ticks off while doing it. Until now "what needs doing" was one
--      free-text description, so a provider had no structured progress to
--      report and a client had nothing to watch move.
--   3. Storage RLS on verification-docs. 0008 created the bucket private,
--      which stops anonymous reads, but it wrote no policies over
--      storage.objects — so nothing in the database itself said who may read a
--      government ID. The API has always fronted these with the service-role
--      key (which bypasses RLS by design); this makes the rule explicit in the
--      database too, so an anon/authenticated key cannot reach the objects
--      even if a future endpoint hands one out by mistake.
--
-- Conventions mirror 0001–0018.

-- ===========================================================================
-- 1. A confirmed job still needs a provider on it
-- ===========================================================================
alter table jobs drop constraint if exists chk_assignment_consistency;
alter table jobs
    add constraint chk_assignment_consistency check (
        status not in ('assigned', 'confirmed', 'in_progress', 'completed')
        or assigned_provider_id is not null
    );

-- ===========================================================================
-- 2. job_tasks — the per-job checklist
--
--    Rows are written once, by the API, when the client posts the job (step 3
--    of the guided creation flow). Labels are stored as text rather than
--    referencing a catalogue table on purpose: the presets a client picks from
--    are presentation, and a job must keep reading the same years later even
--    if the app's suggestion list changes underneath it.
--
--    `is_done` is the only column that changes after insert, and only the
--    assigned provider changes it.
-- ===========================================================================
create table if not exists job_tasks (
    id           uuid primary key default gen_random_uuid(),
    job_id       uuid not null references jobs (id) on delete cascade,
    label        text not null check (char_length(label) between 1 and 120),
    -- Display order as the client arranged it. Not unique: reordering would
    -- otherwise need a deferred constraint for no benefit.
    position     smallint not null default 0,
    is_done      boolean not null default false,
    completed_at timestamptz,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),
    -- completed_at is set by the API in the same write as is_done; this keeps
    -- the pair from drifting apart.
    constraint chk_job_tasks_done_timestamp
        check (is_done = (completed_at is not null))
);

create index if not exists idx_job_tasks_job on job_tasks (job_id, position);

drop trigger if exists trg_job_tasks_updated_at on job_tasks;
create trigger trg_job_tasks_updated_at
    before update on job_tasks
    for each row execute function set_updated_at();

comment on table job_tasks is
    'Checklist for one job: chosen by the client at posting, ticked off by the '
    'assigned provider. Labels are snapshots, not references to a catalogue.';

-- Defence in depth — every write goes through the API on the service-role key.
alter table job_tasks enable row level security;

drop policy if exists job_tasks_participant_read on job_tasks;
create policy job_tasks_participant_read on job_tasks
    for select using (
        exists (
            select 1 from jobs j
             where j.id = job_tasks.job_id
               and (j.client_id = auth.uid() or j.assigned_provider_id = auth.uid())
        )
    );

drop policy if exists job_tasks_provider_update on job_tasks;
create policy job_tasks_provider_update on job_tasks
    for update using (
        exists (
            select 1 from jobs j
             where j.id = job_tasks.job_id
               and j.assigned_provider_id = auth.uid()
        )
    );

-- ===========================================================================
-- 3. Who counts as an admin
--
--    SECURITY DEFINER so the policies below can read `profiles.role` without
--    the caller needing their own select privilege on it, and so a recursive
--    RLS check on profiles cannot loop. STABLE: one lookup per statement.
-- ===========================================================================
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from profiles
         where id = auth.uid()
           and role = 'admin'
    );
$$;

comment on function is_admin() is
    'True when the JWT belongs to an admin profile. Used by Storage policies '
    'over verification documents.';

-- ===========================================================================
-- 4. Storage RLS — government IDs are admin-readable only
--
--    Object paths are '<profile id>/<uuid>.<ext>', generated server-side
--    (uploads.service.ts), so the first path segment identifies the owner and
--    a provider cannot write into someone else's folder.
--
--    Reads: admins only. Deliberately NOT the uploading provider — there is no
--    product reason to re-download your own ID, and every extra reader is
--    another way for the document to leak. The provider sees the *status* of
--    their submission, never the file. The admin console does not use these
--    policies either (the API signs download URLs with the service-role key);
--    they exist so the rule holds if anything ever reaches Storage with a user
--    token.
--
--    NOTE FOR WHOEVER APPLIES THIS: creating policies on storage.objects needs
--    ownership of that table. It works in the Supabase SQL editor. If your
--    connection lacks it, the block below catches the error and finishes with a
--    warning rather than rolling the whole migration back — then create the
--    same four policies through Dashboard → Storage → verification-docs →
--    Policies, copying the USING/WITH CHECK expressions verbatim from here.
-- ===========================================================================
-- Guarded so this file also applies to a plain Postgres without Supabase's
-- storage schema (a local test database, say) instead of erroring on it.
do $$
begin
    if to_regclass('storage.objects') is null then
        raise notice 'storage.objects not present — skipping Storage policies';
        return;
    end if;

    -- Providers upload their own documents, into their own folder only.
    drop policy if exists verification_docs_owner_insert on storage.objects;
    create policy verification_docs_owner_insert on storage.objects
        for insert to authenticated
        with check (
            bucket_id = 'verification-docs'
            and (storage.foldername(name))[1] = auth.uid()::text
        );

    -- Re-uploading over your own pending document is allowed; touching
    -- anyone else's is not.
    drop policy if exists verification_docs_owner_update on storage.objects;
    create policy verification_docs_owner_update on storage.objects
        for update to authenticated
        using (
            bucket_id = 'verification-docs'
            and (storage.foldername(name))[1] = auth.uid()::text
        )
        with check (
            bucket_id = 'verification-docs'
            and (storage.foldername(name))[1] = auth.uid()::text
        );

    -- Reading a document is an admin act.
    drop policy if exists verification_docs_admin_read on storage.objects;
    create policy verification_docs_admin_read on storage.objects
        for select to authenticated
        using (bucket_id = 'verification-docs' and is_admin());

    drop policy if exists verification_docs_admin_delete on storage.objects;
    create policy verification_docs_admin_delete on storage.objects
        for delete to authenticated
        using (bucket_id = 'verification-docs' and is_admin());

    -- Belt and braces: 0008 created the bucket private, but an environment
    -- restored from an older dump may not have it.
    update storage.buckets set public = false where id = 'verification-docs';

exception
    -- Creating policies on storage.objects needs ownership of that table. If
    -- this connection does not have it, say so and let the rest of the
    -- migration stand rather than rolling back job_tasks with it — the
    -- policies can then be added from the Storage → Policies dashboard. The
    -- bucket is private either way, so nothing is exposed in the meantime.
    when insufficient_privilege then
        raise warning 'Could not create verification-docs Storage policies (%). Add them from Dashboard -> Storage -> verification-docs -> Policies, using the expressions in this migration.', sqlerrm;
end $$;
