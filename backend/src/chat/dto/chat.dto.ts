import { IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class OpenConversationDto {
  @IsUUID()
  job_id!: string;
}

export class SendMessageDto {
  @IsOptional()
  @IsString()
  @Length(0, 1000)
  body?: string;

  @IsOptional()
  @IsString()
  attachment_path?: string;
}
