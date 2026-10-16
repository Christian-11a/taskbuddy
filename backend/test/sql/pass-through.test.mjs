/**
 * Migration 0056: no account keeps a balance. pass_through_balances() sends
 * clients' money back to their payment method and providers' money to their
 * linked GCash/Maya/bank account, as simulated payouts.
 */
import { it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { migratedDatabase } from './harness.mjs';

const CLIENT = '11111111-1111-1111-1111-111111111111';
const PROVIDER = '22222222-2222-2222-2222-222222222222';
let db;
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const balance = async (id) =>
  Number((await q('select wallet_available_balance($1) as b', [id]))[0].b);
const credit = (id, amount) =>
  q(
    `insert into wallet_transactions (profile_id, direction, kind, status, amount, title)
     values ($1, 'credit', 'topup', 'completed', $2, 'Payment')`,
    [id, amount],
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

it('holds a provider payout until an account is linked, then sends it there', async () => {
  await credit(PROVIDER, 1200);
  await q('select pass_through_balances()');
  assert.equal(await balance(PROVIDER), 1200);

  await q(
    `insert into linked_payout_accounts (profile_id, method, account_name, account_number)
     values ($1, 'gcash', 'Boy Plumber', '09171234567')`,
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
      `insert into linked_payout_accounts (profile_id, method, account_name, account_number)
       values ($1, 'bank', 'Boy Plumber', '1234567890')`,
      [PROVIDER],
    ),
  );
});
