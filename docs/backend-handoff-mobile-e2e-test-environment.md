# Backend/infra handoff — mobile e2e test environment blockers

**Status: open.** Three items surfaced by the mobile Maestro e2e sweep (see `mobile/maestro/`)
that need DB/dashboard/credential access the test session doesn't have. None of these are code
bugs to fix in this repo beyond the one-line config change noted in item 1 — they're
access/credential items for whoever holds the Google Cloud project and Supabase dashboard.

**Who this is for:** whoever holds the Google Cloud Console project (for the Maps key) and
Supabase dashboard/SQL access for the `taskbuddy-kpek` project. Read top to bottom — item 1 is
the one currently blocking test progress.

---

## 1. Google Maps API key — missing entirely, crashes job creation (blocking)

**Severity: critical, blocking all mobile e2e testing of job creation (Phase 3) and, transitively,
the cross-role hire loop (Phase 5), which needs a job to exist.**

`mobile/app/(homeowner)/screens/HOCreateJobScreen.tsx` renders a `react-native-maps` `MapView`
unconditionally on the job-creation wizard's Location step. `react-native-maps` needs a Google
Maps Platform API key wired into Android's `AndroidManifest.xml` via
`com.google.android.geo.API_KEY`. **This was never configured** — checked directly: `app.json`
has no `android.config.googleMaps.apiKey` and no `react-native-maps` plugin entry, so the
prebuild-generated `AndroidManifest.xml` has no such meta-data either. This isn't a regression;
the key was never wired up for this screen.

**Result:** the app fatally crashes (process death, confirmed via logcat and `adb shell pidof`)
the moment a user reaches the Location step of Post a Job — reproduced identically whether
"Use your default location" or "Enter custom" is chosen. Full repro steps, logcat, and root-cause
detail are in `mobile/maestro/bug-log.md`, BUG-004.

**What's needed:**

1. A Google Maps Platform API key (Android) from the Google Cloud project this app should bill
   against — restricted to the Android Maps SDK, keyed to `com.taskbuddy.app`'s SHA-1 for
   release builds (a dev/debug key with no restriction is fine for the emulator in the meantime).
2. Add it to `mobile/app.json`:
   ```json
   "android": {
     "config": { "googleMaps": { "apiKey": "<key>" } }
   }
   ```
3. Regenerate the native project and rebuild the dev client (native config change):
   ```bash
   npx expo prebuild --clean --platform android
   npx expo run:android
   ```

Once this lands, the mobile e2e sweep can resume Phase 3 immediately — nothing else is blocking
job creation.

---

## 2. Test wallet balance — client test account has ₱0

**Severity: blocks Phase 5 (hire → escrow) and Phase 6 (wallet/withdraw) testing only** —
everything before hiring (Phases 1–4) is unaffected.

`maestro.client@taskbuddy.test` (the persistent client test account on
`taskbuddy-kpek.onrender.com`) has no wallet balance, so it can't hire a provider (hiring debits
the job budget from the wallet into escrow — see `BACKEND_SCHEMA.md` §15.1/§18). There's no
payment-gateway-free way to credit a wallet from the client (by design — `WalletService.create()`
explicitly refuses client-initiated credits to prevent balance minting), so this needs a direct
SQL insert against the ledger:

```sql
-- Seeds the persistent maestro.client test account with spendable balance for
-- Phase 5 (escrow) / Phase 6 (wallet, withdraw) mobile e2e testing.
-- Safe to re-run; wallet balance is always derived (sum of completed
-- transactions), never stored, so this just adds one more ledger row.
insert into wallet_transactions (profile_id, direction, kind, status, amount, title)
select p.id, 'credit', 'topup', 'completed', 50000, 'Maestro e2e test seed'
from profiles p
join auth.users u on u.id = p.id
where u.email = 'maestro.client@taskbuddy.test';
```

Adjust the amount if a specific test scenario needs more headroom (e.g. multiple hires in one
sweep). This can be re-run any time balance runs low.

---

## 3. `recommendation_deadline` nudge — needed per test job, not a one-time setup

**Severity: doesn't block testing, but the alternative is waiting 5–15 real minutes per job**
(the urgency-dependent recommendation deadline — see `BACKEND_SCHEMA.md` §9).

To exercise the ML recommendation path without an in-app "hire immediately" flow (Phase 4/5 —
provider needs to receive an invite), a job's `recommendation_deadline` can be pulled into the
past so the every-minute cron flips it to `recommending` on its next tick:

```sql
-- Run after posting a test job as the client, once its id is known (from the
-- app or GET /jobs). Only affects jobs still 'open' — no-op otherwise.
update jobs
set recommendation_deadline = now() - interval '1 minute'
where id = '<job id>'
  and status = 'open';
```

This is a per-job nudge, not a standing config change — there's no way around needing SQL access
each time a test run wants to skip the real-time wait, since the test session has no
service-role/SQL access of its own (by design — the NestJS API holds that key, not the mobile
client or the test harness).

---

## Summary of asks

| Item | Blocks | Size | Needs |
|---|---|---|---|
| Google Maps API key + `app.json` config | Phase 3, transitively Phase 5 | small (one key + one-line config + rebuild) | Google Cloud Console access |
| Wallet balance seed SQL | Phase 5, Phase 6 | trivial (one insert) | Supabase SQL/dashboard access |
| `recommendation_deadline` nudge SQL | Nothing (workaround exists: wait 5-15 min) | trivial, but recurring per test job | Supabase SQL/dashboard access |
