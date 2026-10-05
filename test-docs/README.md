# Test-document implementation

Start with [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md). It maps the supplied
two-page PDF and screenshot folder to phased changes, product choices, gates and
remaining work. [VERIFICATION_MATRIX.md](VERIFICATION_MATRIX.md) tracks all 22
populated PDF requirements separately from deployed and physical-device evidence.

- [Theme verification](THEME_VERIFICATION.md): implementation evidence and device matrix.
- [Payout verification](PAYOUT_VERIFICATION.md): clearly labeled local receiving-ledger demo.
- [Simulator output](PAYOUT_SIMULATION_EVIDENCE.json): generated reconciled balances/references.
- [Release verification](RELEASE_VERIFICATION.md): local regression, release order and external gaps.

Phases 1–9 are implemented and verified locally. Phase 10 remains open until its
release/integration/device gates have evidence. No deployment or real payout is
proved by local tests. Run the project commands in each project's README; the
receiving demo runs from root with `node backend/scripts/payout-demo.mjs`.

Release work is authorized for the existing environments with sandbox payments
only. Dedicated QA client/provider accounts and the admin login are verified.
Upstream integration and its web gates passed; protected public backups exist.
Render access is verified; the user lacks Vercel access, so its owner must
release the web changes. Local public-data restore and independent connection
checks passed; full Supabase recovery and deployed/device gates remain open. See the release record for scope and evidence.

[Deployed release evidence](DEPLOYED_RELEASE_EVIDENCE.json) records the applied
0039–0045 registry, private bucket, exact Render revision and ten role/API smoke
checks. These checks leave full state-change/payment and physical-device gates open.
