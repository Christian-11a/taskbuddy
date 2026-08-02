import { IsIn } from 'class-validator';
import type { UploadBucket } from '../uploads.constants';
import { UPLOAD_BUCKETS, UPLOAD_CONTENT_TYPES } from '../uploads.constants';

export class CreateSignedUploadDto {
  @IsIn(UPLOAD_BUCKETS)
  bucket!: UploadBucket;

  @IsIn(UPLOAD_CONTENT_TYPES)
  content_type!: (typeof UPLOAD_CONTENT_TYPES)[number];
}
