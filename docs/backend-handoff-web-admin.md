# Backend handoff — web admin requirements

**Updated:** 2026-10-03

**Scope:** web admin console only. Mobile requirements belong to their separate handoffs.

The web team needs two things from the backend. Neither blocks the working
console; both enable Settings features that are currently disabled. This is a
requirements list, not a claim that either exists today.

## 1. Email admins when a provider submits for verification

**Needed:** when a provider submits their verification, send an email to every
active admin. It is always on; there is no per-admin toggle.

- Send once per submission. Retries or reprocessing must not send duplicates.
- A failed send must not block or fail the provider's submission.
- The email names the provider and links to the Verifications page.

**Web follow-up:** replace the disabled switch in Settings → Notifications with a
plain note that this alert exists, once delivery is working.

**Verification:** submit a test verification; every active admin receives exactly one
email. Re-run the processing and confirm no second email. Make the mail send fail and
confirm the submission still succeeds.

## 2. Platform name and support email as shared settings

**Needed:** store the platform name and support email once on the server. Use them in
two places: the public website footer and outgoing emails. Base currency stays fixed
at PHP and read-only.

**The support email does not exist yet.** The team has not created the mailbox, so
the value starts empty and must be allowed to stay empty. Until an admin sets it, the
footer and emails must show no support contact line at all (no placeholder address).
The platform name can be used right away.

- Read: public, so the website can show the values without a login.
- Update: admins only. Validate the name (not empty). Accept the email as empty, or a
  valid email format.
- Concurrent edits: reject a stale update instead of silently overwriting another
  admin's change, and return a clear conflict error.
- Record each change in the audit log. Return real authorization, validation and
  conflict errors; never return success when nothing was saved.
- Setting the email must only happen after the mailbox exists and has been checked to
  receive messages.

**Web follow-up:** connect the Settings fields and the footer. The separate Platform
administration page is unchanged.

**Verification:** with the email empty, confirm the footer and a test email show no
support line. Then save a name and an email; reload two admin sessions in separate
browsers and confirm both show them, and that the footer and a test email use them.
Confirm invalid values and non-admin writes are rejected, and that two sessions editing at once get a
conflict, not a silent overwrite.

## What to send back to web

For each item:

1. The endpoint, request and response shape, and who may call it.
2. Any migration or configuration needed, and whether it is applied to the
   environment the web uses. A merged PR alone is not deployment proof.
3. Your verification results.
