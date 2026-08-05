/**
 * Storage buckets the API will issue upload URLs for.
 *
 * - `job-photos`        — public read; referenced by jobs.photo_urls (migration 0007).
 * - `verification-docs` — PRIVATE; referenced by provider_verifications (migration 0008).
 *   Never build a public URL for this bucket — admins read it through short-lived
 *   signed download URLs instead.
 * - `avatars`           — public read; referenced by profiles.avatar_url (migration 0011).
 */
export const UPLOAD_BUCKETS = [
  'job-photos',
  'verification-docs',
  'avatars',
] as const;
export type UploadBucket = (typeof UPLOAD_BUCKETS)[number];

export const JOB_PHOTOS_BUCKET: UploadBucket = 'job-photos';
export const VERIFICATION_DOCS_BUCKET: UploadBucket = 'verification-docs';
export const AVATARS_BUCKET: UploadBucket = 'avatars';

/** Images only — these are job photos and ID/selfie captures. */
export const UPLOAD_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** How long an admin's signed download URL for a verification document stays valid. */
export const SIGNED_DOWNLOAD_TTL_SECONDS = 300;
