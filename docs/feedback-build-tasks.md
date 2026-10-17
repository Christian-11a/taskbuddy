# Feedback round: build task specs (mobile, backend, admin)

Read with `docs/feedback-round-plan.md` (the why and the order). This file is the how.
Status: specs written 2026-10-17 against team `main` at `57a30e7` (live API is the same commit). Nothing built.
Owner decision: we build every part here (mobile, backend leftovers, admin, then promo site).

## Rules for every task

- Work only in the files listed. If another file seems to need a change, stop and report it.
- One worker per file set at a time. "Parallel OK" means separate files.
- Never commit, push, or sync a fork. The orchestrator reports; the owner approves each commit.
- User-visible wording: "client" and "provider"; the app's own screens say "proposals". Internal names
  (`homeowner`, `HO*`, `SP*`, role values) stay.
- Never mention a warranty in new text. Release happens when the client confirms the job is done.
- Report in under 15 lines: files changed, checks run and their results, anything unsure or skipped.
- Mobile checks (from `mobile/`): `npx tsc --noEmit`, `npx jest <changed suites>`. `HOHomeScreen.test.tsx` already
  hangs on `main`; do not count it. Orchestrator checks visual changes on the emulator.
- Backend checks (from `backend/`): `npm test`, `npm run test:sql` if SQL changed, `npx tsc --noEmit`.
- Web checks (from `web/`): `npm run lint`, `npm test`, `npm run build`; admin preview at 1440 px and 390 px.

## S0. Setup: one session per part, each in its own folder

Three orchestrator sessions, each with its own git worktree and branch, so they never share a checkout:

| Session | Folder (git worktree) | Branch (from synced `main`) | Tasks |
|---|---|---|---|
| Mobile | `D:\THESIS - TASKBUDDY\taskbuddy-mobile` | `feedback/mobile` | M1–M12, B1 |
| Admin | `D:\THESIS - TASKBUDDY\taskbuddy-admin` | `feedback/admin` | B2, A1–A9 |
| Promo | `D:\THESIS - TASKBUDDY\taskbuddy` (current folder) | `promo/align-mobile` | T7, T8 (last) |

Steps, done once by the first session that starts (owner approves each):
1. Commit the finished promo work (T1–T6) on `promo/align-mobile` in the current folder.
2. Owner syncs the fork with team `main`.
3. `git fetch`, then `git worktree add ../taskbuddy-mobile -b feedback/mobile origin/main` and
   `git worktree add ../taskbuddy-admin -b feedback/admin origin/main`. Run `npm ci` in each folder's
   `mobile/` or `web/` (and `backend/` for B1/B2) before the first worker.
4. Mobile session only: the emulator. Run Metro from `taskbuddy-mobile/mobile` on port 8081 and reuse the
   installed dev client. `taskbuddy-team-main` (port 8082) is a view-only copy; stop it when building starts.
5. Admin session previews the admin on its own dev server port (not 3000 if the promo session runs one).
6. Test accounts: the owner signs in. Accepting Terms v3 on a test account needs the owner's OK.

Owner decision 2026-10-17: one side at a time. Mobile first; create only the `taskbuddy-mobile` worktree now.
The admin worktree is created when the Admin session starts (from the then-current synced `main`).

Cross-session order (if ever run in parallel): Mobile and Admin can run at the same time. A4 waits for B2 (same session, fine).
Promo starts after Mobile is merged and deployed (final screens). Merge order into `main` via PRs, owner approves:
admin and mobile first (either order; they touch different folders), then promo after merging `main` into it.

---

## Part 1: Mobile (`mobile/`)

### M1. Urgent hint · Haiku, low · parallel OK
File: `app/(homeowner)/screens/HOCreateJobScreen.tsx` (~line 1244), `src/components/post/__tests__/UrgencyRow.test.tsx`
if it asserts the text. Change the Urgent blurb "You need someone today" → "As soon as possible".
Also check Flexible / Normal blurbs still read well next to it. No other change.

### M2. Service radius 1–50 km · Haiku, medium · parallel OK
File: `app/(provider)/screens/SPEditProfileScreen.tsx` (`radius` state, `service_radius_km`).
Replace the free number field with a stepper (− / value km / +) bounded 1–50, step 1, long-press steps by 5,
default 15 when empty. Typing stays possible but clamps on blur, with an inline message "Choose 1 to 50 km".
Server already rejects outside 1–50; show its message if it still happens. Add or update the screen test.

### M3. Notification routing by `target` · Sonnet, medium · after M7 and M8 are merged into the branch
Files: `src/lib/notificationRouting.ts`, `src/lib/pushNotifications.ts`, `App.tsx` (push tap handling ~line 439),
`app/(homeowner)/screens/HONotificationsScreen.tsx`, `app/(provider)/screens/SPNotificationsScreen.tsx`,
`src/lib/api.ts` (notification type), tests in `src/lib/__tests__/`.
Backend sends `target: { screen, job_id?, request_id? }` on every notification row and push
(`backend/src/notifications/notification-target.ts`; screens: `job`, `dispute`, `payouts`, `verification`,
`skill_requests`, `notifications`). Check whether the push payload carries it under `data.target`
(`backend/src/push/push.scheduler.ts`).
- `resolveNotificationTarget` reads `target` first and maps it per role:
  `job` → job detail; `dispute` → the case screen (client: dispute status; provider: job detail case section);
  `payouts` → provider Payout account (client: job detail if `job_id`, else Notifications);
  `verification` → provider Get verified; `skill_requests` → provider My services;
  `notifications` → stay on Notifications. Keep the old `data`-based rules as the fallback for old rows.
- Chat is no longer in Notifications (PR #91); keep the `chat` kind only for push taps on Messages pushes.
Tests: one case per screen per role, plus the fallback.

### M4. Task checklist after hire and checkbox alignment · Haiku, medium · emulator check first
Files: `app/(homeowner)/screens/HOJobDetailScreen.tsx`, `app/(provider)/screens/SPJobDetailScreen.tsx`,
`src/components/TaskProofSheet.tsx`, and the task row component they share (find it; do not create a second one).
First the orchestrator looks at a hired job on the emulator and notes what exists (ticking with proof photos
exists since #91). Then:
- Each task row: a real checkbox (24 dp box, fixed width), task text, row `flexDirection: 'row'`,
  `alignItems: 'center'`, gap 12, text wraps without moving the box.
- Provider: can tick only while the job is `in_progress`; ticking opens the proof-photo sheet (1–4 photos).
- Client: read-only checkboxes with "Done" state and the proof photos under each task.
Screenshot before and after for the orchestrator.

### M5. Camera for proof photos · Haiku, high · parallel OK
File: `src/components/EvidencePhotoPicker.tsx` (+ its test). Used by task proof (`TaskProofSheet.tsx`) and
complaints (`HODisputeFilingScreen.tsx`, `HODisputeStatusScreen.tsx`).
- Two buttons: "Take photo" (`ImagePicker.launchCameraAsync`, after `requestCameraPermissionsAsync`) and
  "Choose from gallery" (current behaviour). Keep `max`, thumbnails and remove.
- Permission denied: inline message with a "Open settings" link (`Linking.openSettings`); gallery still works.
- Always upload JPEG: set `quality: 0.8` and convert HEIC/HEIF (check `asset.mimeType`/extension) with
  `expo-image-manipulator` if installed; if it is not installed, stop and report rather than adding a package.
- `app.json` already has the camera usage string; do not change native config.

### M6. Whole chat attached to appeals · Haiku, medium · parallel OK
Files: `app/(homeowner)/screens/HODisputeStatusScreen.tsx` (~line 81, ~106), `src/lib/api.ts`
(`addDisputeEntry`, `respondToCancellation`), tests.
Remove the message picker and the selected-message state. Show one line under the statement box:
"Your full chat with the other party is attached." Stop sending `message_id` (leave it optional in the api type
for now; the backend still accepts it). Same for the cancellation response if it has a picker.

### M7. Payout account before proposing · Sonnet, medium
Files: `src/lib/providerSetup.ts`, the provider Home setup card (find where `providerSetup` is used),
`app/(provider)/screens/SPJobDetailScreen.tsx`, `src/components/ProposalModal.tsx`,
`app/(provider)/screens/SPPayoutAccountScreen.tsx`, `src/lib/tourContent.ts` (finish card checklist), tests.
- Setup steps become: address, bio, get verified, **link payout account**. The setup card and the tour finish
  card show the new step after verification, with a button to Payout account.
- On a job: if there is no payout account, the Propose button is replaced by a note
  "Link a GCash, Maya or bank account to send proposals" and a "Link payout account" button.
- If the server still answers 403 `payout_account_required`, show the same note (not a generic error).
- Where the app learns whether an account exists: `GET /payouts/account` (already used by the payout screen).

### M8. Disputed status · Sonnet, medium
Files: `src/lib/api.ts` (add `display_status?: string` to Job), `src/lib/jobRowStatus.ts`, `src/lib/jobDetailView.ts`,
`src/lib/providerJobView.ts`, `src/lib/myJobsList.ts`, `src/lib/myWork.ts`, tests.
- Badges and filters read `display_status ?? status`. New "Disputed" style (warning colours from the palette).
- While disputed: hide complete, cancel and release actions; show a banner "A complaint is open. An admin is
  reviewing it." linking to the case.
- My Jobs / My Work: disputed jobs stay in their current tab with the badge (no new tab).

### M9. Payout history labels · Haiku, low · parallel OK
File: `app/(provider)/screens/SPPayoutAccountScreen.tsx` (~line 89). Rows show Sent / Pending / Failed with
the matching colour and the job title. No withdraw button anywhere (already gone; confirm).

### M10. Price error message · Haiku, low · parallel OK
File: `app/(homeowner)/screens/HOCreateJobScreen.tsx` (~line 306, ~1073).
Keep "Try again". Choose the message by error: no response → "Couldn't reach TaskBuddy. Check your connection
and try again."; server error (has a status) → "Prices aren't available right now. Please try again in a moment."

### M11. Warranty leftovers · Haiku, medium · after M8 (same files)
Files: `src/lib/heldMoney.ts`, `src/lib/jobDetailView.ts` (~71, 77, 195–203), `src/lib/providerJobView.ts`
(~112–135, 238–240), `app/(provider)/screens/SPJobDetailScreen.tsx` (~156), tests.
Release now happens on completion; complaints must be raised before confirming.
- Completed jobs: never held, no "Warranty until …" text, no Report action after completion.
- Keep reading `warranty_expires_at` only so old jobs do not crash; it no longer changes what is shown.

### M12. Bring back the useful post-UAT items · Sonnet, medium · last mobile task
The original branch was never pushed; redo from the owner-approved list:
1. Google sign-up as a client collects the three required consents (like provider details).
2. Full names sent in the server's accepted form (ask the backend validation in `backend/src/auth` for the rule).
3. Pull-to-refresh on HO Calendar, SP Calendar, HO Job Applications.
4. Notifications pull-to-refresh spinner stops after a failed pull.
5. Password rule matches the server: 8–72 characters with a letter and a digit (`src/lib/inputRules.ts`).
6. testID `terms-agree` on the terms "I agree" button; Maestro sign-up flows scroll the terms before agreeing.
7. Capacity-limit dialogs on Post a job, Send proposal and Hire when the server answers 409.
8. Layout: Home status bar overlapping when scrolled; greeting cut off at 1.3x font; Post a job "Next" touching
   the 3-button navigation bar. Orchestrator reproduces each on the emulator first.
Split into 2–3 workers by file set if large.

---

## Part 2: Backend (`backend/`)

### B1. Remove early release · Sonnet, medium · owner approved (goes with the warranty)
Files: `backend/src/jobs/jobs.controller.ts` (`release-requests` routes), `jobs.service.ts`, related DTOs, tests,
and a new migration that drops or disables the release-request objects added in `0046_early_payment_release.sql`
(check what it created first; prefer disabling over dropping data). Check Terms v3 (`mobile/src/lib/legalText.ts`)
for any "release early" wording and report it. Do not touch `escrow_settle` release-on-completion.
Deploy note: migration first, then API (owner or backend teammate runs it).

### B2. Disputed in admin bookings filter · Haiku, medium · parallel OK
Add `disputed` to `admin_list_bookings` (new migration) and its DTO / filter validation. Test.

---

## Part 3: Admin dashboard (`web/`, admin only)

### A1. Search limits · Haiku, medium · parallel OK
Pages: Users, Bookings, Service Requests, Transactions, Activity log, Audit log (`web/src/components/pages/*`).
`maxLength={100}` (Audit log 200) on each search input; show the API's 400 message under the box.

### A2. Notification links · Haiku, medium · parallel OK
File: `web/src/components/layout/NotificationsMenu.tsx` (+ test, + type in `web/src/lib/api/types.ts`).
Each row links from `target`: `job` → the booking; `dispute` → Disputes case; `verification` → Verifications;
`skill_requests` → Skill requests; `payouts` → Transactions; `notifications` → no link.

### A3. Disputes case view · Sonnet, medium
File: `web/src/components/pages/DisputesPage.tsx` (conversation already fetched ~line 180).
Show `chat.message_count` and the full transcript as "Attached chat"; show complaint photos (signed URLs) grouped
by sender, click to enlarge.

### A4. Disputed badge and filter · Haiku, medium · after B2
Files: `BookingsPage.tsx`, job views, `web/src/lib/api/types.ts`. `display_status` badge; "Disputed" filter option.

### A5. Remove warranty from admin · Haiku, medium
Files: `web/src/components/admin/WarrantyLine.tsx` (+ test), `web/src/lib/warranty.ts`, uses in
`BookingsPage.tsx`, `DisputesPage.tsx`, `TransactionsPage.tsx`, mock data in `app/dev/admin-preview/mockApi.ts`.
Remove the warranty line; completed = released (or held while a complaint is open).

### A6. Wallet-era pages · Sonnet, medium
Files: `web/src/app/admin/(admin)/withdrawals/*`, `WithdrawalsPage.tsx`, `TransactionsPage.tsx` and
`DisputesPage.tsx` (Issue Credit / recovery credit), `Sidebar.tsx`.
Withdrawals page → "Failed payouts" (only failed automatic payouts, retry if the API supports it), hidden from
the sidebar when empty. Remove Issue Credit / recovery-credit controls. Keep history readable.

### A7. Commission headline · Haiku, high · parallel OK
Files: `DashboardPage.tsx`, `PlatformPage.tsx` (commission tab), `web/src/lib/services/index.ts`, types.
Dashboard: first KPI "Total commission earned" (`totals.total_commission`), with this month and trend.
Commission tab: lead with `total_earned`, `earned_this_month`, `pending_estimate`, `released_jobs`, then the rate.

### A8. Credential review page · Sonnet, medium
New `web/src/app/admin/(admin)/credentials/page.tsx`, a page component modelled on `VerificationsPage.tsx`,
sidebar link "Credentials". List pending TESDA / PRC / trade certificates, open the file, approve or reject with a
note (`/admin/credentials` API from PR #90; read `backend/src/admin` for the routes).

### A9. Revenue from released payments · Sonnet, medium · after A7
Reports and Dashboard money figures come from released payments and commission, not wallet top-ups. Read the
admin analytics endpoints first; if the backend has no released-payments figure, stop and report.

---

## Run order

Mobile session: Batch 1 M1, M2, M5, M6, M9, M10 → Batch 2 M7, M8, B1 → Batch 3 M3, M11, M4 → Batch 4 M12.
Admin session: Batch 1 B2, A1, A2, A7 → Batch 2 A5, A3 → Batch 3 A4, A6 → Batch 4 A8, A9.
(Original combined order, for reference:)
1. S0.
2. Batch A (parallel, separate files): M1, M2, M5, M6, M9, M10, B2, A1, A2, A7.
3. Batch B: M7, M8, B1, A5.
4. Batch C: M3 (after M7, M8), M11 (after M8), M4 (after emulator check), A3, A4 (after B2), A6.
5. Batch D: M12, A8, A9.
6. Orchestrator: full checks, emulator pass of every mobile change, admin preview pass, report to the owner.
7. Owner: approves commits; backend teammate or owner deploys B1/B2 migrations then API; EAS preview build.
8. Then the promo site blocked work (T7, T8 in `docs/promo-build-tasks.md`).

## Decisions still needed (do not build until answered)

- **D2 Price ranges** (owner + adviser): keep three fixed options, or the stricter range model.
- **D3 Change-request screen:** schedule changes approved; price changes wait for D2.
- **D4 Sample portfolio examples** (adviser item): what the samples show and where (Portfolio empty state?).
