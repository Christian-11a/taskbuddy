# Backend handoff: `assigned_provider.avatar_url` on the job payload (2026-10-20)

## Ask

In `backend/src/jobs/jobs.service.ts` (line ~68, `JOB_SELECT`), add `avatar_url` to the `assigned_provider` embed:

```diff
-  '*, service_categories(name), assigned_provider:profiles!jobs_assigned_provider_id_fkey(id, full_name), job_tasks(...), reviews(...)';
+  '*, service_categories(name), assigned_provider:profiles!jobs_assigned_provider_id_fkey(id, full_name, avatar_url), job_tasks(...), reviews(...)';
```

Only the `assigned_provider` part changes. Leave the rest of the string as it is.

## Why

The client's Leave-a-review screen shows the hired provider's photo. It reads `job.assigned_provider`, and that embed has no `avatar_url`, so the screen can only draw the silhouette. Every other payload the mobile app uses already carries `avatar_url` (applications, `GET /providers/:id`, provider reviews, conversations), and those screens now show the photo.

Mobile is already done. `HOLeaveReviewScreen` reads `job?.assigned_provider?.avatar_url`, and `Job.assigned_provider` is typed `{ full_name: string; avatar_url?: string | null }`. The photo appears as soon as this ships. Nothing needs to change on the app side.

## Test spec

In `backend/src/jobs/jobs.service.spec.ts`:

1. The `JOB_SELECT` string passed to the Supabase `select` includes `avatar_url` inside the `assigned_provider:profiles!jobs_assigned_provider_id_fkey(...)` embed, for example by asserting it matches `/assigned_provider:profiles!jobs_assigned_provider_id_fkey\([^)]*avatar_url[^)]*\)/`.
2. `GET /jobs/:id` returns `assigned_provider.avatar_url` when the hired provider has one.
3. `GET /jobs/:id` returns `assigned_provider.avatar_url: null` when the provider has no photo, and `assigned_provider: null` when nobody is hired.

Write the tests first and see them fail, then change the select.

## Scope

- **No migration.** `profiles.avatar_url` already exists.
- **No contract break.** The field is additive. The mobile app treats it as optional.
- `avatar_url` is already public. It is returned the same way on the other payloads listed above, so there is no new exposure.

## Already fine, no backend work

- **Optional proposal message.** `ApplyDto.cover_message` is already optional. The mobile 20-character minimum was removed.
- **`+63` GCash and Maya numbers.** Mobile converts to the `09…` form before sending, so the payout contract is unchanged.
- **`+63` profile phone.** Mobile stores the `09…` form, which `profiles.dto.ts` (`^09\d{9}$`) requires.
