# Mobile handoff: revoked verification + certificate expiry (next APK)

For the teammate building the next APK, and for the AI assistant helping them (Cursor, Grok or any other).
Work only in `mobile/`. The backend and the admin console are already done and live once PR "certificate expiry
+ old-app safety net" is merged and deployed (check with the project owner before starting).

> **AI assistants (Cursor / Grok / others):**
> - Read this whole file first, then do the tasks in section 3 in order.
> - Do not change anything outside `mobile/`. Do not change the backend or the web console.
> - If something here does not match the code you see, stop and ask the developer instead of guessing.
> - Never type passwords. The developer signs in to test accounts.
> - Do not add yourself or any AI as an author or co-author in commits or PRs.

---

## 1. Why

Thesis panel revision **P3-2** (better provider screening). Admins can now **revoke** a provider's approved
ID check or certificate, with a reason (backend PR #134, web #135). The provider has to see that and upload again.

Panel follow-up: the **certificate expiry date** must not be skippable. The provider either picks the
expiry date printed on the certificate, or says it has no expiry date. No photo auto-fill (decided: not worth it).

## 2. Already in `main` (nothing to write, just build it)

PR #134 already added the mobile side of revoke:

- `src/lib/api.ts`: `'revoked'` on `Verification.status`, `Credential.status`, `IdentityState`, `CertificateState`, plus `revoke_reason` / `revoked_at`.
- `src/lib/verificationStatus.ts`: "ID verification revoked" (with the admin's reason) and "ID approved · certificate revoked".
- `app/(provider)/screens/SPVerificationScreen.tsx`: a revoked ID shows "Your ID verification was revoked." with the reason, then the normal "Try again" flow.
- `app/(provider)/screens/SPCredentialsScreen.tsx`: label "Revoked", the reason under it, "Resubmit", and no "Remove" (the server keeps revoked certificates).
- `src/lib/providerSetup.ts`, `src/components/CertificateNotices.tsx`, `app/(provider)/screens/SPHomeScreen.tsx`: revoked handled like rejected.

**Important:** the APK people have now (built before #134) **crashes** on the Verification screen and the
provider job view when the main certificate is revoked (`verificationStatus.ts` destructures an unknown state).
The backend now protects old APKs: unless the app sends the header in task M1, it reports "revoked" as
"rejected" with the revoke reason. So **task M1 is required**, or the new app will never see "revoked".

## 3. Tasks

### M1. Tell the API the app understands "revoked" (required)

In `src/lib/api.ts`, the JSON request helper builds the headers (search for
`'Content-Type': 'application/json'`, around line 932). Add one header to every request:

```ts
headers: {
  'Content-Type': 'application/json',
  'X-Client-Features': 'revoked-status',
  ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
},
```

Without it, `GET /verifications/me` and `GET /providers/me/credentials` return `rejected` instead of `revoked`.

### M2. Expiry date required, or "no expiry date" (required)

File: `src/components/CertificateUploadForm.tsx` (used by the Certifications screen and the Get verified flow).

1. Under the date picker, add a checkbox (use the app's existing checkbox/toggle style):
   **"This certificate has no expiry date"**.
   - Ticking it clears the picked date and disables the date button.
   - Picking a date unticks it.
2. Label: change `Expiry date (optional)` to **`Expiry date`**.
3. Validation (`credentialProblem` and `credentialErrors`):
   - neither a date nor the checkbox → error on the `expiry` field:
     **"Pick the expiry date printed on the certificate, or tick that it has none."**
   - `isValidExpiry('')` must no longer count as fine on its own. Keep the format check for a picked date.
   - Update the comment above `isValidExpiry` ("Empty is fine…").
4. Submit: send `no_expiry: true` when ticked, otherwise `expires_on`. Never both. Add `no_expiry?: boolean`
   to the `createCredential` input type in `src/lib/api.ts`, and `no_expiry?: boolean` to the `Credential` type.
5. Resubmit (`prefill(item)`, around line 219): pre-tick the checkbox when `item.no_expiry` is true.
6. Tests: update `credentialProblem` / `credentialErrors` tests for the new rule (date ✓, checkbox ✓, neither ✗, both impossible).

Server rules, for reference (already live):
- `POST /providers/me/credentials` accepts `no_expiry: boolean`; a date **and** `no_expiry: true` → 400.
- An expiry date in the past → 400 "This credential has already expired" (unchanged).
- "One of the two is required" is enforced only after the switch in section 5 is turned on.

### M3. Run the checks

```bash
cd mobile
npx tsc --noEmit
npx jest
```

Both must pass.

## 4. Emulator checks (before building the APK)

Use the emulator with a **test** provider. **Smoke Provider** (`smoke.p.…@taskbuddy.test`) currently has its
Plumbing certificate **revoked** with the reason "Test of the revoke feature. Please upload your certificate again."
Its ID check is still approved. The developer signs in; assistants never type passwords.

Check, and take a screenshot of each:

1. **Home / Get verified card** says the certificate was revoked and offers "Upload again".
2. **Verification screen** shows "ID approved · certificate revoked" and the reason. **No crash.**
3. **Certifications screen**: the Plumbing certificate shows **Revoked**, the reason, **Resubmit**, and **no Remove**.
4. **Notifications** list has "Verification revoked" with the reason.
5. Tap **Resubmit**:
   - try to submit with **no date and no checkbox** → the expiry error shows;
   - submit with a **date**, or with **"no expiry date" ticked** → it goes through as "Under review".
6. In the admin console (Verifications → To review), the new certificate shows the date, or
   "No expiry date (provider says). Check the photo". An admin approving it makes Smoke Provider verified again.
7. The job view and the feed open normally for Smoke Provider.

Also check once with an **old APK** if you still have one installed (the backend safety net):
- Smoke Provider's Verification screen shows "not accepted" with the reason, and does **not** crash;
- on Certifications, tapping **Remove** on that certificate shows "This certificate was revoked by an admin and stays
  on record. Upload a new one instead." (old apps offer Remove there; the server keeps revoked certificates).

## 5. After the APK is out

When everyone testing has the new APK, someone with Render access sets this environment variable on the
`taskbuddy` service and redeploys:

```
REQUIRE_CREDENTIAL_EXPIRY=true
```

From then on, the server refuses a certificate without a date or `no_expiry`. Do **not** turn it on before
the new APK is installed: the old app sends neither, so every certificate upload would fail.

## 6. Building the APK

Same as the last build:

- the TaskBuddy app name needs `npx expo prebuild -p android --clean` first;
- build from `main` after M1 and M2 are merged.

## 7. Done when

- [ ] M1 header added
- [ ] M2 form: required date or "no expiry" checkbox, sends `no_expiry`, tests updated
- [ ] `tsc` and `jest` pass
- [ ] All seven emulator checks pass, with screenshots
- [ ] APK built from `main` and shared
- [ ] Someone with Render access told to switch on `REQUIRE_CREDENTIAL_EXPIRY` after rollout
