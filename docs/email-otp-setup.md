# Registration email OTP — Supabase setup

Registration verification sends a **6-digit code**, not a link. Like the password-reset flow,
this is a one-time change to a Supabase email template; without it the endpoints exist but no
user can complete a verification.

## Why Supabase's own code, and not one of ours

`docs/backend-handoff-mobile-todo-gaps.md` §5 sketched a private `email_otps` table — hashed
codes, an attempt counter, rate limiting — and also asked the prior question: whether a
hand-rolled OTP is wanted at all. It isn't, and the reason is delivery.

A code table is the easy half. The backend has **no mail transport of its own**: every email the
platform sends today leaves through Supabase Auth. A private OTP would need either a new
SMTP/ESP dependency to send it, or Supabase to mail a code it does not know about — which it
cannot.

Supabase's signup OTP already is hashed, single-use, expiring and rate-limited. And it does one
thing a table of ours could not: verifying it sets `auth.users.email_confirmed_at`, so the
address is confirmed **to Auth itself**, not merely to us. A parallel code would leave the
account unconfirmed to Supabase while our own column insisted it was verified.

## Prerequisite: turn confirmation on

Supabase Dashboard → **Authentication** → **Providers** → **Email** → enable
**Confirm email**.

With it off, `POST /auth/register` returns a live session immediately and there is nothing to
verify — the endpoints below will report success and mail nothing.

## The template change

Supabase Dashboard → **Authentication** → **Email Templates** → **Confirm signup**.

Replace the body with something that renders `{{ .Token }}`:

```html
<h2>Confirm your TaskBuddy email</h2>
<p>Enter this code in the app to finish creating your account:</p>
<p style="font-size:28px;letter-spacing:6px;font-weight:bold">{{ .Token }}</p>
<p>The code expires in one hour. If you didn't sign up, you can ignore this email.</p>
```

The template must contain `{{ .Token }}`. Leaving `{{ .ConfirmationURL }}` in place sends a link
that opens the phone's browser rather than the app, and `POST /auth/verify-email-otp` will
reject every code the user tries to type.

## Endpoints

```
POST /auth/send-email-otp    { email }
  → { success: true }   — always, even for an unknown or already-confirmed address

POST /auth/verify-email-otp  { email, token }
  → { user: { id, email }, session: { access_token, refresh_token, expires_at } }
```

`send-email-otp` reports success unconditionally on purpose, exactly as `forgot-password` does:
a 404 for unknown addresses would let anyone enumerate which emails are registered, and a
distinguishable "already confirmed" would do the same job more slowly. Real send failures are
logged server-side as `Signup OTP not sent for <email>: ...`.

`verify-email-otp` returns a live session — the user has just proved they hold the mailbox, so
bouncing them to Login to retype a password they entered ninety seconds ago achieves nothing. It
also stamps `profiles.email_verified_at`, which records that *this* flow saw the code come back;
Supabase's own `email_confirmed_at` is also set by clicking a confirmation link, so the two are
not redundant.

A suspended account is refused here just as it is at login: a confirmed email is not a way back
into an account an admin closed.

## Rate limits

Supabase caps confirmation emails per hour per project (4/hour on the free tier by default —
Authentication → Rate Limits), shared with password-reset emails. Over the cap, sending fails and
the endpoint still returns `{ success: true }`. Check the API logs first when a code never
arrives.

Raising the cap in production requires custom SMTP — Supabase's built-in sender is not intended
for production volume (Authentication → Emails → SMTP Settings).

## Testing

```bash
curl -X POST http://localhost:3000/auth/send-email-otp \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com"}'
```

Then, with the code from the mailbox:

```bash
curl -X POST http://localhost:3000/auth/verify-email-otp \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","token":"123456"}'
```

A `401 That verification code is invalid or has expired` on a code you just received usually
means the template still sends `{{ .ConfirmationURL }}` rather than `{{ .Token }}`.
