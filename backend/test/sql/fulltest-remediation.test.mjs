import { before, after, it } from 'node:test';
import assert from 'node:assert/strict';
import { migratedDatabase } from './harness.mjs';
let db;
const client = '11111111-1111-1111-1111-111111111111';
const provider = '22222222-2222-2222-2222-222222222222';
before(async () => {
  db = await migratedDatabase();
  for (const [id, role] of [[client, 'client'], [provider, 'provider']]) {
    await db.query('insert into auth.users(id, raw_user_meta_data) values ($1, $2)', [id, JSON.stringify({ role, full_name: role })]);
  }
  await db.query('insert into provider_profiles(profile_id, category_id, is_verified) values ($1, 1, true)', [provider]);
});
after(async () => { await db.close(); });
async function job(status = 'in_progress') {
  const { rows: [row] } = await db.query(`insert into jobs(client_id, category_id, title, description, address, latitude, longitude,
    assigned_provider_id, status, budget) values ($1, 1, 'Test repair', 'Repair a broken kitchen tap.', 'QC', 14.6, 121, $2, $3, 500) returning *`, [client, provider, status]);
  await db.query('insert into escrow_transactions(job_id, client_id, provider_id, amount) values ($1, $2, $3, 500)', [row.id, client, provider]);
  return row;
}
it('cancellation after starting freezes funds and keeps the job and evidence for admins', async () => {
  const row = await job();
  await db.query("update jobs set status = 'cancelled' where id = $1", [row.id]);
  const { rows: [payment] } = await db.query('select status from escrow_transactions where job_id = $1', [row.id]);
  assert.equal(payment.status, 'disputed');
  const { rows: [complaint] } = await db.query('select * from disputes where job_id = $1', [row.id]);
  assert.equal(complaint.status, 'open');
  assert.equal(complaint.raised_by, client);
  assert.equal((await db.query('select * from jobs where id = $1', [row.id])).rows.length, 1);
  assert.equal((await db.query('select * from wallet_transactions where job_id = $1', [row.id])).rows.length, 0);
});
it('accepts warranty complaints within three days without reopening released money', async () => {
  const row = await job();
  await db.query("update jobs set status = 'completed' where id = $1", [row.id]);
  await db.query("update escrow_transactions set status = 'released', released_at = now() where job_id = $1", [row.id]);
  await db.query('select raise_job_dispute($1, $2, $3, null)', [row.id, client, 'Work quality']);
  assert.equal((await db.query('select status from escrow_transactions where job_id = $1', [row.id])).rows[0].status, 'released');
  await assert.rejects(db.query('select raise_job_dispute($1, $2, $3, null)', [row.id, client, 'Duplicate']), /already an open complaint/);
});
it('rejects expired warranty complaints and outsiders', async () => {
  const row = await job();
  await assert.rejects(db.query('select raise_job_dispute($1, $2, $3, null)', [row.id, '33333333-3333-3333-3333-333333333333', 'Nope']), /Not your job/);
  await db.query("update jobs set status = 'completed' where id = $1", [row.id]);
  await db.query("update jobs set completed_at = now() - interval '4 days' where id = $1", [row.id]);
  await assert.rejects(db.query('select raise_job_dispute($1, $2, $3, null)', [row.id, client, 'Too late']), /three-day/);
});
it('allows provider appeals for historical refunded cancellations without moving funds', async () => {
  const row = await job('cancelled');
  await db.query("update escrow_transactions set status = 'cancelled' where job_id = $1", [row.id]);
  await db.query('select raise_job_dispute($1, $2, $3, null)', [row.id, provider, 'Work was already done']);
  assert.equal((await db.query('select status from escrow_transactions where job_id = $1', [row.id])).rows[0].status, 'cancelled');
});
it('creates a notification for every message including photos, with the recipient and conversation', async () => {
  const row = await job();
  const { rows: [conversation] } = await db.query('insert into conversations(job_id, client_id, provider_id) values ($1, $2, $3) returning id', [row.id, client, provider]);
  for (const [sender, body, attachment] of [[client, 'Hello', null], [client, '', 'photo.jpg'], [provider, 'Reply', null]]) {
    await db.query('insert into messages(conversation_id, sender_id, body, attachment_path) values ($1, $2, $3, $4)', [conversation.id, sender, body, attachment]);
  }
  const { rows } = await db.query("select * from notifications where data->>'conversation_id' = $1", [conversation.id]);
  assert.equal(rows.length, 3);
  assert.equal(rows.filter((r) => r.recipient_id === provider).length, 2);
  assert.equal(rows.filter((r) => r.recipient_id === client).length, 1);
});
it('notifies completion readiness only when all checklist tasks are done', async () => {
  const row = await job();
  const { rows: tasks } = await db.query("insert into job_tasks(job_id, label, position) values ($1, 'First', 0), ($1, 'Second', 1) returning id", [row.id]);
  const count = async () => Number((await db.query("select count(*) from notifications where data->>'job_id' = $1 and title = 'Work ready for review'", [row.id])).rows[0].count);
  await db.query('update job_tasks set is_done = true, completed_at = now() where id = $1', [tasks[0].id]);
  assert.equal(await count(), 0);
  await db.query('update job_tasks set is_done = true, completed_at = now() where id = $1', [tasks[1].id]);
  assert.equal(await count(), 1);
  await db.query('update job_tasks set is_done = true where id = $1', [tasks[1].id]);
  assert.equal(await count(), 1);
});
it('blocks replacing a primary skill during accepted work but allows adding secondary skills', async () => {
  await assert.rejects(db.query("insert into skill_change_requests(provider_id, type, category_id, reason) values ($1, 'change_primary', 2, 'Change service')", [provider]), /Finish accepted jobs/);
  await assert.rejects(db.query('update provider_profiles set category_id = 2 where profile_id = $1', [provider]), /Finish accepted jobs/);
  await db.query("insert into skill_change_requests(provider_id, type, category_id, reason) values ($1, 'add_secondary', 2, 'Additional approved work')", [provider]);
});
it('restricts dispute and skill RPCs to the service role', async () => {
  for (const name of ['raise_job_dispute', 'provider_approved_categories']) {
    const { rows: [row] } = await db.query(`select has_function_privilege('anon', oid, 'execute') as anon,
      has_function_privilege('authenticated', oid, 'execute') as authenticated from pg_proc where proname = $1`, [name]);
    assert.deepEqual(row, { anon: false, authenticated: false });
  }
});
it('rejects direct applications outside approved skills and permits approved secondary skills', async () => {
  const { rows: [row] } = await db.query(`insert into jobs(client_id, category_id, title, description, address, latitude, longitude)
    values ($1, 2, 'Cleaning test', 'Clean the kitchen and dining room.', 'QC', 14.6, 121) returning id`, [client]);
  await assert.rejects(db.query('insert into job_applications(job_id, provider_id) values ($1, $2)', [row.id, provider]), /approved skill/);
  await db.query('insert into provider_secondary_categories(provider_id, category_id) values ($1, 2)', [provider]);
  await db.query('insert into job_applications(job_id, provider_id) values ($1, $2)', [row.id, provider]);
});
it('requires Start Job before checklist changes and all tasks before client completion', async () => {
  const row = await job('confirmed');
  const { rows: [task] } = await db.query("insert into job_tasks(job_id, label, position) values ($1, 'Repair tap', 0) returning id", [row.id]);
  await assert.rejects(db.query('update job_tasks set is_done = true, completed_at = now() where id = $1', [task.id]), /Start the job/);
  await db.query("update jobs set status = 'in_progress' where id = $1", [row.id]);
  await assert.rejects(db.query("update jobs set status = 'completed' where id = $1", [row.id]), /Finish the task checklist/);
  await db.query('update job_tasks set is_done = true, completed_at = now() where id = $1', [task.id]);
  await db.query("update jobs set status = 'completed' where id = $1", [row.id]);
  await assert.rejects(db.query('update job_tasks set is_done = false, completed_at = null where id = $1', [task.id]), /closed work cannot be edited/);
});
