import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  MessageEvent,
  NotFoundException,
} from '@nestjs/common';
import { concatMap, from, interval, mergeMap, switchMap } from 'rxjs';
import type { Observable } from 'rxjs';
import { SupabaseService } from '../supabase/supabase.service';
import type { Profile } from '../common/types';

/**
 * How often an open stream looks for new messages. Two seconds reads as
 * instant in a chat while keeping one idle conversation under a thousand
 * queries an hour — the API runs on Render's free tier and each open stream
 * holds a request for as long as the screen is open.
 */
const STREAM_POLL_MS = 2000;

/** Cap per tick, so a long backlog can't be emitted as one unbounded burst. */
const STREAM_BATCH = 50;

interface ConversationRow {
  id: string;
  job_id: string;
  client_id: string;
  provider_id: string;
  last_message_at: string | null;
  created_at: string;
  jobs?: { title: string; status: string } | null;
  client?: { full_name: string; avatar_url: string | null } | null;
  provider?: { full_name: string; avatar_url: string | null } | null;
}

// Disambiguate the two profiles FKs on conversations for PostgREST embedding.
const CONVERSATION_SELECT =
  '*, jobs(title, status), client:profiles!conversations_client_id_fkey(full_name, avatar_url), provider:profiles!conversations_provider_id_fkey(full_name, avatar_url)';

@Injectable()
export class ChatService {
  constructor(private readonly supabase: SupabaseService) {}

  /** Conversations the caller participates in, most-recent first. */
  async listConversations(user: Profile) {
    const { data, error } = await this.supabase.admin
      .from('conversations')
      .select(CONVERSATION_SELECT)
      .or(`client_id.eq.${user.id},provider_id.eq.${user.id}`)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
    if (error) throw new BadRequestException(error.message);
    return (data ?? []).map((c) => this.shape(c as ConversationRow, user));
  }

  /**
   * Returns the conversation for a job, creating it on first open. Only the
   * job's client or its assigned provider may open it.
   */
  async openForJob(user: Profile, jobId: string) {
    const { data: job, error: jobError } = await this.supabase.admin
      .from('jobs')
      .select('id, client_id, assigned_provider_id')
      .eq('id', jobId)
      .maybeSingle();
    if (jobError) throw new BadRequestException(jobError.message);
    if (!job) throw new NotFoundException('Job not found');
    if (!job.assigned_provider_id) {
      throw new BadRequestException(
        'A conversation opens once the job has an assigned provider',
      );
    }
    const isClient = job.client_id === user.id;
    const isProvider = job.assigned_provider_id === user.id;
    if (!isClient && !isProvider) {
      throw new ForbiddenException('You are not a participant of this job');
    }

    const existing = await this.supabase.admin
      .from('conversations')
      .select(CONVERSATION_SELECT)
      .eq('job_id', jobId)
      .maybeSingle();
    if (existing.data)
      return this.shape(existing.data as ConversationRow, user);

    const { data: created, error: createError } = await this.supabase.admin
      .from('conversations')
      .insert({
        job_id: jobId,
        client_id: job.client_id,
        provider_id: job.assigned_provider_id,
      })
      .select(CONVERSATION_SELECT)
      .single();
    if (createError) throw new BadRequestException(createError.message);
    return this.shape(created as ConversationRow, user);
  }

  async getMessages(user: Profile, conversationId: string) {
    await this.assertParticipant(user, conversationId);
    const { data, error } = await this.supabase.admin
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  /**
   * Live message feed for one conversation, as Server-Sent Events.
   *
   * The transport is SSE rather than Supabase Realtime because of a rule the
   * app holds to: the device talks to this API and nothing else (mobile/README
   * — "Every network call goes through src/lib/api.ts"). Realtime would mean
   * shipping Supabase credentials to the client and giving it a second, RLS-
   * governed path to the same rows.
   *
   * Underneath it is still polling — just moved off the device, where it cost a
   * screen-wake and a cold-start-prone round trip per tick, to a `created_at >
   * cursor` query on an already-warm connection. Consumers see push semantics.
   *
   * Participation is checked once, before the stream opens. That is sufficient:
   * a conversation's participants are fixed at creation and only ever grow
   * stale in the direction of the job ending, and the guard has already
   * authenticated the token behind this request.
   */
  streamMessages(
    user: Profile,
    conversationId: string,
    since?: string,
  ): Observable<MessageEvent> {
    return from(this.assertParticipant(user, conversationId)).pipe(
      switchMap(() => {
        // Anything created at or before the client's last known message is
        // already on screen. Absent a cursor, start from "now" — the app has
        // just fetched the backlog through GET /messages.
        let cursor = since ?? new Date().toISOString();

        return interval(STREAM_POLL_MS).pipe(
          concatMap(async (): Promise<MessageEvent[]> => {
            const { data, error } = await this.supabase.admin
              .from('messages')
              .select('*')
              .eq('conversation_id', conversationId)
              .gt('created_at', cursor)
              .order('created_at', { ascending: true })
              .limit(STREAM_BATCH);
            // A transient DB error must not tear the connection down; the next
            // tick retries from the same cursor.
            if (error) return [];

            const rows = (data ?? []) as { created_at: string }[];
            if (rows.length === 0) {
              // A comment-only event keeps proxies (Render's included) from
              // closing a connection they consider idle.
              return [{ type: 'ping', data: {} }];
            }

            cursor = rows[rows.length - 1].created_at;
            return rows.map((row) => ({ type: 'message', data: row }));
          }),
          mergeMap((events) => events),
        );
      }),
    );
  }

  async sendMessage(user: Profile, conversationId: string, body: string) {
    await this.assertParticipant(user, conversationId);
    const { data, error } = await this.supabase.admin
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        body,
      })
      .select('*')
      .single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  /** Marks messages sent by the other participant as read. */
  async markRead(user: Profile, conversationId: string) {
    await this.assertParticipant(user, conversationId);
    await this.supabase.admin
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .neq('sender_id', user.id)
      .is('read_at', null);
    return { success: true };
  }

  private async assertParticipant(user: Profile, conversationId: string) {
    const { data, error } = await this.supabase.admin
      .from('conversations')
      .select('id, client_id, provider_id')
      .eq('id', conversationId)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Conversation not found');
    if (data.client_id !== user.id && data.provider_id !== user.id) {
      throw new ForbiddenException('You are not a participant of this chat');
    }
    return data;
  }

  /** Flatten to the counterpart the caller is talking to, for easy UI rendering. */
  private shape(c: ConversationRow, user: Profile) {
    const isClient = c.client_id === user.id;
    const counterpart = isClient ? c.provider : c.client;
    return {
      id: c.id,
      job_id: c.job_id,
      job_title: c.jobs?.title ?? null,
      job_status: c.jobs?.status ?? null,
      counterpart_name: counterpart?.full_name ?? null,
      counterpart_avatar_url: counterpart?.avatar_url ?? null,
      last_message_at: c.last_message_at,
      created_at: c.created_at,
    };
  }
}
