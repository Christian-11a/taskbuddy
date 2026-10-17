-- Photo evidence.
--
-- 1. Complaints: the client and the provider can attach up to 6 photos to the
--    complaint they raise and to each statement or appeal they add. Kept in
--    the PRIVATE `dispute-evidence` bucket; the API hands out short-lived
--    signed URLs to the two participants and admins.
-- 2. Task checklist: ticking a task done needs at least one proof photo
--    (up to 4). Kept in the `task-proof` bucket, public like `job-photos`, so
--    the client sees the proof next to each task.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('dispute-evidence', 'dispute-evidence', false, 10485760, array['image/jpeg','image/png','image/webp']),
  ('task-proof', 'task-proof', true, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.disputes
  add column if not exists photo_paths text[] not null default '{}'
    check (cardinality(photo_paths) <= 6);

alter table public.dispute_entries
  add column if not exists photo_paths text[] not null default '{}'
    check (cardinality(photo_paths) <= 6);

alter table public.job_tasks
  add column if not exists proof_photo_paths text[] not null default '{}'
    check (cardinality(proof_photo_paths) <= 4);

-- New ticks need proof. NOT VALID: tasks ticked before this migration keep
-- their done state without photos.
alter table public.job_tasks
  drop constraint if exists chk_job_tasks_done_needs_proof;
alter table public.job_tasks
  add constraint chk_job_tasks_done_needs_proof
  check (not is_done or cardinality(proof_photo_paths) >= 1) not valid;

commit;
