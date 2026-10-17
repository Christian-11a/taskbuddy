# Promo build tasks (specs for workers)

Read with `docs/promo-site-plan.md` (the why and the decisions). This file is the how.
Status: specs written 2026-10-16. Nothing built yet.

## Rules for every task

- Only the files listed for the task. If another file seems to need a change, stop and report it.
- One worker per file set at a time. Tasks marked "parallel OK" touch separate files.
- Never commit, push, or sync the fork. The orchestrator reports; the owner decides.
- Never touch `/admin/*` pages or admin components, `mobile/`, `backend/`, or `test-accounts.txt`.
- Wording: "client" and "provider" in anything a visitor reads. Internal names (`homeowner` role values,
  CSS classes, data attributes, `HO*` files) stay unchanged.
- Never mention a warranty. Never claim wallet, budget, price range, certificates, or portfolio samples
  (the mobile team is still building those).
- Report back in under 15 lines: files changed, checks run with results, anything skipped or unsure.

Checks (run from `web/`): `npm run lint`, `npm test`, `npm run build`. For visual tasks the orchestrator
also opens the page at 375 px and desktop width in the browser preview.

---

## T0. Branch and setup (orchestrator, no worker)

1. `git status`. The current branch `fix/default-light-theme` is admin work; leave it as is.
2. Create `promo/align-mobile` from `main`.
3. `promo/` is untracked. It has its own `.gitignore` (node_modules, out). Ask the owner before the first
   commit whether `promo/` source goes into git. Never add `test-accounts.txt`.

---

## T1. Public 404 and error pages  · Haiku, medium · parallel OK with T3

Files: `web/src/app/not-found.tsx`, `web/src/app/error.tsx`.

Problem: these are admin pages. A visitor on a wrong public URL sees "doesn't match any page in the admin
console", a link to `/admin/dashboard`, and white text on a light background.

Next.js note: the root `not-found.tsx` handles every unmatched URL, including `/admin/...`, and the root
`error.tsx` catches admin errors too (there is no admin-level one). So each file must pick a variant by path.

Do:
- Make both client components that read `usePathname()`.
- Path starts with `/admin`: render exactly today's admin markup and text (keep it byte-for-byte).
- Any other path: render the public variant in the promo style, reusing the same structure as
  `web/src/components/pages/LegalPage.tsx`: wrapper `div.promo-site` > `div.account-shell` >
  `div.account-topbar` (the wordmark link to `/` with `/promo/taskbuddy-logo-96.png`) > `main.account-main` >
  `div.account-card`, and `import "../styles/promo.css"` (its rules are scoped under `.promo-site`).
  - 404 text: eyebrow "Page not found", heading "We couldn't find that page.", one line "The link may be
    old or mistyped.", button "Back to homepage" (`href="/"`, class `button button--quiet` like LegalPage).
  - Error text: eyebrow "Something went wrong", heading "This page didn't load.", one line "Please try again.",
    buttons "Try again" (calls `reset`) and "Back to homepage". Keep `console.error` and the digest line.
Must not change: admin text, admin links, admin styling.
Check: lint, tests, build. Orchestrator opens `/no-such-page` and `/admin/no-such-page` in the preview.

---

## T2. Wording pass  · Haiku, high · after T1 (shares nothing, but keep the diff reviewable)

Files: `web/src/components/pages/HomePage.markup.ts`, `web/src/components/pages/HomePage.tsx`,
`web/public/promo/script.js`, `web/public/promo/auth.js`, `web/src/app/page.tsx`, `web/src/app/layout.tsx`,
`web/src/app/account/complete-profile/CompleteProfileForm.tsx`.

Replace visible wording:
- "homeowner(s)" → "client(s)"; "Homeowner" → "Client".
- "service provider(s)" → "provider(s)"; "Service Provider" / "Service provider" → "Provider".
- Fix grammar after the swap (articles: "a client", "an hour"; plurals).
- "proposals" → "offers" in visitor-facing text.

Exceptions, leave exactly as they are:
- The whole survey section ("The problem, in numbers": "we surveyed 25 homeowners and 14 service providers",
  the four statistic cards and their "21 of 25 homeowners" style lines). Those describe the real survey
  respondents in the thesis.
- Anything inside `<script>`/`<style>` that is code, class names, `data-*` values, ids, role values sent to
  the API (`homeowner` / `client` request values in `auth.js` and `CompleteProfileForm.tsx`), and comments.
- The Terms and Privacy text inside the sign-up panel (new Terms are coming from the mobile team). Only
  change "homeowners" there to "clients".
- `HomePage.tsx` contains `.replace(...)` calls whose first argument must match the markup exactly. If the
  markup inside a replace target changes, update the target string in the same way, or the patch silently
  stops applying.

Report: a short table of every changed phrase (old → new, file). Count before and after:
`grep -oiE "homeowners?|service providers?"` per file; only the survey lines and code identifiers may remain.
Check: lint, tests, build. Orchestrator reads the homepage text in the preview.

Note: the social preview image `web/public/og-image.jpg` also says homeowners. It is an image; it is
redone with the videos (T7), not here.

---

## T3. Colours and fonts  · Haiku, high · parallel OK with T1

Files: `web/src/styles/promo.css` (token block at the top, plus the few inline `oklch(...)` colours),
`web/src/components/pages/HomePage.tsx` (Switzer `<link>` tags), `web/src/app/layout.tsx` (font loading).
If T2 is running, do T3 after it (both touch `HomePage.tsx` and `layout.tsx`).

Do:
- Map the tokens in the `.promo-site` block to the app's Sky palette
  (`mobile/src/constants/palettes.ts`, light): accent → `#0369a1` (primary), accent-deep → `#0c4a6e`
  (primaryDeep), accent-soft → `#e0f2fe` (primaryTonal), surface-tint → `#f0f9ff`,
  dark → `#13283c` (providerHero), error → `#b91c1c`, error-soft → `#fef2f2`. Keep paper, surface, ink,
  muted and rule as neutrals, shifted to a cool slate so they sit with Sky
  (ink `#0f172a`, muted `#64748b`, rule `#e2e8f0`, paper `#f8fafc`).
- Replace the inline `oklch(20% .04 225 / x%)` shadows/overlays with the same alpha on `#13283c`.
- Body font: Inter via `next/font/google` in `layout.tsx` (variable `--font-inter`), set
  `--font-body: var(--font-inter), "Inter", system-ui, sans-serif`. Remove the Fontshare `<link>` tags and the
  comment about Switzer in `HomePage.tsx`.
- Keep Bricolage Grotesque for `--font-display` (big headlines only).
- Light mode only; do not add dark styles.
Must not change: layout, spacing, sizes, admin styles (`globals.css` and admin components).
Check: lint, tests, build. Orchestrator screenshots hero, features, FAQ and footer at 375 px and desktop, and
checks contrast: body text on paper, white text on `#0369a1` buttons, links. Anything under 4.5:1 for body
text gets reported, not guessed.

---

## T4. Guide page shell  · Sonnet, medium · after T3 (uses the new tokens)

New files: `web/src/app/guide/page.tsx`, `web/src/components/pages/GuidePage.tsx`,
`web/src/components/pages/guideLessons.ts`, plus a test `GuidePage.test.tsx`.
Edit: `web/src/app/sitemap.ts` (add `/guide`).

Do:
- Data file `guideLessons.ts`: two tracks.
  Clients: Create your account · Your Home screen · Post a job · Compare offers and hire ·
  Track, confirm and review.
  Providers: Create your account · Get verified · Your Feed · Send an offer · Do the job · Get paid.
  Each lesson: `id` (slug), `title`, `summary` (one line), `duration` (string, "1:00" placeholder),
  `video` (optional path; empty until rendered), `poster` (optional).
- Page: heading and one-line intro; tabs "For clients" / "For providers" (keyboard accessible, `role="tablist"`);
  lesson list with number, title, duration, tick; main panel with title, video (or a "Video coming soon"
  placeholder card when `video` is empty), summary, "Mark as complete", "Previous" / "Next lesson".
  URL hash selects the lesson (`/guide#post-a-job`), shareable.
- Progress: `localStorage` key `taskbuddy-guide-progress`, every read and write in try/catch; the page
  works with storage blocked. "Reset progress" link.
- Video: `<video controls preload="none" poster=...>`; never autoplay with sound.
- Style: promo-site look (wrapper `.promo-site`, tokens from `promo.css`), Sky palette, no new colours.
  Phone width 375 px: list above the player, no sideways scroll.
- Metadata: title "TaskBuddy Guide | Learn the app step by step", description in client/provider wording.
- Do not link it from the homepage yet (that waits for the carousel task).
Check: lint, tests (tab switching, hash selection, progress with storage throwing), build; orchestrator
views `/guide` at 375 px and desktop.

---

## T5. Whisper alignment script  · Sonnet, medium · parallel OK (only `promo/`)

New files: `promo/scripts/align.mjs`, `promo/scripts/align.test.mjs` (node:test), `promo/guides/README.md`.

Input:
- A lesson script JSON, e.g. `promo/guides/lessons/<id>.json`:
  `{ "id", "title", "steps": [ { "headline", "body", "narration", "tapWord"?, "screenshot", "tap"?: {x,y} } ] }`
- Whisper word JSON from
  `powershell -File D:\Downloads\Tools\scripts\transcribe-words.ps1 -Audio <mp3> -OutBase <out>`
  (`<out>.words.json`; entries have `text` and `offsets.from` / `offsets.to` in ms; skip blank `text`).

Output `promo/guides/timing/<id>.timing.json`:
`{ "fps": 30, "durationFrames", "steps": [ { "startFrame", "endFrame", "tapFrame"? } ], "words": [ { "text", "startFrame", "endFrame" } ] }`.

Rules:
- Match narration words to Whisper words in order with a forgiving comparison (lowercase, strip punctuation,
  allow small spelling differences, e.g. edit distance ≤ 2 or a prefix match), so "GCash", "TaskBuddy",
  "Lipa" misheard by Whisper still line up.
- A step starts at its first matched word; it ends where the next step starts; the last step ends at the
  audio end plus 0.5 s.
- `tapFrame` = start of the word equal to `tapWord`, if given.
- If a step's first words cannot be matched, fail with a clear message naming the step (do not guess).
- No network calls. No ElevenLabs calls (the owner makes the mp3 files).
Test with a hand-made words JSON (no audio needed), including a misheard word and a missing step.
README: the three commands (Whisper, align, render) in order.

---

## T6. Guide lesson template in Remotion  · Sonnet, high · after T5 (reads its output format)

New files: `promo/src/guide/GuideLesson.tsx`, `promo/src/guide/parts.tsx`; register a composition in
`promo/src/Root.tsx` (`id="GuideLesson"`, 1280x720 and 1920x1080 variants, 30 fps,
`calculateMetadata` reads the duration from the timing file).

Look (inspired by the Tarsi guides, not copied):
- Title card: TaskBuddy mascot (`web/public/promo/taskbuddy-mascot.webp`, copy into `promo/public/`),
  small tag ("FOR CLIENTS · 3"), lesson title, one-line summary. About 3 s.
- Step: phone frame on the left showing the step's screenshot (use the existing `Phone` shell in
  `promo/src/v2/kit.tsx`, with an `<Img>` inside); on the right a numbered badge "STEP n OF N", headline,
  two-line body; a soft tap circle at `tap` around `tapFrame`; segmented progress bar along the bottom;
  burned-in captions from `words` (2 lines max, current word highlighted).
- End card: logo, a one-line "you did it", "Next: <next lesson>", "Get the app".
- Colours: Sky palette and Inter, light background. Calm motion: screen cross-fade between steps, no
  spinning or bouncing.
- Audio: the lesson mp3 from `promo/guides/audio/<id>.mp3`.
Build one sample lesson with placeholder screenshots (grey phone screens with the step name) and a fake
timing file, so the template can be reviewed before real audio exists.
Check: `npx remotion still` frames for title, a step and the end card; orchestrator reviews them.

---

## T7. Hero loop, film and preview image  · BLOCKED until the mobile app is final

Finding: today's hero loop (`promo/src/v2/HeroLoop.tsx`) is the 60 s film sped up 1.6x from frame 246 to
1556, so it shows verification, posting, offers, hiring, chat, paying and the review. The screens in
`promo/src/v2/kit.tsx`, `HOScreens.tsx`, `SPScreens.tsx` use the old teal look (`A.hoHero` gradient,
cyan tokens), the middle "+" button and the Calendar tab.

When unblocked (Sonnet, high):
1. Update `kit.tsx` tokens and the screen components to the redesigned app (Sky palette, 4-tab bars,
   no "+" button), using emulator screenshots as the reference.
2. Main film: follow `promo/STORYBOARD.md`.
3. Hero loop: build its own short sequence from the safe screens (plan section 5) instead of reusing the
   whole film, so it never shows payment, wallet or verification.
4. Re-make `web/public/og-image.jpg` with client/provider wording.
5. Render to `web/public/film/` (same file names as today, so the page does not change).

## T8. Blocked site tasks (after the mobile app is final)
Claims table (plan A3), hiding sign-in and the account pages (A4: unlink only, keep the legal text that
`/terms` and `/privacy` read), Terms source (A5), images (A6), feature card additions (A3b), carousel as the
guide doorway, real lesson screenshots and audio, "Get the app" link.

---

## Suggested run order now

1. T0 (orchestrator).
2. T1 (Haiku) and T5 (Sonnet) in parallel.
3. T2 (Haiku), then T3 (Haiku).
4. T4 (Sonnet) and T6 (Sonnet) in parallel.
5. Orchestrator reviews everything, then asks the owner about committing.
