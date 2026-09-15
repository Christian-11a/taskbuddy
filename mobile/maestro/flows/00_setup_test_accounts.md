# 00 — Test account setup

A runbook, not a flow. Run once; the other flows assume its result.

Registration is a multi-step form with role selection, consent checkboxes and
a category picker, and automating it *is* Phase 1's job (`auth_signup_*`).
Building throwaway automation for it here would be doing it twice. So
registration happens by hand, and what gets recorded is the SQL — the part
nobody will remember six weeks from now.

## 1. Register both accounts through the app

| Field | Client | Provider |
|---|---|---|
| Email | `maestro.client@taskbuddy.test` | `maestro.provider@taskbuddy.test` |
| Password | `TestPass123!` | `TestPass123!` |
| Full name | `Maestro Client` | `Maestro Provider` |
| Role | Homeowner | Service Provider |
| Category | — | Plumbing |

Accept every consent checkbox. **Stop at the OTP screen** — do not try to
enter a code. The account already exists at that point, merely unconfirmed;
step 2 confirms it directly.

These are throwaway dev-project accounts on a test domain, not real secrets.

## 2. Confirm both accounts

Email confirmation is enabled on this Supabase project, and the free tier caps
confirmation mail at 4/hour shared with password resets — so the mailbox is
both unreadable to Maestro and rate-limited. Confirm directly instead:

```sql
update auth.users
   set email_confirmed_at = now()
 where email like '%@taskbuddy.test'
   and email_confirmed_at is null;

-- Expect 2 rows.
select email, email_confirmed_at
  from auth.users
 where email like '%@taskbuddy.test';
```

## 3. Fund the client wallet

`profiles` has no email column — it keys off `auth.users.id` — so this joins.

```sql
insert into wallet_transactions
    (profile_id, direction, kind, amount, title, status)
select p.id, 'credit', 'topup', 50000, 'Maestro test seed', 'completed'
  from profiles p
  join auth.users u on u.id = p.id
 where u.email = 'maestro.client@taskbuddy.test';

-- Expect one row, 50000.00, completed.
select u.email, w.kind, w.amount, w.status
  from wallet_transactions w
  join auth.users u on u.id = w.profile_id
 where u.email like '%@taskbuddy.test';
```

Balance is derived, never stored (`BACKEND_SCHEMA.md` §18), so this one
completed credit *is* the balance — there is no cached total to update
alongside it.

Hiring debits escrow, so a client with no balance cannot exercise the
core loop at all. That is why this is seeded rather than earned through
Stripe Checkout on every run.

## 4. Verify

Sign in as each account by hand. Both should reach a home screen — the
onboarding slides appear first, which is expected and is what the login
helpers handle.

If sign-in reports the address is not confirmed, step 2 did not take. Re-run
its select and check the row count.

## Re-running

Re-run the confirm SQL after recreating accounts. The funding insert is **not**
idempotent — running it twice credits ₱100,000. To reset a wallet instead of
topping it up:

```sql
delete from wallet_transactions
 where title = 'Maestro test seed'
   and profile_id in (
       select p.id from profiles p join auth.users u on u.id = p.id
        where u.email like '%@taskbuddy.test'
   );
```

Do not point this at anything but `@taskbuddy.test` accounts.
