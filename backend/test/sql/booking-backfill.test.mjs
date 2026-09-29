import { before, after, it } from 'node:test';
import assert from 'node:assert/strict';
import { migratedDatabase, readMigration } from './harness.mjs';

let db;
const client = '11111111-1111-1111-1111-111111111111';
const provider = '22222222-2222-2222-2222-222222222222';
const migration = readMigration('0035_backfill_active_bookings.sql');
before(async () => {
  db = await migratedDatabase();
  for (const [id, role] of [[client, 'client'], [provider, 'provider']]) {
    await db.query('insert into auth.users (id, raw_user_meta_data) values ($1, $2)',
      [id, JSON.stringify({ role, full_name: role })]);
  }
});
after(async () => { await db.close(); });

it('backfills historical active jobs, preserves bookings and is repeatable', async () => {
  const ids = {};
  for (const status of ['confirmed', 'in_progress', 'assigned', 'completed', 'cancelled']) {
    const { rows: [job] } = await db.query(`
      insert into jobs (client_id, assigned_provider_id, category_id, title, description,
        address, latitude, longitude, status, posted_at, assigned_at)
      values ($1, $2, 1, 'Historical job', 'A historical booking for testing.',
        'Quezon City', 14.67, 121.04, $3, '2026-09-01', '2026-09-02') returning id`,
      [client, provider, status]);
    ids[status] = job.id;
  }
  await db.query(`insert into job_status_history (job_id, new_status, changed_at)
    values ($1, 'confirmed', '2026-09-03T08:00:00Z')`, [ids.confirmed]);
  await db.query(`insert into bookings (job_id, provider_id, client_id, scheduled_at)
    values ($1, $2, $3, '2026-09-04T09:00:00Z')`, [ids.in_progress, provider, client]);
  await db.exec(migration);
  await db.exec(migration);
  const { rows } = await db.query('select job_id, scheduled_at from bookings');
  assert.equal(rows.length, 2);
  assert.equal(new Date(rows.find(r => r.job_id === ids.confirmed).scheduled_at).toISOString(), '2026-09-03T08:00:00.000Z');
  assert.equal(new Date(rows.find(r => r.job_id === ids.in_progress).scheduled_at).toISOString(), '2026-09-04T09:00:00.000Z');
});
