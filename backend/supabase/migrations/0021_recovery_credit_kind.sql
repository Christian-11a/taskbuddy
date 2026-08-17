-- TaskBuddy schema — recovery credit ledger kind
-- Source of truth: docs/backend-handoff-recovery-vouchers.md
--
-- Adds a way to tag a wallet ledger row as a trust credit an admin issued
-- after resolving a dispute, distinct from an ordinary 'adjustment'. Mobile's
-- Wallet screen filters on this to render its "Recovery Vouchers" section
-- (see HOWalletScreen.tsx); nothing reads it yet on the write side — no
-- endpoint issues this kind until the backend work in the handoff doc lands.
--
-- Safe to re-run: `alter type ... add value if not exists` is a no-op if the
-- value is already there.

alter type wallet_txn_kind add value if not exists 'recovery_credit';

comment on type wallet_txn_kind is
    'Wallet ledger row purpose. Platform revenue = completed rows where '
    'kind = ''payout''. ''recovery_credit'' = admin-issued trust credit after '
    'a dispute, shown in the app as a Recovery Voucher. Derived server-side, '
    'never accepted from a request body.';
