# Mobile handoff: NBI / police clearance (next APK)

For the developer building the next APK and the AI assistant helping them (Cursor, Grok or any other).
Work only in `mobile/`. The backend (migration 0082, `ClearancesModule`) and the admin console are already
built. Check with the project owner that they are deployed before the emulator checks in section 5.

> **AI assistants (Cursor / Grok / others):**
> - Read this whole file first, then do the tasks in section 3 in order. Show the diff after each task and wait.
> - Only change files inside `mobile/`. Do not touch `backend/`, `web/` or `docs/`.
> - If the code does not match what this file says, stop and ask. Do not guess.
> - Never type passwords. The developer signs in to test accounts.
> - Do not add yourself or any AI as an author or co-author anywhere.

---

## 1. Why

Thesis panel revision **P3-2**: "Enhance provider screening beyond identity and certificate verification."
A provider will also need an **NBI clearance or a police clearance** to be verified, reviewed by an admin like a
certificate. It is part of verification (no separate badge).

The rule is behind a switch. While it is off (it is off now), a clearance is accepted and reviewed but does not
affect Verified. It is turned on only after this APK is installed by everyone (section 6).

## 2. API (already live once deployed)

All under the usual auth. Upload the photo first with `api.uploadImage('provider-credentials', uri)`, exactly as
certificates do, and send the returned path.

| Call | Body / result |
|---|---|
| `GET /providers/me/clearances` | `{ clearances: Clearance[], required: boolean }` |
| `POST /providers/me/clearances` | `{ clearance_type: 'nbi' \| 'police', clearance_number: string (2–60), issued_on?: 'YYYY-MM-DD', expires_on: 'YYYY-MM-DD' (required), document_path }` → the new `Clearance` |
| `DELETE /providers/me/clearances/:id` | only `pending` or `rejected`; otherwise 404 "already decided and kept on record" |

`Clearance`: `id, clearance_type, clearance_number, issued_on, expires_on, status ('pending' | 'approved' |
'rejected' | 'expired' | 'revoked'), rejection_reason, revoke_reason, reviewed_at, revoked_at, created_at, document_url`.

Errors to show as-is: 400 "This clearance has already expired", 400 "The issue date is after the expiry date",
409 "You already have a clearance under review" (only one pending at a time).

`GET /verifications/me` now also returns:
- `clearance`: `'none' | 'pending' | 'approved' | 'rejected' | 'expired' | 'revoked'`
- `clearance_required`: boolean (the switch)
- `clearance_reason`: the rejection or revoke reason of the latest one, or null

## 3. Tasks

### C1. API types and calls (`src/lib/api.ts`)
Add the `Clearance` type, `ClearanceState`, the three calls (`myClearances`, `createClearance`, `removeClearance`),
and the three new `/verifications/me` fields on `VerificationState` (all optional, older API omits them).

### C2. Clearance screen
A new provider screen, modelled on `app/(provider)/screens/SPCredentialsScreen.tsx` and
`src/components/CertificateUploadForm.tsx`:
- List the provider's clearances: type ("NBI clearance" / "Police clearance"), number, "until <expiry>", status
  label (Under review, Approved, Not accepted, Expired, Revoked), and the reason for Not accepted / Revoked.
- **Resubmit** on rejected, revoked and expired ones (pre-fill type and number, new photo and dates).
- **Remove** only on pending and rejected ones.
- Upload form: type (NBI / Police), clearance number, issued on (optional), **expiry date (required, no "no expiry"
  option: clearances always expire)**, clear photo. Same field-error style as the certificate form.
- Short hint under the title: "Upload a valid NBI clearance or police clearance. An admin checks that the name
  matches your ID."

### C3. Where the provider finds it
- On the Verification screen, add a row "NBI or police clearance: <state>" next to the ID and certificate rows,
  with an action ("Upload clearance" / "Upload again" / "View") that opens the C2 screen.
- Show this row always (so providers can upload early), but only treat it as **missing** when
  `clearance_required` is true.

### C4. Status text (`src/lib/verificationStatus.ts`)
When `clearance_required` is true, ID and certificate are approved, and `clearance` is not `approved`, the summary
should say what is left, for example:
- none: "ID and certificate approved · clearance needed" / "Upload your NBI or police clearance."
- pending: "… · clearance under review"
- rejected / revoked: "… · clearance not accepted" / "… · clearance revoked", with `clearance_reason` in the detail
- expired: "… · clearance expired" / "Upload a current clearance."
Add `'clearance'` to `MissingPart` when it is the missing piece. When `clearance_required` is false, nothing changes.

### C5. Small fix from the last APK test report
`docs/apk-test-report-expiry-and-revoked.md` note 1: a revoked **certificate** shows a fixed line on the
Verification screen instead of the admin's reason. The reason is in `api.myCredentials()` (`revoke_reason` on the
revoked credential for the provider's main service). Show it in the certificate-revoked detail, like the revoked-ID
case already does.

### C6. Checks
In `mobile/`: `npx tsc --noEmit` and `npx jest` must pass. Add tests for C4's new summaries and C2's form rules
(expiry required, number length, issue date not after expiry).

## 4. Do not

- Do not change the certificate flow or the expiry/"no expiry" rules from the last APK.
- Do not call any admin route from the app.

## 5. Emulator / phone checks (after the backend is deployed)

Use a **test provider** that is already verified. Screenshot each.
1. Verification screen shows the new clearance row as not uploaded, and the provider is **still verified**
   (the switch is off).
2. Upload an NBI clearance with a past expiry → "This clearance has already expired".
3. Upload with a valid future expiry → it shows "Under review".
4. Try a second upload while one is under review → "You already have a clearance under review".
5. In the admin console: Verifications → **Clearances** tab → open the photo → **Reject** with a reason.
   The app shows "Not accepted" with the reason, and the notification has it.
6. Upload again, then **Approve** in the admin console. The app shows "Approved".
7. In the admin console, Users → the provider → Verification: the clearance is listed with "View clearance".
8. Certificate revoke reason now shows on the Verification screen (C5).

## 6. Turning the requirement on (later, project owner)

Only after everyone has the new APK, and after deciding how long current providers get to upload one:
in the Supabase SQL editor run

```sql
select public.set_clearance_required(true);
```

It returns how many providers lost Verified at that moment. To undo: `select public.set_clearance_required(false);`.
Do **not** turn it on earlier: the old app cannot upload a clearance, so every provider would lose Verified with no
way to fix it.
