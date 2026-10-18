/** Migration 0067: the platform fee is locked on the escrow when it is held. */
import { before, after, it } from 'node:test';
import assert from 'node:assert/strict';
import { migratedDatabase } from './harness.mjs';

let db;
const client = '11111111-1111-1111-1111-111111111111';
const provider = '22222222-2222-2222-2222-222222222222';
const admin = '33333333-3333-3333-3333-333333333333';
const query = async (sql, args = []) => (await db.query(sql, args)).rows;
const rpc = async (sql, args = []) => (await query(`select to_jsonb(${sql}) as result`, args))[0].result;
const setRate = (rate) => query('update platform_settings set commission_rate = $1 where id = true', [rate]);

before(async () => {
  db = await migratedDatabase();
  for (const [id, role] of [[client, 'client'], [provider, 'provider'], [admin, 'admin']]) {
    await query('insert into auth.users(id, raw_user_meta_data) values ($1, $2)', [id, JSON.stringify({ role, full_name: role })]);
  }
  await query('insert into provider_profiles(profile_id, category_id, is_verified) values ($1, 1, true)', [provider]);
});
after(async () => { await db.close(); });

async function hiredJob(budget = 1000) {
  const [{ id }] = await query(`insert into jobs(client_id, category_id, title, description, address, latitude, longitude, assigned_provider_id, status, budget)
    values ($1, 1, 'Case repair', 'Repair a leaking kitchen faucet and verify the water pressure.', 'QC', 14.6, 121, $2, 'in_progress', $3) returning id`, [client, provider, budget]);
  await query("insert into wallet_transactions(profile_id, direction, kind, status, amount, title) values ($1, 'credit', 'topup', 'completed', 1000, 'Fixture funding')", [client]);
  await rpc('escrow_place_hold($1, $2)', [id, provider]);
  return id;
}
const escrow = async (id) => (await query('select * from escrow_transactions where job_id = $1', [id]))[0];
const payoutOf = async (id) => Number((await query("select amount from wallet_transactions where job_id = $1 and kind = 'payout'", [id]))[0].amount);
async function releaseByAdmin(id) {
  const c = await rpc('raise_job_dispute($1,$2,$3,null)', [id, client, 'Work quality']);
  await rpc('resolve_job_dispute($1,$2,$3,$4)', [c.id, admin, 'released_to_provider', 'Reviewed both statements.']);
}

it('stamps the current rate when the escrow is held and keeps it when the platform rate changes', async () => {
  await setRate(0.1);
  const id = await hiredJob();
  assert.equal(Number((await escrow(id)).commission_rate), 0.1);

  await setRate(0.2);
  assert.equal(Number((await escrow(id)).commission_rate), 0.1, 'changing the setting does not touch a held escrow');

  await releaseByAdmin(id);
  const released = await escrow(id);
  assert.equal(released.status, 'released');
  assert.equal(Number(released.commission_amount), 100, 'commission uses the hire-time 10%, not the current 20%');
  assert.equal(await payoutOf(id), 900);
});

it('falls back to the current rate when the escrow has no locked rate', async () => {
  await setRate(0.1);
  const id = await hiredJob();
  await query('update escrow_transactions set commission_rate = null where job_id = $1', [id]);
  await setRate(0.2);

  await releaseByAdmin(id);
  assert.equal(Number((await escrow(id)).commission_amount), 200);
  assert.equal(await payoutOf(id), 800);
});

it('re-stamps the rate when a cancelled escrow is held again', async () => {
  await setRate(0.1);
  const id = await hiredJob();
  await rpc(`escrow_settle((select id from escrow_transactions where job_id = $1), 'held', 'cancelled', 0, 'Refund')`, [id]);
  await setRate(0.15);
  await rpc('escrow_place_hold($1, $2)', [id, provider]);
  assert.equal(Number((await escrow(id)).commission_rate), 0.15);
});

it('rounds like PostgreSQL numeric: 160.45 at 10% is a 16.05 fee', async () => {
  await setRate(0.1);
  const id = await hiredJob(160.45);
  await releaseByAdmin(id);
  assert.equal(Number((await escrow(id)).commission_amount), 16.05);
  assert.equal(await payoutOf(id), 144.4);
});

it('escrow_settle ignores p_commission when a rate is locked', async () => {
  await setRate(0.1);
  const id = await hiredJob();
  await setRate(0.2);
  await query("update jobs set status = 'completed', completed_at = now() where id = $1", [id]);
  // An old API instance would pass the current 20% commission (200).
  await rpc(`escrow_settle((select id from escrow_transactions where job_id = $1), 'held', 'released', 200, 'Payout')`, [id]);
  assert.equal(Number((await escrow(id)).commission_amount), 100);
  assert.equal(await payoutOf(id), 900);
});
