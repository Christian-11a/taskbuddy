# TaskBuddy film: storyboard (60 s), final app

Status: updated to the final app (docs/promo-site-plan.md, section 2e). Every screen below exists in the app, so nothing is a placeholder any more.
Inspiration videos were used for structure and pacing only. No footage, wording or layout is copied.

## Idea

Follow one job from request to done, told from both sides.
Ana (a client) needs a leaking sink fixed. Mark (a provider) lives nearby.
One headline per scene. One or two words in the Sky-blue accent.
Between phone scenes, cut to a Lipa City map so the film does not feel like screen after screen.

Terms: "client", "provider" and "proposals" everywhere (never "homeowner", "service provider" or "offers" as a noun).
Escrow wording is fine ("held until the job is done"). Never mention a wallet, balance, top-up, withdrawal, warranty,
early release, price ranges or a fee percentage.

## Scene list

Timing matches `promo/src/v2/timeline.ts` (60 s at 30 fps, 120 BPM). Screen names use the labels from `promo/guides/lessons/*.json`.

| Time | Scene | Headline (draft) | Visual | Screen to capture or build |
|---|---|---|---|---|
| 0:00-0:04 | Hook | Everyday work, sorted. | Logo assembles, splits into two sides | Built motion graphic (logo) |
| 0:04-0:08 | Two sides | One app. Two sides. | Client and provider phones rise | Client Home; Provider Feed |
| 0:08-0:14 | Provider is verified | Verified before they can send proposals. | ID photo, selfie, a certificate for each service (TESDA, PRC or trade), then "review": automated check plus admin; payout account linked; "Verified" | Provider Profile (Get verified); Verification: Photo of your ID; Verification: Selfie; Verification: Certificate for your service; Verification: Review and send; Payout account |
| 0:14-0:21 | Client posts a job | Tell us what needs doing. | Service, where, tasks, urgency, then one of three estimated price options (basic / standard / premium); no typed budget; Post job | Post a job: Service; Post a job: Where; Post a job: Tasks; Post a job: When & price (urgency and the three price options); Post a job: Review and post |
| 0:21-0:23 | Job travels | Right next door. | Lipa City map, job pin, nearby providers light up | Built map scene |
| 0:23-0:29 | Provider gets it | Jobs near you. | Provider feed, open the job, Job price / Platform fee / You receive shown up front (no percentage), tap Send proposal | Provider Feed; Provider Job details: pay; Send a proposal |
| 0:29-0:31 | Proposal returns | A proposal comes back. | Proposal card flies to the client, notification | Notifications (new proposal) |
| 0:31-0:38 | Client hires | Compare. Then choose. | Proposals list with ratings and reviews, tap Hire, Confirm and hire, pay online (GCash, Maya, card, online banking via Xendit), "Held until the job is done" | Proposals; Provider profile; Hire payment summary; Payment methods |
| 0:38-0:48 | The job | Updates without leaving the app. | Chat with photos; task checklist with proof photos; a schedule change request (Change date or time); all tasks done | Chat; Provider Job details: Tasks; Show the finished task (proof photos); Change date or time |
| 0:48-0:50 | Paid | Paid when you say it is done. | Client taps Confirm job is done, payment released to the provider's payout account right away; provider sees it in Earnings | Client Job details (Confirm job is done); Earnings (Released to you) |
| 0:50-0:53 | Review | Five stars. | Client leaves a review | Leave a review |
| 0:53-0:56 | Montage | (no headline) | Quick cuts of the screens above | Chat; Tasks; Proposals; Notifications; Review |
| 0:56-1:00 | End | TaskBuddy. Everyday work, sorted. | Logo, call to action "Get the app" (no store badge) | Built end card |

## Hero loop rules

The hero loop is silent, short, always looping, and mood only (it does not explain or teach).
- Use only safe screens: service picker, Post a job steps without the price step, Provider Feed header, Proposals without amounts, Chat, task checklist, Notifications, Leave a review.
- Never show prices, payment, verification or earnings amounts.

## Off camera

- No "(test mode)" or "Prototype" text anywhere in a capture.
- Fake names only (Ana Reyes, Mark Santos); no real accounts, addresses or phone numbers.
- If verification is shown: a clearly fake specimen ID and a generic avatar for the selfie.
- "Report a problem" (before the client confirms, photos and chat attached, admin reviews while money stays held) is not a scene. It can be one line in the notes or the guides; the film stays upbeat.

## Open questions

1. DECIDED: escrow stays. The client pays when hiring; the money is held and released to the provider's payout account as soon as the client confirms the job is done. No warranty and no early release, so the film never mentions either.
2. DECIDED: the call to action is "Get the app".
3. STILL OPEN: the real Android download link. Until it exists, the end card shows "Get the app" without a store badge.
4. DECIDED: only two videos for the film work: the always-looping hero film and the 60 s main film. Everything else is the video guides, with separate tracks for clients and for providers.
5. Sample names and amounts: made-up names only. Amounts should not appear on screen (the price step shows estimated options, not a typed budget, and no fee percentage is shown).
6. Light and dark mode beat: only if dark mode is confirmed as a shipped feature.

## What to build first

1. Template: layout, motion, map scene, ending.
2. The app screen scenes, captured from the final app (emulator, fake data).
3. Hero loop cut from the safe screens only.
4. Final render.
