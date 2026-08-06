import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  controllers: [ChatController],
  providers: [ChatService],
  // AdminModule uses this for read-only access to a job's conversation.
  exports: [ChatService],
})
export class ChatModule {}
