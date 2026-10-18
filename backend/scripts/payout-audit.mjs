#!/usr/bin/env node
/**
 * Read-only check of provider payouts marked `completed` under the old rule
 * (before PR #103, a payout was marked completed as soon as Xendit accepted
 * the request). For each completed `XENDIT-<id>` payout since --since, asks
 * Xendit for the payout by reference and reports any whose real status is
 * not SUCCEEDED. Changes nothing: fix mismatches by hand after review.
 *
 * Usage (from backend/, with the API's env loaded):
 *   node --env-file=.env scripts/payout-audit.mjs [--since 2026-10-16]
 *
 * Needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and a test-mode
 * XENDIT_SECRET_KEY (xnd_development_...).
 */

const args = process.argv.slice(2);
const sinceIndex = args.indexOf('--since');
const since = sinceIndex >= 0 ? args[sinceIndex + 1] : '2026-10-16';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, XENDIT_SECRET_KEY } =
  process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !XENDIT_SECRET_KEY) {
  console.error(
    'Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and XENDIT_SECRET_KEY.',
  );
  process.exit(2);
}
if (!XENDIT_SECRET_KEY.startsWith('xnd_development_')) {
  console.error('Refusing to run with a non-test Xendit key.');
  process.exit(2);
}

const db = (path) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  }).then(async (res) => {
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    return res.json();
  });

const xendit = async (referenceId) => {
  const res = await fetch(
    `https://api.xendit.co/v2/payouts?reference_id=${encodeURIComponent(referenceId)}`,
    {
      headers: {
        authorization: `Basic ${Buffer.from(`${XENDIT_SECRET_KEY}:`).toString('base64')}`,
      },
    },
  );
  if (!res.ok) throw new Error(`Xendit ${res.status}`);
  const body = await res.json();
  const rows = Array.isArray(body) ? body : (body?.data ?? []);
  return rows.find((row) => row.reference_id === referenceId) ?? null;
};

const rows = await db(
  'wallet_transactions?select=id,profile_id,amount,review_note,created_at' +
    '&kind=eq.withdrawal&status=eq.completed&review_note=like.XENDIT-*' +
    `&created_at=gte.${encodeURIComponent(since)}&order=created_at.asc`,
);

let mismatches = 0;
for (const row of rows) {
  const stored = row.review_note.slice('XENDIT-'.length);
  let payout;
  try {
    payout = await xendit(row.id);
  } catch (err) {
    console.log(`? ${row.id} lookup failed: ${err.message}`);
    mismatches += 1;
    continue;
  }
  const status = payout?.status?.toUpperCase() ?? 'NOT_FOUND';
  const sameId = payout ? payout.id === stored : false;
  if (status !== 'SUCCEEDED' || !sameId) {
    mismatches += 1;
    console.log(
      `✗ ${row.id} profile=${row.profile_id} amount=${row.amount} ` +
        `stored=${stored} xendit=${payout?.id ?? '-'} status=${status}`,
    );
  }
}
console.log(
  `${rows.length} completed payout(s) since ${since}; ${mismatches} need a manual check.`,
);
process.exit(mismatches > 0 ? 1 : 0);
