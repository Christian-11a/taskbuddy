# Promo site plan: align with the redesigned mobile app

Status: PLAN ONLY. Nothing here is built yet. Work starts when the mobile changes land.
Scope: the public promo site in `web/` (`/`, `/account/*`, `/terms`, `/privacy`, `web/public/promo`,
`web/public/film`) and the videos made in `promo/` (Remotion). The admin dashboard (`/admin/*`) is out of scope.

---

## 1. Decisions made

| Topic | Decision |
|---|---|
| User sides | Still two: clients and providers. |
| Wording | "client" and "provider" everywhere a person reads it. Never "homeowner" or "service provider". |
| Escrow | Stays. Payment is held until the job is done, then released. |
| Warranty | The 3-day warranty is removed. Nothing on the site or in the videos mentions a warranty. |
| Film call to action | "Get the app" (assumes the app is released). |
| Videos | Two films (looping hero film, 60 s main film) plus separate guide videos for clients and providers. No other cuts. |
| Guide voice | ElevenLabs narration (the owner's account), timed with Whisper from `D:\Downloads\Tools`. |
| Screens in videos | Mirrored from the real app as seen on the Android emulator. No physical phone needed. |
| Timing | Build everything as soon as the mobile changes arrive. |
| Web sign-in / sign-up | Hide. Unlink every entry point and send people to "Get the app". Keep the code, routes and the Terms/Privacy text (the legal pages read it). |
| Carousel | Becomes the doorway to the guides: one screen and one line per card, plus "Watch the guide". |
| Look and feel | Sky palette, Inter body text, Bricolage Grotesque for big headlines only, light mode only. |
| Guide language | English (matches the installed Whisper model and the thesis). |
| Guide hosting | Files on the site (720p mp4 + poster image, loaded only when played). No YouTube channel needed. |
| Guide extras | TaskBuddy mascot on title cards; captions burned in. |
| Offers vs proposals | Site uses "offers" (plainer word, used in the app's onboarding). Provisional until the mobile team confirms. |
| Workers | Haiku 5.5 by default; Sonnet 5.5 for important or risky tasks. |

## 2. What the mobile team is changing (do not claim on the site until shipped)

- No in-app wallet. Payouts and payments go through linked banks, GCash or Maya.
- Estimated price from urgency and tasks, shown as a price range. Clients no longer set a budget.
- Automated verification, plus certificates for providers (for example TESDA, plumber certificate).
- Sample portfolio examples for providers.
- Updated Terms and Conditions.
- No warranty (see above). Escrow stays.

Handoff needed from the mobile team: the branch, the final wording for each item above, and the new Terms text.

### 2b. Update: team PR #90 merged 2026-10-16 (erianthe17/taskbuddy, `feat/terms-identity-credentials`)
Read from the PR and `team/main` (fetched as `refs/remotes/team/main`; the owner's fork is not synced yet).

What is now real in the app:
- **No wallet.** The client pays when hiring, through Xendit (GCash, Maya, GrabPay, card, online banking),
  currently in TEST mode. The money is held in escrow. Providers link a GCash, Maya or bank account
  (Profile → Payout account) and are paid there on release. Refunds go back to the payment method.
- **Tabs:** Wallet tab replaced by **Messages** on both sides (Home / My Jobs / Messages / Profile;
  Feed / My Work / Messages / Profile).
- **Price:** the client no longer types a budget. The app shows **three price options (basic / standard /
  premium)** worked out from the service, tasks and urgency. Note: three options, not a "range".
- **Verification:** Stripe Identity now also checks the name matches the account; otherwise an admin decides.
- **Credentials:** providers can upload TESDA, PRC or trade certificates per service; approved ones show a
  **Certified** badge on offers and the profile. Optional, not required.
- **Photo evidence:** ticking a task done needs 1–4 proof photos; complaints can carry up to 6 photos.
- **Terms v2:** new sections on pricing, holding of funds, release, complaints, liability. The text lives in
  `mobile/src/lib/legalText.ts` (use it as the single source for the site's Terms). Marked as a draft that
  still needs legal review.
- Price change requests exist in the backend; the mobile screen for them is a follow-up.

Conflicts and gaps to raise with the owner before writing site copy:
1. **Warranty is still in the app.** Help, onboarding cards, hire sheet and Terms v2 section 5 all say payment
   is released after a 3-day warranty (or earlier if the client releases it). The owner said the adviser wants
   the warranty removed. Ask whether a follow-up removes it; until then the site says neither.
2. **Sample portfolio examples** are not in this PR.
3. Not deployed yet: API deploy and a new app build are pending; Xendit is test mode.
4. "Offers" vs "proposals": the app still uses both, but the working screens say "proposals" (Applications,
   provider job detail, proposal modal, Home, My Work, Help); "offers" is mostly in the welcome cards and tour.
   Site decision changed to "proposals" (owner to confirm).
5. Platform fee: exists. An admin sets a commission rate (Admin → Platform, default 0); it is taken off the
   provider's payout at release (`escrow.service.ts` `payOut`). The app tells providers ("A platform fee is
   taken when it's paid out", Payout account screen). The site never mentions it: add one provider FAQ line
   without a percentage, since the rate is admin-set and its live value is unchecked.

Effect on the running build (T1–T6): none blocking. T4's provider lesson "Get paid" becomes "Link your payout
account and get paid"; client lessons gain the price options and paying at hire when real screenshots are made.

---

## 3. Each piece has one job (no repeats)

| Piece | Job | Shows | Does not |
|---|---|---|---|
| Hero loop | Set the mood in the first seconds | Short silent snippets of the app | Explain, teach steps, tell a story |
| Main film | Why TaskBuddy | One job from request to done, both sides | Button-by-button detail |
| Guides | How to do one task | Every tap, step by step, per role | Sell, tell a story |
| Carousel ("Inside the app") | Doorway to the guides | One screen and one line per card, with "Watch the guide" | Repeat the guide steps |

DECIDED: keep the carousel as the doorway to the guides.

---

## 4. Workstream A: promo site alignment

### A1. Where to edit
`web/src/components/pages/HomePage.markup.ts` is the source of truth. It says it was generated from
`D:\Downloads\taskbuddy-product-reference\public-site\index.html`, but no script in the repo regenerates it.
Treat the repo file as the master and the Downloads copy as an old reference only.
Related: string patches in `HomePage.tsx`, behaviour in `web/public/promo/script.js` (carousel text) and `auth.js`.

### A2. Wording (can be done as soon as work starts, not blocked)
- Hero, "For homeowners" tab, FAQ, carousel text in `script.js`, auth modal, Terms/Privacy modal text.
- Page metadata in `web/src/app/page.tsx` (title, description, Open Graph alt text).
- Social preview image `web/public/og-image.jpg` (says homeowners).

### A3. Claims to fix (blocked: needs the mobile changes)
| Site says today | Change to |
|---|---|
| Paid "from your TaskBuddy wallet or by card" | The new payment methods |
| Providers "see what's available in their wallet and request a withdrawal to GCash or a bank account" | Linked bank, GCash or Maya payouts |
| Verification: ID, face scan, automated check, then admin approves | The new automated verification and certificates |
| "Homeowners can file a dispute" | Client wording, and the app's "Report a problem" naming |
| Android "coming soon" | "Get the app" with the real download link |
| Carousel "Compare proposals, then hire ... hire with one tap" | Hire now opens a payment choice; follow the new payment flow |
| Carousel "Know what you will pay" (budget) | Estimated price range |
| Carousel "Mark the job complete" | Provider finishes the tasks, client confirms the job is done |
| Carousel "Verify your account first" | Address and bio first, then the new verification |
| Carousel "Show what you can do" (services and experience) | Portfolio, with the new sample examples |
Keep: escrow wording ("held until the work is complete"), survey numbers (from the thesis), the five services.

Not blocked, fix with the wording pass:
- Hiring books the job straight away (there is no separate "provider accepts" step). Check no copy implies one.
- "Offers" vs "proposals": the app uses both (onboarding says offers, Help and posting say proposals).
  Pick one term with the mobile team and use it on the site.
- Smart matching FAQ ("If no one applies in time ... ask it to find providers right away"): re-check against the
  app before keeping it.
- Services section says five categories. The app loads categories live, so the site must not promise "only five"
  if more are added.

### A3b. App features the site never mentions (owner said: add if they make the promo better)
Fold them into the existing feature cards, no new sections:
- "In-app messages": add "share photos of the problem".
- "Protected payment": add that a client can report a problem and an admin reviews it while the money is held.
- "Smart matching": add that providers set how far they travel, and urgent jobs are shown first
  (urgency wording waits for the new price ranges).
Skip on the site: welcome tour (the guides cover it) and dark mode (not a reason to choose the app, and not
confirmed as shipped).

### A4. Web sign-in and sign-up
DECIDED: hide.
- Hide. The marketplace is mobile-only and the thesis describes the web as the admin dashboard.
  Point "Join TaskBuddy" / "Sign in" to "Get the app". Keep the code and routes, only unlink them, so it can come back.
- If kept, it must match the app: role cards first ("I need help at home" / "I want to work"), 6-box email
  code, three-step forgot password, the app's copy, and the app's consents (the ID and biometric consent
  moved to the verification screen in the app).

### A5. Terms and Privacy
The same text lives in three places (web modal, `/terms` and `/privacy` pages, mobile app). When the new
Terms arrive, the site should read them from one shared source instead of keeping its own copy.

### A6. Images
Replace the pre-redesign phone mockups (`web/public/film/phones/*`) and story images (`web/public/film/story/*`)
with screens from the redesigned app (emulator). Old ones show the teal header, the middle "+" button and the
Calendar tab, which no longer exist.

### A7. Look and feel
Today: site uses Bricolage Grotesque + Switzer and a teal `oklch` palette. App uses Inter (League Spartan for
the logo wordmark) and Sky blue `#0C4A6E` / `#0369A1` / `#0284C7`.
Already consistent: the logo (same blue checklist-and-person mark on both), line-style icons.

Decided (owner accepted this recommendation on 2026-10-16):
- Colours: switch the site's tokens in `web/src/styles/promo.css` to the app's Sky palette (brand dark, primary,
  accent, light tint), keeping the site's neutrals. Real app screenshots sit on the page, so a different blue
  would clash next to them. This is a token swap, not a redesign.
- Body text: Inter, same as the app. Drops the external Fontshare load for Switzer.
- Headlines: either keep Bricolage Grotesque for marketing character, or use Inter bold like the app.
  Recommended: keep Bricolage for big headlines only; it reads as "the website" while colours and body text
  tie it to the app.
- Buttons, corner radius and cards: match the app's rounded buttons and white cards where the site shows
  app-like UI (auth modal if kept, guide page).
- Dark mode: the site stays light only.
- The hero loop, film and guides use the same Sky palette so all pieces look like one product.
Check contrast after the swap (text on Sky blue, links on the pale background).

### A7b. Second audit (done 2026-10-16): extra findings
Checked `/account/*`, `/terms`, `/privacy`, 404 and error pages, sitemap, robots, and the deployed site
(https://taskbuddy-nine-zeta.vercel.app, Vercel) at desktop and 375 px phone width. Deployed text matches the
local code. No sideways scrolling at phone width.

| Where | Problem | Fix |
|---|---|---|
| 404 page (`app/not-found.tsx`) | A public visitor on a wrong URL sees "doesn't match any page in the admin console" and "Back to dashboard" (`/admin/dashboard`). White text on a light background, nearly invisible. | Public 404 in the promo style with "Back to homepage"; keep the admin version under `/admin`. |
| Error page (`app/error.tsx`) | Same admin styling and admin link. | Same fix as 404. |
| Root layout description (`app/layout.tsx`) | "connects homeowners ... with ... service providers" | Client and provider wording. |
| "Why TaskBuddy" steps | "Add the service, place, schedule, and budget" | Blocked: price range replaces budget. |
| Header "Get App" and footer "Android" | Go to `#download`, which says "coming soon" | Real download link once released. |
| `/account` page | "The TaskBuddy Android app is still coming soon ... We'll email you the moment it's ready." No such email exists. | Goes with A4 (hide or rework web sign-up). |
| `/account/complete-profile` | Already says "Client" but "Service Provider"; four consents incl. ID/biometric | Goes with A4. |
| `/terms`, `/privacy` | Their text is read from the sign-up modal inside `HOME_MARKUP` (`LegalPage.tsx`). | If the modal is hidden, keep the document text (do not delete it) or move it to a shared file first, or these pages break. |
| Hero film on the homepage | Old app screens with a "Verified first" card | Covered by Workstream B. |
| `sitemap.ts` | Lists `/`, `/terms`, `/privacy` | Add `/guide` when it exists. |

### A8. Guide page (new)
`/guide` with two tabs (Clients / Providers), lesson list with ticks, previous / next, progress saved in the
browser only (wrapped in try/catch). Video hosting is open: YouTube (unlisted) or files on the site.

---

## 5. Workstream B: hero loop

Silent, short, always looping. Built in `promo/` (screens are rebuilt in code there).
Safe screens: service picker, post-a-job steps without price (where, tasks, urgency), provider feed header
(availability toggle, counts), offers without amounts, chat, task checklist, notifications, review, My Jobs.
Avoid: client home (wallet card), any price, wallet, payment, verification, portfolio.
Checked 2026-10-16: `promo/src/v2/HeroLoop.tsx` replays the main film from frame 246 to 1556 at 1.6x, so it
includes verification and payment, and its screens use the old teal look. It needs its own sequence built
from the safe screens, done with the film once the mobile app is final (task T7).

## 6. Workstream C: main film (60 s)

Storyboard: `promo/STORYBOARD.md`. Update the existing film in `promo/src/v2` rather than starting over:
redesigned screens, client wording, no warranty, "Get the app" ending.
Waiting scenes: verification, price step, payment sheet, "Paid".

## 7. Workstream D: guide videos

### Format (inspired by the Tarsi guides, not copied)
Title card (mascot, section tag, title, one line) → 6 to 9 steps of about 8 s each (phone with a real
screenshot on one side, tap circle, "STEP n OF N", headline, two-line explanation, progress bar) → end card
("Next guide", "Get the app"). About one minute per lesson.

### Lessons (essentials)
Clients: 1 Create your account · 2 Your Home screen · 3 Post a job · 4 Compare offers and hire ·
5 Track, confirm and review.
Providers: 1 Create your account · 2 Get verified · 3 Your Feed · 4 Send an offer · 5 Do the job · 6 Get paid.
Optional later: Report a problem (client), Build your portfolio (provider).
Almost every lesson touches a changing screen, so screenshots wait for the mobile changes.

### Production pipeline
1. Script: narration line per step, written to match the on-screen headline.
2. Screenshots: Android emulator, same test accounts and sample job for every lesson, light mode, 1080x2400.
3. Voice: the owner generates one mp3 per lesson in ElevenLabs (same voice and settings throughout).
   API keys are never pasted into chat; if automation is wanted, the key goes in an environment variable.
4. Timing: `powershell -File D:\Downloads\Tools\scripts\transcribe-words.ps1 -Audio <mp3> -OutBase <out>`
   gives word timings in milliseconds. Skip blank first entries.
5. Alignment script: match the script text to the Whisper words to get each step's start, the tap moment
   (the action word) and word-by-word captions. Matching against our own script means a misheard
   "GCash" or "Lipa" does not break timing.
6. Remotion: one data-driven lesson template; each lesson is a data file (screenshots, text, tap positions,
   timings). Changing a screen later means swapping a screenshot and re-rendering.
7. Captions burned in for muted viewing.

### Guide decisions still open
Language (English works with the installed English model; Taglish needs a bigger multilingual model),
voice, ElevenLabs plan terms (free plans may need attribution), pronunciation of TaskBuddy, GCash, Maya,
Lipa, TESDA, video hosting, mascot on title cards.

---

## 8. Order of work once the mobile changes land

1. New branch off `main` (the current branch `fix/default-light-theme` is admin work).
   Quick fixes first, not blocked: public 404 and error pages, layout description.
2. A2 wording, A3 claims, A4 sign-in decision, A5 Terms source.
3. Emulator screenshots of the redesigned app (one pass, used by A6, B, C and D).
4. A6 images, then B hero loop.
5. C main film.
6. D guides (scripts, audio, timing, render), then A8 guide page.
7. A7 look and feel. Do the colour token swap early (step 2), since screenshots and videos should be made
   against the final colours.
8. Check at phone and desktop widths, then deploy.

Can start before the mobile changes: public 404/error pages, wording pass, colours and fonts, the
`/guide` page shell, the Whisper alignment script, the Remotion lesson template. Task specs:
`docs/promo-build-tasks.md` (T0 to T6).
Not before: the hero loop. Today it is the main film sped up, so it shows verification and payment; it is
rebuilt together with the film (T7).

## 8b. How to start the build (new session)

The owner talks to one orchestrator session. The orchestrator starts Sonnet 5.5 and Haiku 5.5 workers with
the Agent tool, reviews each diff against `docs/promo-build-tasks.md`, runs the checks, and reports.
Before each worker or batch it tells the owner the task, model and effort. No commits, pushes or fork syncs
without the owner.

## 9. Who does what

| Role | Model | Job |
|---|---|---|
| Planner | Opus 5.5 | Turns this plan into task-sized specs once the mobile app is final; re-plans when something changes. |
| Orchestrator | Sonnet 5.5 | Hands tasks to workers, checks every diff against the spec, runs checks, reports to the owner. Does not commit or push without the owner. |
| Workers | Haiku 5.5 (effort set per task) | Implement one well-defined task at a time. Only one worker edits a given set of files at a time. |

Fit for Haiku (mechanical, clear spec): wording pass, metadata, public 404/error pages, colour token swap,
sitemap entry, replacing images, lesson data files, guide page shell.
Give to Sonnet, or to Haiku at high effort with a very detailed spec and Sonnet review: Whisper alignment
script, Remotion lesson template, hero loop and film edits (visual judgement), anything touching sign-in,
cookies or CSRF (A4, if web sign-up is kept).

Before workers start, the planner writes for each task: files to touch, exact before/after text or behaviour,
what must not change, and how to check it (test, build, or browser at 375 px and desktop).

## 10. Open decisions (owner)

Decided on 2026-10-16 (see section 1): sign-in hidden, carousel as doorway, look and feel, guide language,
hosting, mascot, captions, "offers".

Guide voice (settled): ElevenLabs "Narrator - Rambutan" (English, American accent), same voice and settings
for every lesson. The owner has the Creator plan.

Deploying (settled): the owner owns the Vercel project, and it deploys automatically when the owner syncs
their fork. Nothing goes live until the owner syncs. The promo site and the admin console are one Vercel
project, so a sync ships both: only finished admin work should be on the synced branch.

Still needed from the owner: the real Android download link for "Get the app", when the app is released.

Still needed from the mobile team: branch and ETA, final wording for the new features, new Terms text,
confirmation of "offers".
