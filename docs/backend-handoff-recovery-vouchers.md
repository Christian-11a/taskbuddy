# Backend handoff — admin-issued recovery credits

> **Status: closed.** `POST /admin/wallet-transactions/recovery-credit` is built, tested and
> documented in `backend/BACKEND_SCHEMA.md` §28.1. This document is kept as the record of what
> was asked for and why; the "What's still yours" section below now describes what shipped and
> where it went beyond the sketch. The remaining item is the web console's **Issue Credit**
> button, which was waiting on this endpoint and is no longer blocked.

**Who this is for:** whoever holds the backend NestJS codebase and Supabase access. Written
against a user story; read "What's already done" first — most of it is already built.

> As a homeowner, I want to see dispute progress and receive recovery credit so my trust in the
> platform is rebuilt after a bad experience.
>
> - Job Details (Dispute) shows a step-by-step resolution timeline
> - Wallet's Recovery Vouchers section displays trust credits issued after resolution
> - admin can issue a credit/re-booking voucher directly from the transaction log

---

## Already done (mobile + Supabase side, no code needed from you)

- **Dispute progress timeline**: `mobile/app/(homeowner)/screens/HODisputeStatusScreen.tsx` (new)
  renders a 3-step Filed → Under Review → Resolved timeline, reading the already-existing
  `GET /jobs/:jobId/disputes`. `HOJobDetailScreen.tsx` now shows "View Dispute Status" instead of
  "File a Dispute" once one exists. **Nothing needed from you here** — this was built entirely on
  the existing endpoint. One honest caveat: since `disputes` is a single row with a current
  `status`/`resolution` rather than a real step-history table, the timeline is derived client-side
  (Filed = `created_at`, Resolved = `resolved_at` + `resolution`), not read from a genuine
  per-step log. If you ever want true step tracking (e.g. "admin requested more info" as its own
  timestamped step), that needs a new `dispute_events` table — not proposed here since nothing in
  the AC asks for more than three states.
- **Wallet screen's Recovery Vouchers section**: `HOWalletScreen.tsx` now renders a "Recovery
  Vouchers" card, filtering the existing transaction list on `kind === 'recovery_credit'`. It's
  empty today by design — there's nothing to show until you ship the issuance endpoint below — but
  needs no further mobile work once you do, since `GET /wallet` already `select('*')`s every
  column including `kind`.
- **Schema**: `backend/supabase/migrations/0021_recovery_credit_kind.sql` adds `'recovery_credit'`
  to the `wallet_txn_kind` enum (same idempotent `add value if not exists` pattern as 0018).
  **Applied and verified 2026-08-17** — the endpoint below can insert `kind: 'recovery_credit'`
  rows immediately, no migration step needed first.

## The issuance endpoint — built, with three guards the sketch did not have

> **Shipped.** `POST /admin/wallet-transactions/recovery-credit`, taking
> `{ profile_id, amount, title, job_id? }` and returning the ledger row. It follows the sketch
> below — same audit-log-then-notify pattern as `DisputesService.resolve()`, reusing
> `AdminActionsService` (`wallet.issue_recovery_credit`) rather than inventing a second audit
> path — and adds three refusals that the sketch would have written through:
>
> - **A deleted recipient.** Their Auth user is banned and their fields scrubbed (§27.1), so
>   nobody could ever sign in to spend the credit; it would only put an unreachable balance on
>   the platform's books.
> - **A `job_id` the recipient is not a party to.** The id makes the credit render inside that
>   job's history, so a mistyped one files somebody's compensation against a stranger's job. It
>   is typed by a human into a console field next to the amount.
> - **An amount over ₱50,000** (the `@Max` the sketch already suggested) — a typo guard, not a
>   policy.
>
> `ListWalletTxnQueryDto.kind` also accepts `'recovery_credit'` now, so the console's Wallet tab
> can filter to them. Without it the rows would be visible in the unfiltered list and unreachable
> by filter.
>
> **The fungible-vs-earmarked question below was answered "fungible."** Reasoning in
> `BACKEND_SCHEMA.md` §28.1: a restricted balance needs its own ledger and its own spend-time
> checks, and `wallet_transactions` being the single account of record is what makes the ledger
> reconcilable. A non-withdrawable voucher remains a real option, but it is a new table and a
> rule in the withdrawal path — not a flag on this row. Flag it back if product wants it.

**Nothing before this endpoint let an admin credit a wallet at all.** `WalletService.create()`
(`backend/src/wallet/wallet.service.ts:80-85`) explicitly refuses any `direction: 'credit'`
request from any caller — including admins — specifically to prevent free balance minting
(commit `0ea1c90`, "fix(wallet): refuse client-initiated wallet credits"). That refusal should
stay in place for the *user-facing* endpoint; what's missing is a **separate, admin-only** route
that's allowed to do what that one deliberately can't.

### Suggested shape

```ts
// wallet.dto.ts
export class IssueRecoveryCreditDto {
  @IsUUID() profile_id: string;
  @IsNumber() @Min(1) @Max(50_000) amount: number;
  @IsString() @MaxLength(200) title: string; // shown in the recipient's transaction list
  @IsOptional() @IsUUID() job_id?: string;    // ties it to the job/dispute it's compensating
}
```

```ts
// wallet.service.ts
async issueRecoveryCredit(admin: Profile, dto: IssueRecoveryCreditDto) {
  const { data, error } = await this.supabase.admin
    .from('wallet_transactions')
    .insert({
      profile_id: dto.profile_id,
      direction: 'credit',
      kind: 'recovery_credit',
      amount: dto.amount,
      title: dto.title,
      job_id: dto.job_id ?? null,
      status: 'completed',
    })
    .select('*')
    .single();
  if (error) throw new BadRequestException(error.message);

  await this.adminActions.record(admin, 'wallet.issue_recovery_credit', 'wallet_transactions', data.id, {
    profile_id: dto.profile_id, amount: dto.amount, job_id: dto.job_id ?? null,
  });
  await this.notify(dto.profile_id, 'Trust credit issued',
    `You received a ₱${dto.amount} credit: ${dto.title}`);

  return data;
}
```

```ts
// admin.controller.ts — alongside the existing wallet/dispute routes at :142 and :188
@Post('wallet-transactions/recovery-credit')
issueRecoveryCredit(@CurrentUser() admin: Profile, @Body() dto: IssueRecoveryCreditDto) {
  return this.walletService.issueRecoveryCredit(admin, dto);
}
```

Same audit-log + notify pattern `DisputesService.resolve()` already uses
(`disputes.service.ts:148-173`) — reuse `AdminActionsService` rather than inventing a second audit
path, and notify the recipient the same way disputes already do so it shows up in their in-app
notification list and (once EAS push is configured — see `mobile/README.md`) as a push.

### "credit/re-booking voucher" — one design note

The AC's wording ("credit/re-booking voucher") could mean two different things: a plain wallet
credit (spendable on anything, including a withdrawal) or an earmarked voucher that can only be
put toward a future booking. The shape above treats it as the former — a normal `wallet_transactions`
credit tagged `recovery_credit` for display purposes only, fully fungible once issued — since that
fits the existing architecture (wallet balance is the *only* account of record, and a second,
restricted balance would need its own ledger and spend-time checks). If product actually wants a
non-withdrawable, booking-only voucher, that's materially more work (a `spendable_kinds` rule in
the withdrawal path, or a separate `vouchers` table) and worth flagging back to us before building
it either way.

### Web admin — issue button

Once the endpoint above exists, the "issue directly from the transaction log" half of the AC is a
button on `web/src/components/pages/TransactionsPage.tsx`'s `WalletTab` (`:276`) — a modal capturing
`profile_id` (or a row-level "credit this user" action, since the tab already has each row's
`profile_id`), `amount`, and `title`, then `POST /admin/wallet-transactions/recovery-credit`. We'll
build that once the endpoint is live — no point wiring a button to a route that 404s.

---

## Summary of asks

| Item | Size | Blocked on |
|---|---|---|
| `wallet_txn_kind` gets `'recovery_credit'` | done | — applied and verified 2026-08-17 |
| Dispute progress timeline (mobile) | done | — built on the existing `GET /jobs/:jobId/disputes` |
| Wallet's Recovery Vouchers section (mobile) | done | — waiting on real data, not on more mobile work |
| `POST /admin/wallet-transactions/recovery-credit` | done | — built, tested, `BACKEND_SCHEMA.md` §28.1 |
| Web admin "Issue Credit" button | small | **unblocked** — the endpoint is live |
| Decide fungible credit vs. earmarked voucher | done | — answered "fungible"; see §28.1 for why, and flag it back if product disagrees |
