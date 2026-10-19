# Guide videos: plan and progress (resume from here)

Owner decisions (2026-10-19): 17 guides, voice ElevenLabs "Rachelle – TV & Radio Commercials" (voice_id G3Il95iGz0lclzMySk7L), model eleven_v4, one take per guide.
Screens must mirror the app one to one (read the mobile code for every screen; reference PNGs in promo/guides/shots/raw).
Inspiration only: D:\Downloads\Guide Inspo (Tarsi guides): title card with mascot, "STEP n OF N" + headline + body beside one phone, progress bar, end card "Next guide". Length = whatever the task takes.
Guides teach (calm, every tap, exact button names); hero/carousel/film sell. Do not reuse their headlines.
Owner reviews all videos after waking up. Do not push. Commit locally only if useful; owner checks first.

## The 17 guides
Clients (Sky blue): c1 Create your account · c2 Your Home and My Jobs · c3 Post a job · c4 Compare proposals and hire · c5 Chat and change the date or time · c6 Confirm the job and leave a review · c7 Cancel a job or report a problem · c8 Payments, notifications and settings
Providers (navy): p1 Create your account · p2 Get verified · p3 Link your payout account · p4 Your Feed and availability · p5 Send a proposal · p6 Do the job · p7 Decline a booking or change the time · p8 Get paid · p9 Services, certificates and portfolio

## App facts found so far (for one-to-one screens)
- Confirm job is done opens ConfirmationModal "Mark this job complete?" / "This confirms the work is done to your satisfaction. Report any problem before you confirm." / "Yes, Mark Complete" / "Not Yet". (Hero and film skip this dialog.)
- Cancel: Job details ⋮ menu (MenuSheet) → "Cancel job" → ConfirmationModal "Cancel this job?" (message depends on state: open = "This takes the job down so providers can no longer apply. It cannot be undone."; hired = 48 h provider agree/contest text) / "Cancel Job" (red) / "Keep Job".
- Report a problem: screen "Report a problem", "What went wrong?" reasons: Payment or cancellation issue · Work not completed · Work quality issue · Participant did not arrive · Conduct issue · Other; "Tell us what happened" (placeholder "Give support enough detail to review the issue…"); "Photos (optional)"; "Send report" → confirm "Send this report?".
- Schedule change sheet: "Change date or time", "Current schedule", "New date", "New time", "Reason" ("Why do you need a different time?"), "Send request"; the other side sees ScheduleChangeCard with Accept / Decline (sender: Withdraw).
- Task proof: TaskProofSheet "Show the finished task", task chip, photo picker "Add 1 to 4 photos", "Add a photo to continue", "Mark as done".
- Hire: HirePaymentModal choose page → Continue → confirm page "You're paying ₱… to hire …" → "Confirm and hire · ₱…". Xendit page itself not shown.

## Status
- [x] Scripts for all 17 (promo/src/guides2/lessons.ts) — ids listed in LESSONS
- [x] Guide video composition (promo/src/guides2/GuideVideo.tsx), screens in screens.tsx + screens2.tsx
- [x] New screens built from the mobile code
- [x] Narration: 17 mp3s in public/guides/audio, timing json in public/guides/timing (scripts/guide-timing.py)
- [x] Rendered + reviewed: the 9 first guides. Render: `bash scripts/render-guide.sh <id>` -> out/guides/final/<id>.mp4/.jpg, review sheet out/guides/review/<id>.png
- [ ] Render + review the 8 added guides (started 2026-10-19 early morning)
- [x] web carousel lessonTitle values updated; HomePage.story.test no longer requires the carousel to cover every guide
- [ ] Render 720p, review frame by frame, compress, copy to web/public/guide/, update web/src/components/pages/guideLessons.ts (17 entries, real durations)

## Narration sessions (ElevenLabs flow v6YTOOb2cld6NWebwged; fetch with creative_get_flow_run_status, download content_url to public/guides/audio/<id>.mp3, then `python scripts/guide-timing.py <id> <lines>`)
post-a-job w1xT1qrkBxGFfu0NOEhz (8 lines) · create-your-account 03lVnLFPhAX9hUyBjf6K (7) · compare-proposals-and-hire 6tIcKllAqBIsThLU3dvc (7) · track-confirm-and-review Trgcs5Oj62ZoJwOGrppj (6) · provider-create-account CN3ToB7t9HbG4RsICiWA (7) · provider-get-verified N1dYU24ZLAjKZw1i0yIP (9) · provider-send-a-proposal 7ADXSAaLzW0wBYpiICml (7) · provider-do-the-job 48P6VWn3DPyhZd5Rpveg (7) · provider-get-paid xpny74194NQPAv4O6MTn (5)
Lines = intro + steps + outro. Prompt = "[warmly] intro [pause] step1 [pause] ... [pause] outro".

## Tap pass, 2026-10-19 (done, committed locally)
- Every tap re-aimed and checked (TapAudit composition, scripts/tap-list.ts, scripts/tap-audit.mjs).
- Client Settings matches the app: Appearance (Dark mode) first, then Notifications (Push), Account, Delete.
  Tapping Dark mode flips the switch and the screen fades to the app's dark palette.
- Guide phone timing (GuideVideo realSpeed + phoneWarp): taps and screen changes play at real speed; spare time
  becomes rests on calm frames (never mid-slide, mid-typing or on a press). The finger's glide and the tap ring run
  in real time (TapGate.real), so a rest never freezes a finger or ring. Steps own their taps (TapGate min/max).
  Debug: npx tsx scripts/warp-one.ts <lesson> <step>.
- New/fixed screens: myJobsOpen (tap My Jobs tab), startJob (Working, 0/2 ticked), payoutOpen (Profile → Payout
  account push), decline link tap, QuietBooked (banner gone), date-change Job details (price, stepper, provider,
  When/Where; new time only after Accept), menus open after the ⋮ tap and stay.
- Hero loop, carousel and film re-rendered with the fixed taps: bash scripts/render-marketing.sh, check, then
  bash scripts/render-marketing.sh --publish.
- 757 web tests pass; guide durations unchanged.
