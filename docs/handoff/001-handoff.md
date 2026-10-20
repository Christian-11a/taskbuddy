# Handoff 001 — Slice 1: optional proposal message + phone numbers in +63 form

Date: 2026-10-20

## Status
- Slice 1 is complete. Slices 2, 3 and 4 are not started.
- Branch: `feat/oct20-feedback` (cut from `main` at `af770a48`). Not pushed.
- Last code commit: `eed5f4c8`. The handoff commit follows it.
- Plan: `C:\Users\morad\.claude\plans\pasted-content-id-c71d-1-on-abstract-hopper.md`
- Repo visibility: PUBLIC (checked with `gh repo view`). No secrets, `.env` values or memory files are in these commits.

## What changed
- `mobile/src/components/ProposalModal.tsx`: the proposal message is optional (label "Your message (optional)", counter "Optional · n / 300"). Only the 300-character cap is checked. `PROPOSAL_MIN_LENGTH` is removed.
- `mobile/src/components/__tests__/ProposalModal.test.tsx`: the 20-character tests are replaced by optional-message tests.
- `mobile/src/lib/payoutLabels.ts`: `formatMobileNumber` shows `+63 917 123 4567`; new `normalizePhMobile` returns the `09…` form; GCash/Maya validation and helper text accept both forms.
- `mobile/app/(provider)/screens/SPPayoutAccountScreen.tsx`: sends the `09…` form for GCash/Maya, uses a `phone-pad` keyboard, `maxLength` 16.
- `mobile/src/lib/__tests__/payoutLabels.test.ts`, `mobile/app/(provider)/screens/__tests__/SPPayoutAccountScreen.test.tsx`: +63 tests, and the changed error text.
- `mobile/src/lib/inputRules.ts`: the profile phone error message now names both forms. Storage is unchanged (`09…`), because `backend/src/profiles/dto/profiles.dto.ts` requires `^09\d{9}$`.
- `mobile/app/(provider)/screens/SPEditProfileScreen.tsx`, `mobile/app/(homeowner)/screens/HOEditProfileScreen.tsx`: the phone field uses a `phone-pad` keyboard (the old `number-pad` had no `+` key) and the helper reads "Starts with 09 or +63".
- `mobile/src/lib/__tests__/inputRules.test.ts`, `mobile/src/context/__tests__/EditProfileValidation.test.tsx`: new message, keyboard and helper, plus extra +63 cases.
- `mobile/app/(homeowner)/screens/__tests__/HOHomeScreen.test.tsx`: test-only fixes (see Decisions).

## Verification
Run from `mobile/`:
- `npm run typecheck`: 0 errors.
- `npm test` (final run): `Test Suites: 200 passed, 200 total`, `Tests: 3150 passed, 3150 total`. Strict gate met.
- Before the HOHomeScreen fix, `main` itself had 3 failing tests in `HOHomeScreen.test.tsx`. This was checked on a clean `main` checkout.

## Decisions made
- **Profile phone (user's mid-session request):** the field already converted `+63` to `09…` as you type. The blocker was the `number-pad` keyboard. Fixed the keyboard, helper and error text, and did not rewrite the conversion logic. Nothing needs the backend.
- **HOHomeScreen test failures (not caused by this work):**
  1. The "wrong shape" describe never set the `useAuth` mock. Added it.
  2. The "server is waking up" test switches to fake timers and left work queued, which hung every test after it. It now unmounts inside the test and sits last in the file (a comment says why).
  3. Under the full parallel suite, this file's tests are slow: added `jest.setTimeout(20000)` for the file and a 10 s `waitFor`/`findBy` timeout in "a failed refresh keeps the saved jobs…". `HOHomeScreen.tsx` itself was not touched.
- `OnboardingScreen.test.tsx` failed once in a heavily loaded first run and passes alone and in the final run. It is a load flake, nothing was changed.
- The payout number field's `maxLength` is 16 for all methods ("+63 917 123 4567" is 16 characters; bank numbers were already capped at 16).

## Next
Slice 2: counterpart photos everywhere + backend handoff. First task: Task 2.1, the new `mobile/src/components/ui/Avatar.tsx` and its test. `HOHomeScreen.tsx` is edited in Task 2.2 (attention avatars); its test file is green now, so any failure there during Slice 2 is new.

## Open items / backend
- Nothing for the backend from Slice 1. The proposal message is already optional in `ApplyDto`, and both phone fields send the `09…` form.
- Slice 2 will add `docs/backend-handoff-avatars-2026-10-20.md` (and a copy in `C:\Users\morad\Downloads\`) for `assigned_provider.avatar_url` on the job payload.
- Nothing is pushed yet. Slice 4 asks before pushing.
