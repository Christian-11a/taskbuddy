import { before, after, it } from 'node:test';
import assert from 'node:assert/strict';
import { migratedDatabase, readMigration } from './harness.mjs';

const client = '11111111-1111-1111-1111-111111111111';
const provider = '22222222-2222-2222-2222-222222222222';
const rival = '33333333-3333-3333-3333-333333333333';
let db;

before(async () => {
  db = await migratedDatabase();
  for (const [id, role] of [[client, 'client'], [provider, 'provider'], [rival, 'provider']]) {
    await db.query('insert into auth.users(id, raw_user_meta_data) values ($1, $2)',
      [id, JSON.stringify({ role, full_name: role })]);
  }
  for (const id of [provider, rival]) {
    await db.query('insert into provider_profiles(profile_id, category_id, is_verified) values ($1, 1, true)', [id]);
  }
  await db.query(`insert into wallet_transactions(profile_id, direction, kind, amount, title)
    values ($1, 'credit', 'topup', 10000, 'Local fixture')`, [client]);
});
after(async () => { await db.close(); });

async function post(scheduledAt = null) {
  const { rows: [job] } = await db.query(`insert into jobs(client_id, category_id, title, description,
    address, latitude, longitude, budget, scheduled_at)
    values ($1, 1, 'Repair tap', 'Repair the leaking kitchen tap.', 'QC', 14.6, 121, 500, $2) returning *`,
    [client, scheduledAt]);
  const { rows: applications } = await db.query(`insert into job_applications(job_id, provider_id)
    values ($1, $2), ($1, $3) returning *`, [job.id, provider, rival]);
  return { job, application: applications.find((a) => a.provider_id === provider),
    sibling: applications.find((a) => a.provider_id === rival) };
}

for (const funding of ['wallet', 'card']) {
  it(`${funding} hire confirms without starting work, creates an ASAP booking, and replays safely`, async () => {
    const { job, application, sibling } = await post();
    const hold = funding === 'wallet' ? 'select escrow_place_hold($1, $2)' :
      "select escrow_place_hold($1, $2, 'card', 'pi_test', 'ch_test')";
    await db.query(hold, [job.id, provider]);
    await db.query("update job_applications set status = 'accepted' where id = $1", [application.id]);
    const { rows: [hired] } = await db.query('select * from jobs where id = $1', [job.id]);
    assert.equal(hired.status, 'confirmed');
    assert.equal(hired.assigned_provider_id, provider);
    const { rows: [booking] } = await db.query('select * from bookings where job_id = $1', [job.id]);
    assert.equal(booking.scheduled_at.getTime(), hired.assigned_at.getTime());
    const { rows: [conversation] } = await db.query('select * from conversations where job_id = $1', [job.id]);
    assert.equal(conversation.client_id, client);
    assert.equal(conversation.provider_id, provider);
    assert.equal((await db.query('select status from job_applications where id = $1', [sibling.id])).rows[0].status, 'rejected');
    assert.equal((await db.query('select status from escrow_transactions where job_id = $1', [job.id])).rows[0].status, 'held');
    await db.query(hold, [job.id, provider]);
    await db.query("update job_applications set status = 'accepted' where id = $1", [application.id]);
    assert.equal((await db.query('select * from bookings where job_id = $1', [job.id])).rows.length, 1);
    assert.equal((await db.query('select * from conversations where job_id = $1', [job.id])).rows.length, 1);
    assert.equal((await db.query("select * from wallet_transactions where job_id = $1 and kind = 'escrow_hold'", [job.id])).rows.length, 1);
    await assert.rejects(db.query("update job_applications set status = 'accepted' where id = $1", [sibling.id]), { code: '23505' });
    assert.equal((await db.query('select assigned_provider_id from jobs where id = $1', [job.id])).rows[0].assigned_provider_id, provider);
  });
}

it('keeps future scheduling and locks checklist until the provider starts work', async () => {
  const scheduled = '2030-10-05T09:00:00.000Z';
  const { job, application } = await post(scheduled);
  await db.query('select escrow_place_hold($1, $2)', [job.id, provider]);
  await db.query("update job_applications set status = 'accepted' where id = $1", [application.id]);
  const { rows: [booking] } = await db.query('select * from bookings where job_id = $1', [job.id]);
  assert.equal(booking.scheduled_at.toISOString(), scheduled);
  const { rows: [task] } = await db.query("insert into job_tasks(job_id, label, position) values ($1, 'Repair tap', 0) returning id", [job.id]);
  await assert.rejects(db.query('update job_tasks set is_done = true, completed_at = now() where id = $1', [task.id]), /Start the job/);
  await db.query("update jobs set status = 'in_progress' where id = $1", [job.id]);
  await db.query('update job_tasks set is_done = true, completed_at = now() where id = $1', [task.id]);
});

it('promotes historical assignments without changing closed work, dates, or existing bookings', async () => {
  const { job } = await post();
  await db.query(`update jobs set assigned_provider_id = $2, status = 'assigned',
    assigned_at = '2026-09-20T09:00:00Z' where id = $1`, [job.id, provider]);
  const { job: closed } = await post();
  await db.query("update jobs set status = 'cancelled' where id = $1", [closed.id]);
  await db.exec(readMigration('0039_confirm_jobs_on_hire.sql'));
  const { rows: [promoted] } = await db.query('select * from jobs where id = $1', [job.id]);
  assert.equal(promoted.status, 'confirmed');
  assert.equal(promoted.assigned_at.toISOString(), '2026-09-20T09:00:00.000Z');
  const { rows: [booking] } = await db.query('select * from bookings where job_id = $1', [job.id]);
  assert.equal(booking.scheduled_at.getTime(), promoted.assigned_at.getTime());
  await db.exec(readMigration('0039_confirm_jobs_on_hire.sql'));
  assert.equal((await db.query('select * from bookings where job_id = $1', [job.id])).rows[0].id, booking.id);
  assert.equal((await db.query('select status from jobs where id = $1', [closed.id])).rows[0].status, 'cancelled');
});
