-- TaskBuddy schema — relax the messages body constraint for attachment-only sends
-- Migration 0030 added attachment_path but never touched 0006's body CHECK, so
-- every attachment-only message (the only kind the app's attach flow produces) was
-- rejected by Postgres. Found by the final review over migration 0030's real
-- schema, not inferred from application code.

alter table messages drop constraint if exists messages_body_check;
alter table messages add constraint messages_body_check
    check (
        char_length(body) <= 1000
        and (char_length(body) > 0 or attachment_path is not null)
    );

comment on constraint messages_body_check on messages is
    'A message needs text, an attachment, or both — never neither.';
