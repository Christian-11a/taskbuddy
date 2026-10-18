/**
 * Migration 0056: no account keeps a balance. pass_through_balances() sends
 * clients' money back to their payment method and providers' money to their
 * linked GCash/Maya/bank account, as simulated payouts.
 */
import { it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { migratedDatabase, APPROVED_CREDENTIAL_SQL } from './harness.mjs';

const CLIENT = '11111111-1111-1111-1111-111111111111';
const PROVIDER = '22222222-2222-2222-2222-222222222222';
let db;
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const balance = async (id) =>
  Number((await q('select wallet_available_balance($1) as b', [id]))[0].b);
// Old enough by default that 0073's grace period for fresh payments is over.
const credit = (id, amount, ageMinutes = 30) =>
  q(
    `insert into wallet_transactions (profile_id, direction, kind, status, amount, title, created_at)
     values ($1, 'credit', 'topup', 'completed', $2, 'Payment', now() - make_interval(mins => $3))`,
    [id, amount, ageMinutes],
  );

beforeEach(async () => {
  db = await migratedDatabase();
  for (const [id, role] of [[CLIENT, 'client'], [PROVIDER, 'provider']]) {
    await q(
      `insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`,
      [id, `${id}@taskbuddy.test`, JSON.stringify({ role, full_name: role })],
    );
  }
});

it('refunds a client balance to the original payment method', async () => {
  await credit(CLIENT, 1500);
  assert.equal((await q('select pass_through_balances() as n'))[0].n, 1);
  assert.equal(await balance(CLIENT), 0);
  const [row] = await q(
    `select title, withdrawal_destination, review_note from wallet_transactions
      where profile_id = $1 and direction = 'debit'`,
    [CLIENT],
  );
  assert.equal(row.withdrawal_destination, 'Original payment method');
  assert.match(row.review_note, /^SIM-/);
});

it('leaves a fresh client payment for its hold instead of refunding it (0073)', async () => {
  const before = await balance(CLIENT);
  await credit(CLIENT, 800, 1);
  assert.equal((await q('select pass_through_balances($1) as n', [CLIENT]))[0].n, 0);
  assert.equal(await balance(CLIENT), before + 800);
  // Past the grace period an unused payment goes back as before.
  await q(
    `update wallet_transactions set created_at = now() - interval '20 minutes'
      where profile_id = $1 and direction = 'credit' and amount = 800`,
    [CLIENT],
  );
  assert.equal((await q('select pass_through_balances($1) as n', [CLIENT]))[0].n, 1);
  assert.equal(await balance(CLIENT), before);
});

it('holds a provider payout until an account is linked, then sends it there', async () => {
  await credit(PROVIDER, 1200);
  await q('select pass_through_balances()');
  assert.equal(await balance(PROVIDER), 1200);

  await q(
    `insert into linked_payout_accounts (profile_id, method, channel_code, account_name, account_number)
     values ($1, 'gcash', 'PH_GCASH', 'Boy Plumber', '09171234567')`,
    [PROVIDER],
  );
  await q('select pass_through_balances($1)', [PROVIDER]);
  assert.equal(await balance(PROVIDER), 0);
  const [row] = await q(
    `select withdrawal_destination from wallet_transactions
      where profile_id = $1 and direction = 'debit'`,
    [PROVIDER],
  );
  assert.equal(row.withdrawal_destination, 'GCash ••••4567');
});

it('requires a bank name for bank accounts only', async () => {
  await assert.rejects(
    q(
      `insert into linked_payout_accounts (profile_id, method, channel_code, account_name, account_number)
       values ($1, 'bank', 'PH_BPI', 'Boy Plumber', '1234567890')`,
      [PROVIDER],
    ),
  );
});

it('queues a provider payout for Xendit instead of marking it sent (0058)', async () => {
  await credit(PROVIDER, 900);
  await q(
    `insert into linked_payout_accounts (profile_id, method, channel_code, account_name, account_number)
     values ($1, 'maya', 'PH_PAYMAYA', 'Boy Plumber', '09181234567')`,
    [PROVIDER],
  );
  await q('select pass_through_balances($1, true)', [PROVIDER]);
  const [row] = await q(
    `select status, review_note, withdrawal_destination from wallet_transactions
      where profile_id = $1 and direction = 'debit'`,
    [PROVIDER],
  );
  assert.equal(row.status, 'pending');
  assert.equal(row.review_note, 'Sending via Xendit');
  assert.equal(row.withdrawal_destination, 'Maya ••••4567');
  // The pending debit reserves the money: a second pass sends nothing more.
  assert.equal((await q('select pass_through_balances($1, true) as n', [PROVIDER]))[0].n, 0);
});

it('refuses a channel code that does not match the method', async () => {
  await assert.rejects(
    q(
      `insert into linked_payout_accounts (profile_id, method, channel_code, account_name, account_number)
       values ($1, 'gcash', 'PH_PAYMAYA', 'Boy Plumber', '09171234567')`,
      [PROVIDER],
    ),
  );
});

it('keeps the admin commission: only the amount after commission is paid out (0056, 0060)', async () => {
  await q(`insert into provider_profiles (profile_id, category_id, bio, identity_verified)
           values ($1, 1, 'Licensed plumber for ten years.', true)`, [PROVIDER]);
  await q(APPROVED_CREDENTIAL_SQL, [PROVIDER, 1]);
  await q(
    `insert into linked_payout_accounts (profile_id, method, channel_code, account_name, account_number)
     values ($1, 'gcash', 'PH_GCASH', 'Boy Plumber', '09171234567')`,
    [PROVIDER],
  );
  const [{ id: job }] = await q(
    `insert into jobs (client_id, category_id, title, description, address, latitude, longitude, budget, recommendation_deadline, assigned_provider_id, status)
     values ($1, 1, 'Fix kitchen faucet', 'Tumutulo yung gripo sa kusina, need ayusin.', 'QC', 14.6, 121.0, 3000, now(), $2, 'in_progress')
     returning id`,
    [CLIENT, PROVIDER],
  );
  await credit(CLIENT, 3000);
  const [{ id: escrow }] = await q(
    `insert into escrow_transactions (job_id, client_id, provider_id, amount, status) values ($1, $2, $3, 3000, 'held') returning id`,
    [job, CLIENT, PROVIDER],
  );
  await q(`insert into wallet_transactions (profile_id, direction, kind, status, amount, title, job_id)
           values ($1, 'debit', 'escrow_hold', 'completed', 3000, 'Hold', $2)`, [CLIENT, job]);
  await q(`update jobs set status = 'completed' where id = $1`, [job]);

  // 15% admin commission, as EscrowService.payOut computes it from platform_settings.
  await q("update escrow_transactions set commission_rate = null where id = $1", [escrow]); // caller-supplied commission (no locked rate, 0067)
  const [{ r }] = await q(`select escrow_settle($1, 'held', 'released', 450, 'Payout') as r`, [escrow]);
  assert.equal(Number(r.commission_amount), 450);

  await q('select pass_through_balances($1, true)', [PROVIDER]);
  const [payout] = await q(
    `select amount, status from wallet_transactions where profile_id = $1 and kind = 'withdrawal'`,
    [PROVIDER],
  );
  assert.equal(Number(payout.amount), 2550);
  assert.equal(await balance(PROVIDER), 0);
});
