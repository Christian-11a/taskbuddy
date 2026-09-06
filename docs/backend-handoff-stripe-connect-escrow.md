# Backend handoff — Stripe Connect escrow hold, and hardening the release path

> **Status: the two independent pieces are done; the decision is not.**
> Rate limiting (`@nestjs/throttler`) and the `EscrowService.release()` hardening both shipped —
> `backend/BACKEND_SCHEMA.md` §28.4 and §28.2. **Story 1 is untouched and still needs a call on
> Option A vs Option B before any code**, because it changes money-movement semantics described
> in `BACKEND_SCHEMA.md` §18/§21. Nothing below has been pre-empted by the work that landed.

**Who this is for:** whoever holds the backend NestJS codebase and Stripe dashboard access.
Written against two user stories; read "What's already done" first — one of the two stories is
mostly built already, and re-implementing it would be wasted work.

---

## Story 1 — escrow hold via Stripe Connect at booking

> As a homeowner, I want my payment held in escrow when I book so my money is protected before
> the service is done.
>
> - Stripe Connect creates a payment intent and escrow hold at booking confirmation
> - no raw payment credentials pass through or are stored on TaskBuddy servers
> - payment endpoints rate-limited
> - transaction status visible as `HELD` immediately after webhook capture

### This is a real architecture decision, not a bolt-on — read before starting

Today, escrow (`backend/src/escrow/escrow.service.ts`) is a **pure ledger hold against a
pre-funded wallet balance**. The client tops up their wallet ahead of time via
`POST /payments/topup` (a Stripe PaymentIntent/Checkout Session that only ever credits the wallet
through the signed webhook — see `BACKEND_SCHEMA.md` §21). Hiring a provider then debits that
already-present balance (`escrow.service.ts:42-83`) — no Stripe call happens at booking time at
all. There is no Stripe Connect anywhere in the codebase (`grep -r "stripe.transfers\|Connect" backend/src`
returns nothing), no connected-account column on `provider_profiles`, and providers are paid out
by crediting their in-app wallet, not by a real transfer to a bank account.

The AC as written describes a **different model**: a payment intent created per booking, held
(not captured, or captured-but-not-transferred) at confirmation, and later transferred to the
provider's own Stripe-connected account on release. That's a legitimate design — it's what "escrow
via Stripe Connect" usually means — but it changes money-movement semantics described in
`BACKEND_SCHEMA.md` §18/§21, and CLAUDE.md is explicit that wallet balance must stay
server-derived and single-sourced. Please make the call on one of these two shapes (or propose a
third) before writing code, since we don't want to hand you a schema that boxes in a decision that
is really yours:

**Option A — per-booking hold, wallet stays the ledger.** Create a manual-capture PaymentIntent at
booking confirmation for the job's budget. Capture it (or leave manual-capture until release) and
have the *capture webhook* — not the request that opens the sheet, consistent with how topups
already work — write the existing `escrow_transactions` row with `status: 'held'` and a new
`stripe_payment_intent_id` column. Release still moves the wallet ledger as today, but the payout
leg becomes a real transfer to the provider's connected account (`stripe.transfers.create`) instead
of a wallet credit. Smaller diff from what exists; keeps `wallet_transactions` as the audit trail
for both legs.

**Option B — full Connect destination charges.** The PaymentIntent is created with
`transfer_data.destination` set to the provider's connected account and `on_behalf_of`, so Stripe
holds and later moves the money without TaskBuddy's account being the intermediary. Requires
providers to complete Connect Express onboarding before they can be hired at all (a new
"provider isn't payment-ready yet" gate), and needs `application_fee_amount` if TaskBuddy takes a
cut. Cleaner long-term Stripe semantics; bigger change to the hire flow.

Either way, **no raw card data ever needs to touch the backend** — that AC bullet is already true
of the current PaymentSheet/Checkout pattern and stays true under both options, since the client
only ever exchanges tokens with Stripe directly.

### Concrete, low-ambiguity pieces (do these regardless of A vs B)

**Rate limiting — done.** `@nestjs/throttler` is now a dependency, a global `ThrottlerGuard`
applies a 240/min burst ceiling, `POST /payments/topup` and `POST /payments/checkout-session`
are narrowed to 5/min, the credential endpoints to 10/min, and `POST /payments/webhook` is
`@SkipThrottle()`d exactly as this section recommends. One caveat to carry into the Option A/B
work above: every one of those limits is **per endpoint per IP** — that is the throttler's own key
— so whatever new booking-payment endpoint gets added needs its own `@ThrottlePayments()`; it does
not inherit the ceiling from the routes next to it. One detail this section did not name and
which the limit does not work without: `main.ts` sets `trust proxy`, because behind Render's proxy
every request otherwise arrives from one address and a single abusive caller would rate-limit the
whole platform. Full reasoning, including the per-process storage caveat, in `BACKEND_SCHEMA.md`
§28.4.

The original ask, kept for the record:

```bash
npm install @nestjs/throttler
```

```ts
// app.module.ts
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 20 }]), // adjust per-route below
    // ...existing imports
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }, /* ...existing providers */],
})
```

Then tighten the payment-initiating routes specifically (topup, checkout-session, and whatever new
booking-payment endpoint Option A/B adds) with `@Throttle({ default: { limit: 5, ttl: 60_000 } })`
— they're the ones an abusive client could hammer to spam Stripe. Leave `POST /payments/webhook`
out of the throttle (or give it a much higher limit): it's Stripe calling you, authenticated by
signature, and Stripe retries on failure.

**Escrow status visible as `HELD`.** Whichever option is picked, the *webhook* (not the request
that opened the payment sheet) should be what flips `escrow_transactions.status` to `'held'` —
same non-negotiable pattern already used for wallet topups, for the same reason: never trust the
client's own report of payment success.

---

## Story 2 — homeowner confirms completion to release escrow

> As a homeowner, I want to confirm job completion to release escrowed funds so the provider is
> paid only for finished work.
>
> - Funds release only after homeowner taps Confirm Completion
> - duplicate release attempts on an already-released booking are blocked with an explicit error
> - DISPUTED bookings support an admin-triggered refund that notifies both parties

### Already done — please don't re-build this

- **`POST /jobs/:id/complete`** (`jobs.controller.ts:102-109`, `@Roles('client')`) already *is*
  the confirm-completion endpoint, already homeowner-only. `JobsService.complete()`
  (`jobs.service.ts:342-359`) verifies the caller is the job's client, requires
  `status === 'in_progress'`, sets the job to `completed`, and calls `escrow.release()`, which pays
  the provider. Mobile already calls it — the button is now labelled "Confirm Completion"
  (`mobile/app/(homeowner)/screens/HOJobDetailScreen.tsx`), gated on `job.status === 'in_progress'`
  and disabled while the request is in flight, so a double-tap can't fire two requests.
- **Duplicate release already gets an explicit error** at the layer the mobile app actually hits:
  a second `POST /jobs/:id/complete` on an already-`completed` job throws `400 Cannot complete a
  job in status 'completed'` (`jobs.service.ts:345-349`) before escrow is ever touched.
- **Admin-triggered dispute refund, with notifications to both parties, is fully built**:
  `POST /admin/disputes/:id/resolve` (`admin.controller.ts:188-194`) →
  `DisputesService.resolve()` (`disputes.service.ts:123-175`) calls `escrow.payOut()` or
  `escrow.refund()` per the admin's chosen resolution, records the admin action, and notifies
  **both** the client and provider (`disputes.service.ts:160-173`, `Promise.all([...])`) — those
  notifications also feed the existing push-notification sweep. Client-side dispute filing is also
  already wired: `mobile/app/(homeowner)/screens/HODisputeFilingScreen.tsx` calls
  `api.raiseDispute()` → `POST /jobs/:jobId/disputes`.

### One real gap: `EscrowService.release()`/`payOut()` degrade silently instead of erroring

> **Done, and slightly further than this asks.** `release()` now throws (`400` with no escrow,
> `409` when it is not `held`), and `payOut()`/`refund()` gained the same guard. Rather than
> leaving callers to catch the new exception, the job lifecycle calls a second method,
> `releaseIfHeld()`, which tolerates exactly the two absences a normal completion legitimately
> reaches it in — a job posted without a budget, and a disputed hold frozen for an admin — and
> still raises on an already-released one. That keeps `JobsService.complete()` behaving as it did
> while making the silent-success path unreachable from anywhere else.
>
> One addition this section did not ask for: `payOut()` and `refund()` now apply their terminal
> status through a conditional update that re-asserts the status they read, so two admins
> resolving one dispute produce one payout and one "already settled" rather than two credits.
> `BACKEND_SCHEMA.md` §28.2.
>
> The original description, for the record:

`escrow.service.ts:89-93`:

```ts
async release(jobId: string): Promise<EscrowRow | null> {
  const escrow = await this.findByJob(jobId);
  if (!escrow || escrow.status !== 'held') return null;
  return this.payOut(escrow);
}
```

The mobile path is safe today only because `JobsService.complete()` blocks the duplicate *before*
calling this — the job-status guard is what actually produces the AC's "explicit error." But
`EscrowService.release()` itself silently no-ops (`return null`) rather than raising, which means
any future caller that invokes it directly — e.g. Option A/B's release step above, or a retried
webhook — gets silent success instead of a clear signal that nothing happened. Worth hardening now
while it's a two-line change, rather than after Story 1 adds a second call site:

```ts
async release(jobId: string): Promise<EscrowRow> {
  const escrow = await this.findByJob(jobId);
  if (!escrow) throw new BadRequestException('No escrow hold exists for this job.');
  if (escrow.status !== 'held') {
    throw new ConflictException(`Escrow is already '${escrow.status}' — cannot release again.`);
  }
  return this.payOut(escrow);
}
```

(Same shape for `cancelForJob()`'s inline check if you want symmetry, though that one isn't named
in the AC.) Callers that currently treat a `null` return as "nothing to do" — check
`jobs.service.ts` and anywhere else that calls `escrow.release()` — will need to either catch the
new exception or be restructured so the guard they already have (job status) keeps making the
second call impossible; either is fine, just pick one so behavior doesn't regress.

### Note on "DISPUTED bookings" wording

There's no `DISPUTED` value on job/booking status — the dispute state lives on
`escrow_transactions.status = 'disputed'` and `disputes.status = 'open'`. Nothing needs to change
here; flagging it only so the AC's wording doesn't send you looking for an enum value that isn't
named that.

---

## Summary of asks

| Item | Size | Blocked on |
|---|---|---|
| Decide Option A vs B for Story 1 | decision | you — Stripe account design call |
| Stripe Connect onboarding + per-booking payment intent/hold | large | the decision above |
| `@nestjs/throttler` on payment-initiating routes | done | — `BACKEND_SCHEMA.md` §28.4 |
| `EscrowService.release()`/`payOut()` explicit-error hardening | done | — `BACKEND_SCHEMA.md` §28.2 |
| New `escrow_transactions` / `provider_profiles` columns for Option A/B | migration | the decision above — we'll write and apply it once you've picked, same as 0018–0020 |

Nothing here needs a Supabase migration yet — the schema addition depends on which payment shape
you pick, and guessing it now risks handing you a column layout you'd have to work around. Tell us
which option (or your own variant) and we'll draft the migration the same way as before.
