import { Observable, timer, exhaustMap } from 'rxjs';
import {
  BadRequestException,
  Sse,
  MessageEvent,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SupabaseService } from '../supabase/supabase.service';
import type { Profile } from '../common/types';
import { ListNotificationsPageDto } from './dto/notifications.dto';
import { withTarget } from './notification-target';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly supabase: SupabaseService) {}

  @Get()
  async list(@CurrentUser() user: Profile, @Query('unread') unread?: string) {
    let builder = this.supabase.admin
      .from('notifications')
      .select('*')
      .eq('recipient_id', user.id)
      .is('dismissed_at', null)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(50);
    if (unread === 'true') builder = builder.is('read_at', null);
    const { data, error } = await builder;
    if (error) throw new BadRequestException(error.message);
    return (data ?? []).map(withTarget);
  }

  @Get('page')
  async page(
    @CurrentUser() user: Profile,
    @Query() query: ListNotificationsPageDto,
  ) {
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;
    const [page, unread] = await Promise.all([
      this.supabase.admin
        .from('notifications')
        .select('*', { count: 'exact' })
        .eq('recipient_id', user.id)
        .is('dismissed_at', null)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(offset, offset + limit - 1),
      this.supabase.admin
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', user.id)
        .is('read_at', null)
        .is('dismissed_at', null),
    ]);
    if (page.error) throw new BadRequestException(page.error.message);
    if (unread.error) throw new BadRequestException(unread.error.message);
    return {
      items: (page.data ?? []).map(withTarget),
      total: page.count ?? 0,
      unread_total: unread.count ?? 0,
    };
  }

  /**
   * Badge count. `GET /notifications` is capped at 50, so counting its result
   * silently caps the badge at 50 too — this counts server-side instead.
   */
  @Get('unread-count')
  async unreadCount(@CurrentUser() user: Profile) {
    const { count, error } = await this.supabase.admin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', user.id)
      .is('read_at', null)
      .is('dismissed_at', null);
    if (error) throw new BadRequestException(error.message);
    return { count: count ?? 0 };
  }

  @Get('snapshot')
  async snapshot(@CurrentUser() user: Profile) {
    const { data, error } = await this.supabase.admin.rpc(
      'notification_snapshot',
      { p_recipient: user.id },
    );
    if (error) throw new BadRequestException(error.message);
    const snapshot = data as {
      notifications: { type?: unknown; data?: unknown }[];
      unreadCount: number;
    };
    return {
      ...snapshot,
      notifications: (snapshot.notifications ?? []).map(withTarget),
    };
  }

  /** One consistent snapshot every five seconds per foreground session. */
  @Sse('stream')
  stream(@CurrentUser() user: Profile): Observable<MessageEvent> {
    let previous = '';
    return timer(0, 5000).pipe(
      exhaustMap(async () => {
        const snapshot = await this.snapshot(user);
        const serialized = JSON.stringify(snapshot);
        if (serialized === previous) return { type: 'ping', data: {} };
        previous = serialized;
        return { type: 'message', data: snapshot };
      }),
    );
  }

  @Post(':id/read')
  async markRead(
    @CurrentUser() user: Profile,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const { data, error } = await this.supabase.admin
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      .eq('recipient_id', user.id)
      .is('read_at', null)
      .is('dismissed_at', null)
      .select()
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    return data ?? { success: true };
  }

  @Post('read-all')
  async markAllRead(@CurrentUser() user: Profile) {
    const { error } = await this.supabase.admin
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('recipient_id', user.id)
      .is('read_at', null)
      .is('dismissed_at', null);
    if (error) throw new BadRequestException(error.message);
    return { success: true };
  }

  /** Removes one of the caller's own notifications. Idempotent. */
  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: Profile,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const { error: dismissError } = await this.supabase.admin
      .from('notifications')
      .update({ dismissed_at: new Date().toISOString() })
      .eq('id', id)
      .eq('recipient_id', user.id)
      .or('type.eq.admin_alert,broadcast_id.not.is.null');
    if (dismissError) throw new BadRequestException(dismissError.message);
    const { error } = await this.supabase.admin
      .from('notifications')
      .delete()
      .eq('id', id)
      .eq('recipient_id', user.id)
      .neq('type', 'admin_alert')
      .is('broadcast_id', null);
    if (error) throw new BadRequestException(error.message);
  }

  /** Clears the caller's whole notification list. */
  @Delete()
  @HttpCode(204)
  async removeAll(@CurrentUser() user: Profile) {
    const { error: dismissError } = await this.supabase.admin
      .from('notifications')
      .update({ dismissed_at: new Date().toISOString() })
      .eq('recipient_id', user.id)
      .or('type.eq.admin_alert,broadcast_id.not.is.null')
      .is('dismissed_at', null);
    if (dismissError) throw new BadRequestException(dismissError.message);
    const { error } = await this.supabase.admin
      .from('notifications')
      .delete()
      .eq('recipient_id', user.id)
      .neq('type', 'admin_alert')
      .is('broadcast_id', null);
    if (error) throw new BadRequestException(error.message);
  }
}
