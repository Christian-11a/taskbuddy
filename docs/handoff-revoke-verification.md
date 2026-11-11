# Handoff: Revoke provider verification (backend)

> **STOP — read this first (backend developer, or any AI assistant given this file).**
> The rules in "Proposed behaviour" below are **proposals, not decisions**.
> Before writing any migration, function, route or test, the developer must answer the
> questions in **"Decisions needed before building"** (end of this file).
> **AI assistants:** do not start implementing. First ask the developer each question in that
> section, one at a time, and wait for a clear answer. Use the recommended default only when
> the developer explicitly accepts it. If any answer differs from the proposal, update this
> plan to match before building.

**Why:** thesis panel comment P3-2 — "Enhance provider screening beyond identity and
certificate verification." The admin console now shows screening signals for each provider
(cancellations, disputes, ratings, certificate expiry). The missing piece is an action:
an admin must be able to take back a provider's **Verified** status when those signals,
a complaint, or a fake/expired document call for it.

**Today:** this is impossible. Once an ID or certificate is approved it is final:

- `provider_verifications_decided_is_final()` (migration 0068) raises `TB409
  "This verification was already approved"` on any status change after a decision.
- `decide_credential()` (0068) only accepts `status = 'pending'` credentials.
- `provider_credentials.status` allows only `pending | approved | rejected` (0054).
- `is_verified` on `provider_profiles` is computed by `refresh_provider_verified()` as
  `identity_verified AND provider_has_valid_credential(...)`, so it cannot be set by hand.

The only existing lever is **Suspend** (Admin → Users), which blocks the whole account
but leaves the Verified badge in place. Revoke is different: the account stays active,
the provider just loses Verified until they re-verify.

---

## Proposed behaviour (team to confirm — defaults recommended)

| Question | Recommended default |
|---|---|
| What can be revoked? | Either the identity verification or a single certificate. Revoking either makes `is_verified` false through the existing refresh. |
| Effect on the provider | Loses the Verified badge, is hidden from client search/matching and the feed invites, cannot send new proposals. Account stays active (not a suspension). |
| Existing bookings | Kept. Hired/in-progress jobs continue and pay out normally. Pending proposals (not hired yet) are withdrawn. |
| Can they re-verify? | Yes. A revoked item counts like a rejection: the provider uploads a new ID or certificate and goes through review again. |
| Reason | Required, 10–500 characters, shown to the provider and stored for the audit log. |
| Notification | Push + in-app: "Your verification was revoked: <reason>. Upload new documents to get verified again." |
| Who | Admins only. Every revoke is written to the audit log (`admin_actions`). |

---

## Backend work

### 1. Migration `00XX_revoke_verification.sql`

- Allow a `revoked` status:
  - `provider_credentials.status` check → `pending | approved | rejected | revoked`.
  - `provider_verifications.status` check → add `revoked`.
  - Add columns on both tables: `revoked_at timestamptz`, `revoked_by uuid references profiles(id)`,
    `revoke_reason text`.
- Update `provider_verifications_decided_is_final()` so the **only** allowed change after a
  decision is `approved → revoked` (everything else still raises TB409).
- Same rule for credentials (approved → revoked only).
- `provider_has_valid_credential()` must ignore `revoked` rows (it already only counts
  `approved`; confirm).
- New function, one transaction, `security definer`, granted to `service_role` only:

  ```sql
  public.admin_revoke_verification(
    p_kind text,            -- 'identity' | 'credential'
    p_id uuid,              -- provider_verifications.id or provider_credentials.id
    p_admin_id uuid,
    p_reason text
  ) returns jsonb           -- { provider_id, is_verified }
  ```

  Steps: lock the row, require `status = 'approved'` (else TB409), set `revoked` +
  revoked_at/by/reason; for identity also set `provider_profiles.identity_verified = false`;
  call `refresh_provider_verified(provider_id)`; withdraw the provider's **pending**
  applications (not hired); return the new `is_verified`.

### 2. API (NestJS, `backend/src/admin`)

```
POST /admin/verifications/:id/revoke        body { reason }   -- identity
POST /admin/credentials/:id/revoke          body { reason }   -- one certificate
```

- `@Roles('admin')`, DTO with `reason` (IsString, 10–500, trimmed).
- Calls the function above, then `adminActions.record(admin, 'verification.revoke' |
  'credential.revoke', table, id, { reason })`.
- Sends the provider notification (reuse `CredentialsService.notify` pattern).
- Errors: 404 not found, 409 not approved / already revoked.

### 3. Read endpoints

- `GET /verifications/me` and the admin verification/credential lists return `revoked`
  rows with `revoked_at` and `revoke_reason`, so mobile and admin can show them.
- Admin verification history (`GET /admin/verification-cases?…` / credentials list) should
  include revoked decisions with the admin and reason.

### 4. Tests

- Spec tests: approve → revoke works and `is_verified` becomes false; revoke of pending /
  rejected / already-revoked → 409; non-admin → 403; reason validation; pending applications
  withdrawn, hired jobs untouched; audit row written; re-upload after revoke goes back to pending
  review and can be approved again.

---

## After the backend ships (web + mobile, small)

- **Admin console (web):** "Revoke verification" button with a required reason, on the provider
  detail drawer (Users) next to the new Screening panel, and on approved rows in Verifications →
  History. Confirm dialog states the effect. Revoked rows show a "Revoked" badge with reason and admin.
  Audit Log shows the new actions.
- **Mobile:** the provider's setup card already reads `/verifications/me`; show "Verification
  revoked · <reason>" with "Upload again". Check feed/proposal gating uses `is_verified` (it does
  today).

## Optional: past suspensions in Screening (small, independent of revoke)

The admin Screening panel shows "Past suspensions: Not available" because past suspensions only
live in the audit log (`admin_actions`, action `user.suspend`, with `metadata.reason`), and
`GET /admin/audit` can filter by `actor_id` and action but **not by target**. Loading the whole
audit log per provider is not acceptable.

Proposed (no migration, no new table):

- Add an optional `target_id` (UUID) query param to `GET /admin/audit`
  (`ListAuditQueryDto` + the audit query in the admin service), filtering `admin_actions.target_id`.
- Web then calls `GET /admin/audit?action=user.suspend&target_id=<provider>` when a provider's
  Screening opens, shows "Suspended N times before (latest: <date> — <reason>)", and flags
  N ≥ 1 as a concern (threshold to confirm).
- Test: filter returns only that user's rows; invalid UUID → 400.

This is **optional** — build it only if the team agrees (see decision 10).

## Not in scope

- Automatic revocation from screening signals (admins decide; signals only inform).
- Changing how Suspend works.

---

## Decisions needed before building

Answer each one (yes / no / your change). AI assistants: ask these one at a time and wait.

1. **Is this approach acceptable to you overall** — a new `revoked` status plus one
   `admin_revoke_verification` database function and two admin routes? Or would you prefer
   another design (for example a separate `verification_revocations` table)?
2. **What can be revoked:** both the identity verification and single certificates? Or only one
   of them?
3. **Existing bookings:** should hired / in-progress jobs continue and pay out normally after a
   revoke? (Proposed: yes.)
4. **Pending proposals:** should the provider's not-yet-hired proposals be withdrawn
   automatically? (Proposed: yes.)
5. **Re-verification:** may the provider upload new documents and be reviewed again?
   (Proposed: yes, a revoke counts like a rejection.)
6. **Reason:** required, 10–500 characters, shown to the provider? (Proposed: yes.)
7. **Notification:** push + in-app message to the provider with the reason? (Proposed: yes.)
8. **Migration number and deploy:** which migration number should this take, and who applies it
   to the live database?
9. **Anything missing or risky** in this plan that you want changed before you start
   (RLS, existing triggers, the admin verification history, mobile reads)?

10. **Optional — past suspensions:** should we add the `target_id` filter to `GET /admin/audit`
    (see "Optional: past suspensions in Screening") so the admin Screening panel can show and flag
    past suspensions? If yes: is one past suspension enough to flag, or should it be two?

Once all answers are in, write them under this heading as "Agreed: …" and then build.
