# Feedback round plan: mobile, admin dashboard, promo site

Status: PLAN ONLY (2026-10-17). Built against team `main` at `57a30e7` (live API is the same commit).
Source: the owner's 12-item technical-testing list, PR #93's to-do lists, the PR #90/#91 follow-ups and the
owner's decisions in this session.

Order: **1. Mobile → 2. Admin dashboard → 3. Promo site.** The admin can run in parallel with mobile (separate
files); the promo site goes last because its remaining work only waits for the final mobile screens.

Before any code: sync the owner's fork with team `main` and branch from it. The promo work already done
(T1–T6, uncommitted) was built on the older fork `main`; commit it first, then merge team `main` into it, so
`web/` changes from both sides meet once.

Rules (all parts): one writer per file set; no commits, pushes or fork syncs without the owner; every
behaviour change listed here was approved by the owner as part of this feedback round unless marked
"decision needed".

---

## Part 1: Mobile app (`mobile/`)

Backend for every item below is already live. Check each against the API on the emulator
(`D:\THESIS - TASKBUDDY\taskbuddy-team-main`, code server on port 8082).

| ID | Item (owner's list #) | Where | What to do | Model |
|---|---|---|---|---|
| M1 | Urgent hint (2) | `app/(homeowner)/screens/HOCreateJobScreen.tsx` ~1244, `UrgencyRow.test.tsx` | "You need someone today" → "As soon as possible". | Haiku low |
| M2 | Service radius (3) | `app/(provider)/screens/SPEditProfileScreen.tsx` (`service_radius_km`) | Stepper or slider bounded 1–50 km, default 15, inline error. | Haiku medium |
| M3 | Notification routing (4) | `src/lib/notificationRouting.ts`, `pushNotifications.ts`, both Notifications screens | Route by `target.screen` (`job`, `dispute`, `payouts`, `verification`, `skill_requests`, `notifications`) with `job_id` / `request_id`; fall back to Notifications. Push taps and list taps both. | Sonnet medium |
| M4 | Checklist after hire (5) and alignment (7) | `HOJobDetailScreen.tsx`, `SPJobDetailScreen.tsx` | Confirm on the emulator first (ticking with proof photos exists since #91). Then: real checkboxes; provider ticks while `in_progress`, client read-only; row layout `alignItems: 'center'`, fixed checkbox width, even gap. | Haiku medium |
| M5 | Camera for proof photos (6) | `src/components/EvidencePhotoPicker.tsx` (+ `app.json` camera string already exists) | Add "Take photo" (`launchCameraAsync`) beside the gallery; ask camera permission; upload JPEG, never HEIC. Covers task proof and complaints. | Haiku high |
| M6 | Whole chat in appeals (8) | `HODisputeStatusScreen.tsx`, `src/lib/api.ts` (`message_id`) | Remove the message picker; show "Your full chat is attached"; stop sending `message_id`. Same on the provider case screen if it has a picker. | Haiku medium |
| M7 | Payout account before proposing (9) | `SPPayoutAccountScreen.tsx`, `SPJobDetailScreen.tsx`, `ProposalModal.tsx`, provider Home setup card, `src/lib/providerSetup.ts` | Setup step "Link payout account" after verification; Propose disabled with a link to Payout account until linked; handle 403 `payout_account_required` with the same message. | Sonnet medium |
| M8 | Disputed status (10) | `src/lib/jobRowStatus.ts`, `jobDetailView.ts`, `providerJobView.ts`, job lists | Use `display_status` for badges and filters; "Disputed" style; hide complete / cancel / release actions while disputed; dispute banner on the job. | Sonnet medium |
| M9 | Payout history (11) | `SPPayoutAccountScreen.tsx` | Already shows payout rows; check states Sent / Pending / Failed are labelled. Probably a small copy pass only. | Haiku low |
| M10 | Price error message | `HOCreateJobScreen.tsx` ~306 | Different message when the server answers with an error (not "check your connection"). | Haiku low |
| M11 | Bring back from the unpushed post-UAT branch (owner approved) | various | Google client sign-up consents, server name format, pull-to-refresh (HO Calendar, SP Calendar, HO Job Applications), notification spinner stop, password rule 8–72 with letter and digit, terms "agree" testID, capacity-limit dialogs (server returns 409 now), the 7 layout fails. Redo on new `main`; do not merge the old branch. Needs that teammate's branch or handoff 008 list. | Sonnet medium |

Decision needed (owner and team, then adviser where noted):
- **D1 Early release removal.** Owner decided it goes with the warranty. Backend still has release requests
  (`/jobs/:id/release-requests`, migration 0046). No mobile UI exists for it in `main`. Backend removal + Terms v3
  wording check. Backend task, Sonnet medium, after owner confirms with the backend teammate.
- **D2 Price ranges.** Today: three fixed options. Proposed stricter model (range shown, providers propose within
  it, one price change per job within range, with reason and photo, before completion). Confirm with adviser.
  If yes: backend + mobile, Sonnet high.
- **D3 Change-request screen.** Backend exists (schedule or price tier, accept/decline, pay difference within 24 h).
  Owner approved schedule changes. Price changes wait for D2.
- **D4 Sample portfolio examples.** Adviser item, not built.

Checks: `npx tsc --noEmit`, jest (known: `HOHomeScreen.test.tsx` hangs on main), emulator pass of each changed
screen, then a new EAS preview build (owner runs it).

---

## Part 2: Admin dashboard (`web/src/app/admin/*`, `web/src/components/pages/*`)

| ID | Item (owner's list #) | Where | What to do | Model |
|---|---|---|---|---|
| A1 | Search inputs (1) | Users, Bookings, Service Requests, Transactions, Audit/Activity log pages | `maxLength` 100 (200 for audit), show the API's 400 message. | Haiku medium |
| A2 | Notifications (4) | admin notification inbox | Each row links from `target`. | Haiku medium |
| A3 | Disputes (8) | `DisputesPage.tsx` case view | Full transcript from `GET /admin/jobs/:jobId/conversation`, `chat.message_count`; complaint photos (signed URLs) grouped by sender (#90/#91 follow-up). | Sonnet medium |
| A4 | Disputed status (10) | Bookings and job views | `display_status` badge and "Disputed" filter. Backend follow-up: add `disputed` to `admin_list_bookings` filter. | Haiku medium |
| A5 | Withdrawals (11) | `withdrawals/`, `WithdrawalsPage.tsx`, recovery-credit / Issue Credit on the Wallet tab | Relabel as "Failed payouts" (legacy), hide when empty; retire recovery-credit and wallet-era controls. | Sonnet medium |
| A6 | Commission (12) | `DashboardPage.tsx`, `PlatformPage.tsx` commission card | Headline KPI "Total commission earned" (`totals.total_commission`, monthly, trend); commission page leads with `total_earned`, `earned_this_month`, `pending_estimate`, then the rate. | Haiku high |
| A7 | Credential review (#90 follow-up) | new `admin/(admin)/credentials` page + sidebar link | List pending TESDA / PRC / trade certificates, view file, approve / reject with note. Mirror the Verifications page. | Sonnet medium |
| A8 | Revenue from released payments (#90 follow-up) | Reports / Dashboard | Revenue figures from released payments, not wallet top-ups. | Sonnet medium |

Not needed on the web (the app is the only place tasks are ticked): PR #93's "proof upload input" and "service
radius input" unless the admin has such screens. "Read-only checklist" only if admins need it in the case view.

Checks: `npm run lint`, `npm test`, `npm run build`; admin preview at 1440 px and 390 px.

---

## Part 3: Promo site (last)

Already built (uncommitted, other session): T1–T6 in `docs/promo-build-tasks.md`.
Open items for the owner on that work: commit; "offers" vs "proposals" (app screens say "proposals");
the 4.46:1 grey text fix; view the public error page once.

Remaining after Parts 1 and 2: T7 (hero loop, main film, social image) and T8 (claims, hide web sign-in,
Terms v3 as the single source, new images, carousel as guide doorway, real guide screenshots and ElevenLabs
audio, "Get the app" link). Facts to use: `docs/promo-site-plan.md` sections 2b and 2c (release on completion,
no warranty, payout account before proposals, commission without a percentage).

---

## Who does what

Owner decides, per part, whether the team or this setup builds it. If this setup builds it: Opus writes the
task specs from this file, one orchestrator session runs Haiku / Sonnet workers as marked, and the owner
approves every commit.
