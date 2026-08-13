# Backend handoff — what the mobile to-do list still needs from the API

**Who this is for:** whoever owns `backend/` (and, for items 1 and 2, whoever holds Supabase and
Stripe access).

This came out of working through `mobile/README.md`'s "Additional To-Do Items" and "What's Not
Wired Yet". Everything that could be finished purely in the app **has been** — see
`mobile/CHANGELOG.md` for that list. What is below is the remainder: the items that cannot be
built honestly without an API change first, each with what the app would call if it existed.

Nothing here is urgent or blocking. Nothing in the app is currently broken by their absence; the
affected UI is either hidden or labelled as unavailable rather than faked.

---

## Read this first: three items were mislabelled, and have since been wired — no backend work needed

`mobile/README.md` used to list these under "not wired yet" in a way that implied a missing
backend. The backend was already there; only the app side was missing. **All three are now wired**
and need nothing from you:

| Item | What it uses |
|---|---|
| **Notification toggles** (push/email/SMS) | `GET`/`PATCH /settings`, over `user_settings` (migration 0011) |
| **Dark Mode persistence** | the same endpoints — `user_settings.dark_mode` |
| **Forgot password** | `POST /auth/forgot-password` and `POST /auth/reset-password` (see `docs/password-reset-setup.md`) |

Two notes that follow from that, in case they reach you as bug reports:

- **A saved `dark_mode` does nothing visible.** The preference is stored; the app has no theme
  switching to apply it to. That is app-side work, and the Settings screens say so on the row.
- **`email_enabled` / `sms_enabled` are stored but unread.** No transport consults them, exactly as
  migration 0011's own comment says. `push_enabled` is the only one anything looks at, and only by
  the push scheduler — which still has no delivery transport (item 7).

Same story, smaller, for **counterpart avatars**: `avatar_url` is already selected on the
application, conversation, and review payloads. Those screens still render initials, which is
app-side work too.

---

## 1. Account deletion

**Missing:** `DELETE /profiles/me`.

Today the Settings row opens a `mailto:` to support, deliberately, because deleting nothing while
saying "deleted" is worse than being honest about the manual process. If you want it self-serve:

```
DELETE /profiles/me      (client or provider)
  → 409 if the account has money or obligations in flight
  → 204 otherwise
```

The 409 case is the part that needs a decision rather than code. An account cannot simply vanish
while it has:

- a non-zero wallet balance (`wallet_transactions` is the account of record — deleting the profile
  cascades the rows away and the ledger stops reconciling),
- funds in escrow (`held`) on either side of a job,
- a job in `assigned` / `confirmed` / `in_progress`,
- an open dispute.

Recommended shape: refuse with a 409 listing which of those apply, and let the user resolve them
first. A soft delete (an `deleted_at` on `profiles`, filtered out of every query) is the safer
implementation than a hard `auth.users` delete, because reviews, jobs, and ledger rows written by
this account must survive for the other party's history and for ML retraining — the
`recommendation_candidates` snapshots in particular (BACKEND_SCHEMA.md §13) are the retraining
data source and should not develop holes.

Note the Supabase Auth user has to be deleted (or disabled) as well as the profile row, or the
email cannot be reused and the JWT stays valid until expiry.

---

## 2. Wallet withdrawal / transfer

**Missing:** a real disbursement path.

The Withdraw and Transfer buttons on both Wallet screens have no handler. `POST
/wallet/transactions` exists but takes a free `direction` + `amount` + `title`, which is a
bookkeeping primitive, not a withdrawal — calling it from the app would let a user write their own
debit row with no money actually moving, and `kind` is meant to be server-derived (BACKEND_SCHEMA.md
§18/§21).

A withdrawal needs two things that don't exist yet:

1. **An endpoint that derives `kind = 'withdrawal'` itself**, validates the balance, and holds the
   amount pending rather than completing immediately.
2. **A payout rail.** Money currently only ever enters via the Stripe Checkout webhook. There is no
   configured way for it to leave — that is Stripe Connect (provider onboarding, a connected
   account per provider, `transfers`/`payouts`) or a local disbursement provider. This is the real
   work; the endpoint is small next to it.

Until a rail is chosen, leaving the buttons inert is the correct state. If you want an interim
step, a withdrawal *request* that lands in the admin console for manual settlement is a much
smaller change than Connect, and the admin console already has the surface for a queue.

Transfer (wallet → another user) is a separate question and probably shouldn't exist at all — it
turns the wallet into a money-transmission service, which is a licensing matter in PH, not an
engineering one.

---

## 3. Small: tell the job payload whether it has been reviewed

**Missing:** a `has_review` (or embedded `review`) field on the job object.

`GET /jobs/:id` returns no indication that the client already reviewed the job. The app now only
offers "Leave Review" on a `completed` job with an assigned provider, which removes the obviously
wrong cases, but a second review attempt still has to be discovered by submitting it and reading
the error.

A boolean on the existing payload is enough. This is a nice-to-have, not a defect.

---

## 4. Realtime chat

**Missing:** any push/subscribe transport for messages.

`GET /chat/:id/messages` is fetch-on-mount. There is no polling loop and no socket, so a
conversation only updates when the screen is reopened. The call and attachment buttons in the chat
header are decorative for the same reason — no signalling, and no attachment upload path on the
message endpoint (`/uploads/signed-url` could serve it, but `POST /chat/:id/messages` has nowhere
to put the resulting path).

Options, cheapest first: client-side polling while the screen is focused (no backend change at all,
and honestly adequate for this product); Supabase Realtime on the `messages` table (but the app
talks only to the API by design — see CLAUDE.md — so this would be the first exception); a
WebSocket gateway on the Nest side.

Worth deciding deliberately, since the "app never touches Supabase directly" rule is one of the
codebase's load-bearing conventions and option two breaks it.

---

## 5. Email OTP at registration

**Missing:** an OTP issue/verify pair.

The to-do list asks for email verification by OTP during signup. Supabase Auth's own email
confirmation already exists and `POST /auth/register` handles both the confirmed and unconfirmed
cases, so the first question is whether a hand-rolled OTP is wanted at all, or whether turning on
Supabase's confirmation email is the actual requirement.

If a real OTP is wanted, it needs `POST /auth/send-email-otp` and `POST /auth/verify-email-otp`,
a short-lived hashed-code table with an attempt counter, and rate limiting — the same shape as the
password-reset code flow in `docs/password-reset-setup.md`, which is a good template to copy.

The related to-do "create the automated email content" belongs with whoever owns the Supabase email
templates, not with the app.

---

## 6. Homeowner-direct card payment

**Missing:** nothing structural — this is a product decision.

Providers are done (Stripe Identity in `SPVerificationScreen`) and wallet top-ups run through
hosted Checkout, so a homeowner *can* already pay, via the wallet. What the to-do list calls
"integrate Stripe for both roles" is card-at-hire, bypassing the wallet.

That is a real fork: the escrow model in BACKEND_SCHEMA.md §7 assumes the budget is debited from a
wallet balance at hire. Paying by card at hire means either topping up silently behind the scenes
(easiest, keeps one ledger) or a second escrow path that never touches the wallet (a lot of new
surface, two sources of truth for held money). Recommend the former if it is wanted at all.

---

## 7. Still true from the earlier handoff

`docs/backend-handoff-booking-tasks-verification.md` §"Still not done" already covers **push
delivery** — the `notifications` table is written on every lifecycle event and the app polls it,
but there is no FCM/APNs transport, so nothing arrives on a lock screen. The mobile to-do item
"ensure notifications are delivered" is that same gap; `user_settings.push_enabled` is already
stored and waiting for a transport to consult it.
