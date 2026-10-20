# Handoff 003 — Slice 3: urgency step shows pickup speed and Premium perks

Date: 2026-10-20

## Status
- Slices 1, 2 and 3 are complete. Slice 4 is not started.
- Branch: `feat/oct20-feedback`. Not pushed.
- Last code commit: `3d646c41` (urgency step). The handoff commit follows.
- Plan: `C:\Users\morad\.claude\plans\pasted-content-id-c71d-1-on-abstract-hopper.md`

## What changed
- `mobile/src/lib/urgencyInfo.ts` (new): `Urgency`, `MATCH_WINDOW_MIN` (5/10/15), `urgencyTiming()`, `URGENT_PERKS`.
- `mobile/src/lib/__tests__/urgencyInfo.test.ts` (new): 3 tests.
- `mobile/src/components/post/UrgencyRow.tsx`: new optional `timing`, `badge`, `perks` props; perks show only while selected; row aligns to the top.
- `mobile/src/components/post/__tests__/UrgencyRow.test.tsx`: 3 tests appended.
- `mobile/app/(homeowner)/screens/HOCreateJobScreen.tsx`: step 4 passes timing to every option, the Premium badge and perks to Urgent; comment updated.
- `mobile/app/(homeowner)/screens/__tests__/HOCreateJobScreen.test.tsx`: one step-4 test.

## Verification
Run from `mobile/`:
- `npx jest src/lib/__tests__/urgencyInfo.test.ts src/components/post/__tests__/UrgencyRow.test.tsx`: before the implementation, `Tests: 2 failed, 4 passed, 6 total` (module not found plus the new UrgencyRow tests); after, `Tests: 9 passed, 9 total`.
- `npx jest HOCreateJob`: `Tests: 62 passed, 62 total`.
- `npm run typecheck`: 0 errors.
- `npm test`: `Test Suites: 202 passed, 202 total`, `Tests: 3167 passed, 3167 total`. Strict gate met. No HOHomeScreen flake this run.

## Decisions made
- `UrgencyRow.test.tsx` already existed, so the plan's new tests were appended to it as a second `describe` instead of replacing the file.
- The HOCreateJobScreen test was written after the implementation, not before it (the three component/lib tests were red first). It lives in the budget-step describe and reuses `openBudgetStep`.
- Python was used to apply the anchored edits; each anchor matched exactly once.

## Next
Slice 4: final verification, push, PR. First task: rerun `npm run typecheck` and `npm test`, then ask the user before pushing.

## Open items / backend
- Backend: `docs/backend-handoff-avatars-2026-10-20.md` (copy in `C:\Users\morad\Downloads\`). Leave-a-review shows the silhouette until it ships.
- Slice 4's push commit body must mention this doc.
- Nothing is pushed. Slice 4 asks before pushing.
