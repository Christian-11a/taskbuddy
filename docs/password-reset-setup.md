# Password Reset — Supabase setup

The reset flow sends a **6-digit code**, not a link. This is a one-time change to a
Supabase email template; without it the endpoints exist but no user can complete a reset.

## Why a code, not a link

Supabase's default recovery email contains a link to a web page. On a phone that link opens
the **browser**, not the app — and the mobile app has no deep-link handler for it and no web
page to land on. A code, by contrast, is something the user reads from their mail app and types
into a screen the app already has.

## The change

Supabase Dashboard → **Authentication** → **Email Templates** → **Reset Password**.

Replace the body with something that renders `{{ .Token }}`:

```html
<h2>Reset your TaskBuddy password</h2>
<p>Enter this code in the app to set a new password:</p>
<p style="font-size:28px;letter-spacing:6px;font-weight:bold">{{ .Token }}</p>
<p>The code expires in one hour. If you didn't ask for it, you can ignore this email.</p>
```

The template must contain `{{ .Token }}`. Leaving `{{ .ConfirmationURL }}` in place sends a link
instead, and `POST /auth/reset-password` will reject every code the user tries to type.

## Endpoints

```
POST /auth/forgot-password  { email }
  → { success: true }   — always, even for an address with no account

POST /auth/reset-password   { email, token, new_password }
  → { session: { access_token, refresh_token, expires_at } }
```

`forgot-password` reports success unconditionally on purpose: a 404 for unknown addresses would
let anyone enumerate which emails are registered. Real send failures are logged server-side.

`reset-password` returns a live session, so the app can move the user straight into the signed-in
state rather than bouncing them back to Login.

## Rate limits

Supabase caps recovery emails per hour per project (4/hour on the free tier by default —
Authentication → Rate Limits). Over the cap, sending fails and the endpoint still returns
`{ success: true }`; the failure appears in the API logs as
`Password reset email not sent for <email>: ...`. Check there first when a code never arrives.

Raising the cap in production requires custom SMTP — Supabase's built-in sender is not intended
for production volume (Authentication → Emails → SMTP Settings).

## Testing

```bash
curl -X POST http://localhost:3000/auth/forgot-password \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com"}'

# then, with the code from the email:
curl -X POST http://localhost:3000/auth/reset-password \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","token":"123456","new_password":"newsecret123"}'
```

A suspended account is refused at step two with **403 Account suspended** — a reset must not be a
way back into an account an admin closed.
