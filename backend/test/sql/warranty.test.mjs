import { before, after, it } from 'node:test';
import assert from 'node:assert/strict';
import { migratedDatabase, readMigration } from './harness.mjs';

let db;
const client = '11111111-1111-1111-1111-111111111111';
const provider = '22222222-2222-2222-2222-222222222222';
before(async () => {
  db = await migratedDatabase();
  for (const [id, role] of [[client, 'client'], [provider, 'provider']]) {
    await db.query('insert into auth.users(id, raw_user_meta_data) values ($1, $2)',
      [id, JSON.stringify({ role, full_name: role })]);
  }
  await db.query('insert into provider_profiles(profile_id, category_id, is_verified) values ($1, 1, true)', [provider]);
});
after(async () => { await db.close(); });

async function heldJob(method = 'wallet') {
  const { rows: [job] } = await db.query(`insert into jobs(client_id, category_id, title, description,
    address, latitude, longitude, assigned_provider_id, status, budget)
    values ($1, 1, 'Warranty repair', 'Repair the kitchen faucet.', 'QC', 14.6, 121, $2, 'in_progress', 500) returning id`,
    [client, provider]);
  await db.query(`insert into wallet_transactions(profile_id, direction, kind, status, amount, title)
    values ($1, 'credit', 'topup', 'completed', 500, 'Fixture funding')`, [client]);
  const { rows: [{ result }] } = await db.query(`select escrow_place_hold($1, $2, $3, $4, $5) as result`,
    [job.id, provider, method, method === 'card' ? `pi_${job.id}` : null, method === 'card' ? `ch_${job.id}` : null]);
  return { job: job.id, escrow: result.escrow.id };
}

async function complete(job, age = '0 hours') {
  await db.query("update jobs set status = 'completed' where id = $1", [job]);
  await db.query('update jobs set completed_at = now() - $2::interval where id = $1', [job, age]);
}
async function release(escrow, expected = 'held') {
  return (await db.query("select escrow_settle($1, $2::escrow_status, 'released', 50, 'Warranty payout') as result",
    [escrow, expected])).rows[0].result;
}
async function payouts(job) {
  return (await db.query("select amount::float as amount from wallet_transactions where job_id = $1 and kind = 'payout'", [job])).rows;
}

it('refuses automatic payout during work and just before 72 hours, without moving money', async () => {
  const { job, escrow } = await heldJob();
  assert.equal(await release(escrow), null);
  await complete(job, '71 hours 59 minutes');
  assert.equal(await release(escrow), null);
  assert.deepEqual(await payouts(job), []);
  assert.equal((await db.query('select status from escrow_transactions where id = $1', [escrow])).rows[0].status, 'held');
});

it('releases exactly at 72 hours, only once, with commission and card transfer pending', async () => {
  const { job, escrow } = await heldJob('card');
  await complete(job);
  await db.transaction(async (tx) => {
    await tx.query("update jobs set completed_at = now() - interval '72 hours' where id = $1", [job]);
    const { rows: [{ result }] } = await tx.query("select escrow_settle($1, 'held', 'released', 50, 'Payout') as result", [escrow]);
    assert.equal(result.status, 'released');
    assert.equal(result.transfer_status, 'pending');
    assert.equal(Number(result.commission_amount), 50);
  });
  assert.equal(await release(escrow), null);
  assert.deepEqual(await payouts(job), [{ amount: 450 }]);
});

it('a timely complaint freezes money beyond the deadline until admin resolution', async () => {
  const { job, escrow } = await heldJob();
  await complete(job, '71 hours');
  await db.query('select raise_job_dispute($1, $2, $3, null)', [job, client, 'Work quality']);
  await db.query("update jobs set completed_at = now() - interval '73 hours' where id = $1", [job]);
  assert.equal(await release(escrow), null);
  assert.deepEqual(await payouts(job), []);
  assert.equal((await release(escrow, 'disputed')).status, 'released');
  assert.equal(await release(escrow, 'disputed'), null);
  assert.deepEqual(await payouts(job), [{ amount: 450 }]);
});

it('an open complaint also blocks a stale held payment from automatic release', async () => {
  const { job, escrow } = await heldJob();
  await complete(job);
  await db.query('select raise_job_dispute($1, $2, $3, null)', [job, provider, 'Review requested']);
  // Simulate an old writer that restored held after the complaint was filed.
  await db.query("update escrow_transactions set status = 'held' where id = $1", [escrow]);
  await db.query("update jobs set completed_at = now() - interval '73 hours' where id = $1", [job]);
  assert.equal(await release(escrow), null);
  assert.deepEqual(await payouts(job), []);
});

it('rejects complaints at the exact deadline and after payout', async () => {
  const { job, escrow } = await heldJob();
  await complete(job);
  await assert.rejects(db.transaction(async (tx) => {
    await tx.query("update jobs set completed_at = now() - interval '72 hours' where id = $1", [job]);
    await tx.query('select raise_job_dispute($1, $2, $3, null)', [job, client, 'At deadline']);
  }), /three-day/);
  await db.query("update jobs set completed_at = now() - interval '73 hours' where id = $1", [job]);
  await release(escrow);
  await assert.rejects(db.query('select raise_job_dispute($1, $2, $3, null)', [job, provider, 'After payout']), /three-day/);
  assert.deepEqual(await payouts(job), [{ amount: 450 }]);
});

it('admin resolution can pay a disputed job before the warranty ends', async () => {
  const { job, escrow } = await heldJob();
  await complete(job);
  await db.query('select raise_job_dispute($1, $2, $3, null)', [job, client, 'Review']);
  assert.equal((await release(escrow, 'disputed')).status, 'released');
  assert.deepEqual(await payouts(job), [{ amount: 450 }]);
});

it('migration reapplication preserves existing payouts and service-role-only access', async () => {
  const { job, escrow } = await heldJob();
  await complete(job, '73 hours');
  await release(escrow);
  await db.exec(readMigration('0040_three_day_warranty.sql'));
  assert.equal(await release(escrow), null);
  assert.deepEqual(await payouts(job), [{ amount: 450 }]);
  for (const role of ['anon', 'authenticated']) {
    for (const signature of ['escrow_settle(uuid,escrow_status,escrow_status,numeric,text)', 'raise_job_dispute(uuid,uuid,text,text)']) {
      assert.equal((await db.query("select has_function_privilege($1, $2, 'EXECUTE') as allowed", [role, signature])).rows[0].allowed, false);
    }
  }
});
