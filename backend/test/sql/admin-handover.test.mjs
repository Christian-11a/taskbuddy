import { before, after, it } from 'node:test';
import assert from 'node:assert/strict';
import { migratedDatabase } from './harness.mjs';
let db;
const client = '11111111-1111-1111-1111-111111111111';
const provider = '22222222-2222-2222-2222-222222222222';
before(async () => {
  db = await migratedDatabase();
  for (const [id, role, name] of [[client, 'client', 'Ana Cruz'], [provider, 'provider', 'Ben Santos']]) {
    await db.query('insert into auth.users (id, raw_user_meta_data) values ($1, $2)', [id, JSON.stringify({ role, full_name: name })]);
  }
  await db.query(`insert into wallet_transactions (profile_id, direction, kind, amount, title)
    select $1, 'credit', 'topup', 100, 'Card deposit' from generate_series(1, 105)`, [client]);
  await db.query(`insert into admin_actions (actor_id, action, target_type, target_id, metadata)
    select $1, 'user.suspend', 'profiles', $2, '{"reason":"Spam"}' from generate_series(1, 105)`, [client, provider]);
});
after(async () => { await db.close(); });

it('searches names across wallet rows before counting/pagination', async () => {
  const { rows: [result] } = await db.query(`select * from admin_search_wallet('ANA', 'credit', 'topup', 'completed', 10, 100)`);
  assert.equal(Number(result.total), 105);
  assert.equal(result.rows.length, 5);
  assert.equal(result.rows[0].profile.full_name, 'Ana Cruz');
  const { rows: [empty] } = await db.query(`select * from admin_search_wallet('ANA', null, null, null, 10, 200)`);
  assert.equal(Number(empty.total), 105);
  assert.deepEqual(empty.rows, []);
  const { rows: [literal] } = await db.query(`select * from admin_search_wallet('%', null, null, null, 10, 0)`);
  assert.equal(Number(literal.total), 0);
});

it('searches audit reason, actor and target with exact filters', async () => {
  for (const term of ['spam', 'ANA', provider]) {
    const { rows: [result] } = await db.query(`select * from admin_search_audit($1, 'user.suspend', $2, null, null, 10, 100)`, [term, client]);
    assert.equal(Number(result.total), 105);
    assert.equal(result.rows.length, 5);
    assert.equal(result.rows[0].actor.full_name, 'Ana Cruz');
  }
  const { rows: [result] } = await db.query(`select * from admin_search_audit('spam', 'user.reinstate', null, null, null, 10, 0)`);
  assert.equal(Number(result.total), 0);
});

it('counts held escrow and all job statuses without the REST row limit', async () => {
  const { rows: [job] } = await db.query(`insert into jobs
    (client_id, category_id, title, description, address, latitude, longitude)
    values ($1, 1, 'Test job', 'A valid description for the job.', 'QC', 14.6, 121) returning id`, [client]);
  await db.query(`insert into escrow_transactions (job_id, client_id, provider_id, amount) values ($1, $2, $3, 123.45)`, [job.id, client, provider]);
  const { rows: [result] } = await db.query('select admin_dashboard_counts() as counts');
  assert.deepEqual(result.counts, { escrow_held_total: 123.45, escrow_held_count: 1, open_jobs: 1, matching_jobs: 0 });
  const { rows: [statuses] } = await db.query("select admin_booking_status_counts('Ana', 1::smallint) as counts");
  assert.equal(statuses.counts.open, 1);
  assert.equal(statuses.counts.completed, 0);
  assert.equal(Object.keys(statuses.counts).length, 8);
  const { rows: [excluded] } = await db.query("select admin_booking_status_counts('Ana', 2::smallint) as counts");
  assert.equal(excluded.counts.open, 0);
});

it('restricts all new RPCs to service_role', async () => {
  for (const name of ['admin_search_wallet', 'admin_search_audit', 'admin_dashboard_counts', 'admin_booking_status_counts']) {
    const { rows: [result] } = await db.query(`select has_function_privilege('authenticated', oid, 'execute') as signed_in,
      has_function_privilege('anon', oid, 'execute') as anon,
      has_function_privilege('service_role', oid, 'execute') as service from pg_proc where proname = $1`, [name]);
    assert.deepEqual(result, { signed_in: false, anon: false, service: true });
  }
});
