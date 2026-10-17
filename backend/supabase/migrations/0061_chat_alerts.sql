-- Chat no longer floods the Notifications list.
--
-- Until now every chat message inserted a `job_update` notification ("New
-- message"), so the Notifications screen filled with chat lines between the
-- hiring, payment and complaint updates people actually look for there.
-- Chat is now signalled separately:
--   * unread counts per conversation (messages.read_at), shown as badges on
--     the Messages tab and in the conversation list;
--   * a chat push on its own Android channel, sent by the API at most once
--     per conversation per recipient in a short window (claim_chat_push).
begin;

drop trigger if exists trg_message_notification on public.messages;
drop function if exists public.notify_chat_message();

-- Existing chat lines stay as history but no longer count as unread.
update public.notifications
   set read_at = coalesce(read_at, now())
 where data ? 'message_id' and data ? 'conversation_id';

-- When each participant was last pushed about each conversation.
create table if not exists public.chat_push_state (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  recipient_id    uuid not null references public.profiles(id) on delete cascade,
  last_pushed_at  timestamptz not null,
  primary key (conversation_id, recipient_id)
);
alter table public.chat_push_state enable row level security;

-- True when a chat push may go out now, and records it; false while the last
-- push for this conversation and recipient is younger than the window. Safe
-- under concurrent sends: only one caller wins the upsert's condition.
create or replace function public.claim_chat_push(
  p_conversation_id uuid,
  p_recipient_id uuid,
  p_window_seconds integer default 60
) returns boolean
language plpgsql security definer set search_path = public as $$
declare claimed boolean;
begin
  insert into chat_push_state as s (conversation_id, recipient_id, last_pushed_at)
  values (p_conversation_id, p_recipient_id, now())
  on conflict (conversation_id, recipient_id) do update
     set last_pushed_at = excluded.last_pushed_at
   where s.last_pushed_at < now() - make_interval(secs => p_window_seconds)
  returning true into claimed;
  return coalesce(claimed, false);
end;
$$;

-- Unread messages per conversation for one participant: messages the other
-- side sent that this user has not read.
create or replace function public.chat_unread_counts(p_user_id uuid)
returns table (conversation_id uuid, unread integer)
language sql stable security definer set search_path = public as $$
  select m.conversation_id, count(*)::integer
    from messages m
    join conversations c on c.id = m.conversation_id
   where p_user_id in (c.client_id, c.provider_id)
     and m.sender_id <> p_user_id
     and m.read_at is null
   group by m.conversation_id;
$$;

revoke all on function public.claim_chat_push(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.chat_unread_counts(uuid) from public, anon, authenticated;
grant execute on function public.claim_chat_push(uuid, uuid, integer) to service_role;
grant execute on function public.chat_unread_counts(uuid) to service_role;

commit;
