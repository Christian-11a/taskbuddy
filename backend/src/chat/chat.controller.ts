import {
  Body,
  Controller,
  Get,
  MessageEvent,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ChatService } from './chat.service';
import { OpenConversationDto, SendMessageDto } from './dto/chat.dto';
import type { Profile } from '../common/types';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get()
  list(@CurrentUser() user: Profile) {
    return this.chatService.listConversations(user);
  }

  @Post()
  open(@CurrentUser() user: Profile, @Body() dto: OpenConversationDto) {
    return this.chatService.openForJob(user, dto.job_id);
  }

  @Get(':id/messages')
  messages(
    @CurrentUser() user: Profile,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.chatService.getMessages(user, id);
  }

  @Post(':id/messages')
  send(
    @CurrentUser() user: Profile,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.chatService.sendMessage(user, id, dto.body);
  }

  /**
   * Live message feed (SSE). Emits `message` events carrying a full message
   * row, plus periodic `ping` events that keep the connection from being
   * reaped as idle.
   *
   * `since` is the created_at of the newest message the client already has —
   * normally the last row from GET /messages. Omitting it streams only what
   * arrives from now on.
   *
   * Authenticated by the usual Authorization header, so a browser's built-in
   * EventSource cannot open it; the app uses a client that sends headers.
   */
  @Sse(':id/stream')
  stream(
    @CurrentUser() user: Profile,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('since') since?: string,
  ): Observable<MessageEvent> {
    return this.chatService.streamMessages(user, id, since);
  }

  @Post(':id/read')
  read(@CurrentUser() user: Profile, @Param('id', ParseUUIDPipe) id: string) {
    return this.chatService.markRead(user, id);
  }
}
