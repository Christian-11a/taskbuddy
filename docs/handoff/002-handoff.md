# Handoff 002 — Slice 2: counterpart photos everywhere + backend handoff

Date: 2026-10-20

## Status
- Slices 1 and 2 are complete. Slices 3 and 4 are not started.
- Branch: `feat/oct20-feedback`. Not pushed.
- Last code commit: `635a54ea` (backend handoff doc). `bf198fbb` is the photos commit. The handoff commit follows.
- Plan: `C:\Users\morad\.claude\plans\pasted-content-id-c71d-1-on-abstract-hopper.md`

## What changed
- `mobile/src/components/ui/Avatar.tsx` (new): another person's photo in an avatar circle; falls back to the silhouette (or a custom `fallback`) with no url or on load error, and retries when the url changes.
- `mobile/src/components/ui/__tests__/Avatar.test.tsx` (new): 5 tests.
- `mobile/app/(homeowner)/screens/HOProviderProfileScreen.tsx`: provider photo and reviewer photos use `Avatar`; `reviewAvatar` gets `overflow: 'hidden'`.
- `mobile/app/(homeowner)/screens/HOJobApplicationsScreen.tsx`: proposal card shows the provider photo.
- `mobile/app/(homeowner)/screens/HOHomeScreen.tsx`: attention-row avatars show the photo, initials as the fallback; `overflow: 'hidden'`.
- `mobile/app/(homeowner)/screens/HOLeaveReviewScreen.tsx`: reads `job?.assigned_provider?.avatar_url` (silhouette until the backend change ships).
- `mobile/src/components/ChatThread.tsx`: new `counterpartAvatarUrl` prop drives the header avatar.
- `mobile/app/(homeowner)/screens/HOChatScreen.tsx`, `mobile/app/(provider)/screens/SPChatScreen.tsx`: pass `conversation?.counterpart_avatar_url`.
- `mobile/src/lib/api.ts`: `Job.assigned_provider` gains `avatar_url?`.
- Tests added in `HOJobApplicationsScreen.test.tsx`, `HOProviderProfileScreen.test.tsx`, `ChatThread.test.tsx` (each now mocks `expo-image`).
- `mobile/README.md`: "Counterpart avatars" row and the deferred bullet marked done; backend pointer added under "Remaining Backend Work".
- `docs/backend-handoff-avatars-2026-10-20.md` (new), copied verbatim to `C:\Users\morad\Downloads\`.

## Verification
Run from `mobile/`:
- `npx jest src/components/ui/__tests__/Avatar.test.tsx`: failed before `Avatar.tsx` existed (module not found), then `Tests: 5 passed, 5 total`.
- ChatThread new header test failed before the prop existed; then `npx jest HOJobApplicationsScreen HOProviderProfileScreen ChatThread.test HOHomeScreen HOChatScreen SPChatScreen HOLeaveReview`: `Test Suites: 8 passed, 8 total`, `Tests: 185 passed, 185 total`.
- `npm run typecheck`: 0 errors.
- `npm test`, run 1: `Test Suites: 1 failed, 200 passed, 201 total`, `Tests: 2 failed, 3158 passed, 3160 total`. Both failures were in `HOHomeScreen.test.tsx` ("hero placeholder … is absent for an account with no job that can make a hero" and "a failed refresh keeps the saved jobs…"). These are not the baseline's 3 tests from `main`. The file passed alone twice (`Tests: 41 passed`).
- `npm test`, run 2 (final): `Test Suites: 201 passed, 201 total`, `Tests: 3160 passed, 3160 total`. Strict gate met.

## Decisions made
- **`api.ts` second edit skipped.** The plan said to add `avatar_url` to `client?: { full_name }` "in the review type, around line 718". That line is in the `Booking` interface, not a review type. Reviews come back as `unknown[]` and the profile screen types them locally, so no type change was needed. I applied it, saw it was `Booking`, and reverted it. Only the `Job.assigned_provider` type changed.
- **HOHomeScreen load flake.** Two timing-sensitive HOHomeScreen tests failed in the first full run and passed in isolation and in the second full run. `HOHomeScreen.tsx` changed (attention avatars), so a real regression is possible but unlikely given three clean runs of the file. If either fails again in Slice 3 or 4, treat it as new and look at the attention avatar change first.
- No new HOHomeScreen test for the attention avatar photo; the plan did not specify one.
- The README backend pointer went in the photos commit, a commit before the doc it links to. Both are on the branch together.

## Next
Slice 3: urgency step shows pickup speed and Premium perks. First task: Task 3.1, new `mobile/src/lib/urgencyInfo.ts` and `mobile/src/lib/__tests__/urgencyInfo.test.ts`.

## Open items / backend
- Backend: `docs/backend-handoff-avatars-2026-10-20.md` (copy in `C:\Users\morad\Downloads\`). One change: add `avatar_url` to the `assigned_provider` embed in `JOB_SELECT`. Leave-a-review shows the silhouette until it ships.
- Slice 4's push commit body must mention this doc.
- Nothing is pushed. Slice 4 asks before pushing.
