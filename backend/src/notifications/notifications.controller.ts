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
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(50);
    if (unread === 'true') builder = builder.is('read_at', null);
    const { data, error } = await builder;
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
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
      .is('read_at', null);
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
    return data as { notifications: unknown[]; unreadCount: number };
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
      .is('read_at', null);
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
    const { error } = await this.supabase.admin
      .from('notifications')
      .delete()
      .eq('id', id)
      .eq('recipient_id', user.id);
    if (error) throw new BadRequestException(error.message);
  }

  /** Clears the caller's whole notification list. */
  @Delete()
  @HttpCode(204)
  async removeAll(@CurrentUser() user: Profile) {
    const { error } = await this.supabase.admin
      .from('notifications')
      .delete()
      .eq('recipient_id', user.id);
    if (error) throw new BadRequestException(error.message);
  }
}
