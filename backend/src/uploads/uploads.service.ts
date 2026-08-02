import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateSignedUploadDto } from './dto/uploads.dto';
import {
  CONTENT_TYPE_EXTENSIONS,
  SIGNED_DOWNLOAD_TTL_SECONDS,
  VERIFICATION_DOCS_BUCKET,
  type UploadBucket,
} from './uploads.constants';
import type { Profile } from '../common/types';

@Injectable()
export class UploadsService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Issue a short-lived signed upload URL so the device uploads straight to
   * Storage. We deliberately do not proxy the bytes: the API runs on Render's
   * free tier, which cold-starts for 30–60s and would have to buffer every image.
   *
   * The object path is generated here and always prefixed with the caller's
   * profile id — a client-supplied path would let one user overwrite another's
   * verification documents.
   */
  async createSignedUpload(user: Profile, dto: CreateSignedUploadDto) {
    if (dto.bucket === VERIFICATION_DOCS_BUCKET && user.role !== 'provider') {
      throw new ForbiddenException(
        'Only providers can upload verification documents',
      );
    }

    const ext = CONTENT_TYPE_EXTENSIONS[dto.content_type];
    const path = `${user.id}/${randomUUID()}.${ext}`;

    const { data, error } = await this.supabase.admin.storage
      .from(dto.bucket)
      .createSignedUploadUrl(path);
    if (error) throw new BadRequestException(error.message);

    return {
      bucket: dto.bucket,
      path: data.path,
      upload_url: data.signedUrl,
      token: data.token,
    };
  }

  /**
   * Guard against a caller referencing an object they never uploaded. Paths are
   * always `<profile id>/<uuid>.<ext>`, so ownership is a prefix check.
   */
  assertOwnedPaths(user: Profile, paths: string[]) {
    const foreign = paths.filter((p) => !p.startsWith(`${user.id}/`));
    if (foreign.length > 0) {
      throw new BadRequestException(
        'Upload path does not belong to the current user',
      );
    }
  }

  /** Public URL for an object in a public bucket (job photos). */
  publicUrl(bucket: UploadBucket, path: string): string {
    return this.supabase.admin.storage.from(bucket).getPublicUrl(path).data
      .publicUrl;
  }

  /**
   * Short-lived download URL for an object in a private bucket. Returns null
   * rather than throwing so one unreadable document can't break an admin list.
   */
  async signedDownloadUrl(
    bucket: UploadBucket,
    path: string,
  ): Promise<string | null> {
    const { data, error } = await this.supabase.admin.storage
      .from(bucket)
      .createSignedUrl(path, SIGNED_DOWNLOAD_TTL_SECONDS);
    return error ? null : data.signedUrl;
  }
}
