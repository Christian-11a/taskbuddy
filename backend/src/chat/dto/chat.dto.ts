import {
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

/**
 * The exact shape `UploadsService.createSignedUpload` issues:
 * `<profile uuid>/<object uuid>.<jpg|png|webp>`. Anything else was not minted
 * by this API, so it is refused before the service ever looks it up.
 */
const ATTACHMENT_PATH_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/i;

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
  @MaxLength(100)
  @Matches(ATTACHMENT_PATH_PATTERN, {
    message:
      'attachment_path must be a path returned by POST /uploads/signed-url',
  })
  attachment_path?: string;
}
