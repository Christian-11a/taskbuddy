-- TaskBuddy schema — chat attachments
-- Adds a column messages (0006) has never had, and the private bucket the API
-- issues signed upload/download URLs for.
--
-- Object paths are '<uploader profile id>/<uuid>.<ext>' (uploads.service.ts),
-- same convention as every other bucket. Private, like verification-docs (0008)
-- and unlike avatars/job-photos: a chat photo is between two people and shown
-- nowhere else, so signing each read is the right tradeoff.
--
-- Conventions mirror 0001-0029.

insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', false)
on conflict (id) do nothing;

alter table messages
    add column if not exists attachment_path text;

comment on column messages.attachment_path is
    'Object path in the chat-attachments bucket, <profile id>/<uuid>.<ext> '
    '(uploads.service.ts). Null for a text-only message.';

-- Defence in depth, same shape as verification-docs' storage RLS (0019): the
-- API always reads/writes with the service-role key, which bypasses RLS. This
-- exists so the rule holds if a user-scoped key ever reaches Storage directly.
-- The real access gate is server-side: ChatService.assertParticipant() runs
-- before any signed download URL for this bucket is minted.
drop policy if exists chat_attachments_owner_read on storage.objects;
create policy chat_attachments_owner_read on storage.objects
    for select using (
        bucket_id = 'chat-attachments'
        and (storage.foldername(name))[1] = auth.uid()::text
    );
