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
  // These fixtures exercise the caller-supplied commission (rows with no locked rate, 0067).
  await db.query('update escrow_transactions set commission_rate = null where id = $1', [escrow]);
  return (await db.query("select escrow_settle($1, $2::escrow_status, 'released', 50, 'Warranty payout') as result",
    [escrow, expected])).rows[0].result;
}
async function payouts(job) {
  return (await db.query("select amount::float as amount from wallet_transactions where job_id = $1 and kind = 'payout'", [job])).rows;
}

it('refuses payout while work is going on, and releases as soon as the job is completed (0060)', async () => {
  const { job, escrow } = await heldJob();
  assert.equal(await release(escrow), null);
  assert.deepEqual(await payouts(job), []);
  await complete(job, '1 minute');
  assert.equal((await release(escrow)).status, 'released');
  assert.equal((await payouts(job)).length, 1);
});

it('releases exactly at 72 hours, only once, with commission and card transfer pending', async () => {
  const { job, escrow } = await heldJob('card');
  await complete(job);
  await db.transaction(async (tx) => {
    await tx.query("update jobs set completed_at = now() - interval '72 hours' where id = $1", [job]);
    await tx.query('update escrow_transactions set commission_rate = null where id = $1', [escrow]);
    const { rows: [{ result }] } = await tx.query("select escrow_settle($1, 'held', 'released', 50, 'Payout') as result", [escrow]);
    assert.equal(result.status, 'released');
    assert.equal(result.transfer_status, 'pending');
    assert.equal(Number(result.commission_amount), 50);
  });
  assert.equal(await release(escrow), null);
  assert.deepEqual(await payouts(job), [{ amount: 450 }]);
});

it('a complaint raised during work freezes money until admin resolution', async () => {
  const { job, escrow } = await heldJob();
  await db.query('select raise_job_dispute($1, $2, $3, null)', [job, client, 'Work quality']);
  assert.equal((await db.query('select status from escrow_transactions where id = $1', [escrow])).rows[0].status, 'disputed');
  await complete(job, '73 hours');
  assert.equal(await release(escrow), null);
  assert.deepEqual(await payouts(job), []);
  assert.equal((await release(escrow, 'disputed')).status, 'released');
  assert.equal(await release(escrow, 'disputed'), null);
  assert.deepEqual(await payouts(job), [{ amount: 450 }]);
});

it('an open complaint also blocks a stale held payment from automatic release', async () => {
  const { job, escrow } = await heldJob();
  await db.query('select raise_job_dispute($1, $2, $3, null)', [job, provider, 'Review requested']);
  await complete(job, '73 hours');
  // Simulate an old writer that restored held after the complaint was filed.
  await db.query("update escrow_transactions set status = 'held' where id = $1", [escrow]);
  assert.equal(await release(escrow), null);
  assert.deepEqual(await payouts(job), []);
});

it('refuses complaints on a completed job, but accepts one while work is in progress (0066)', async () => {
  const { job, escrow } = await heldJob();
  await complete(job);
  for (const [actor, reason] of [[client, 'Just completed'], [provider, 'Also provider']]) {
    await assert.rejects(db.query('select raise_job_dispute($1, $2, $3, null)', [job, actor, reason]), /before the job is confirmed done/);
  }
  await complete(job, '73 hours');
  await assert.rejects(db.query('select raise_job_dispute($1, $2, $3, null)', [job, client, 'Long after']), /before the job is confirmed done/);
  assert.equal((await db.query('select status from escrow_transactions where id = $1', [escrow])).rows[0].status, 'held');
  const open = await heldJob();
  const { rows: [c] } = await db.query('select * from raise_job_dispute($1, $2, $3, null)', [open.job, client, 'Mid-work']);
  assert.equal(c.status, 'open');
});

it('admin resolution can pay a disputed job', async () => {
  const { job, escrow } = await heldJob();
  await db.query('select raise_job_dispute($1, $2, $3, null)', [job, client, 'Review']);
  await complete(job);
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
