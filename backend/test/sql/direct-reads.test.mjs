import { before, after, it } from 'node:test';
import assert from 'node:assert/strict';
import { migratedDatabase } from './harness.mjs';

// 0072: what a signed-in user can read straight from PostgREST.
let db;
const client = 'b1111111-1111-4111-8111-111111111111';
const provider = 'b2222222-2222-4222-8222-222222222222';
const other = 'b3333333-3333-4333-8333-333333333333';

before(async () => {
  db = await migratedDatabase();
  for (const [id, role] of [[client, 'client'], [provider, 'provider'], [other, 'client']]) {
    await db.query('insert into auth.users(id, raw_user_meta_data) values ($1, $2)', [id, JSON.stringify({ role, full_name: role })]);
  }
  await db.query("update profiles set phone = '09170000000', address = '12 Mabini St' where id = $1", [other]);
  await db.query(`insert into jobs(client_id, category_id, title, description, address, latitude, longitude, status)
    values ($1, 1, 'Fix sink', 'Repair a leaking kitchen faucet and check the pressure.', 'QC', 14.6, 121, 'open')`, [other]);
  await db.exec('grant select on public.profiles, public.jobs, public.stripe_events to authenticated;');
});
after(async () => { await db.close(); });

async function as(userId, sql) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`);
  try {
    return (await db.query(sql)).rows;
  } finally {
    await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false);");
  }
}

it('lets a user read only their own profile', async () => {
  const rows = await as(client, 'select id from profiles');
  assert.deepEqual(rows.map((r) => r.id), [client]);
});

it('shows open jobs to providers but not to other clients', async () => {
  assert.equal((await as(provider, "select id from jobs where status = 'open'")).length, 1);
  assert.equal((await as(client, "select id from jobs where status = 'open'")).length, 0);
});

it('keeps stripe_events closed even with a table grant', async () => {
  assert.equal((await as(client, 'select * from stripe_events')).length, 0);
});

it('limits the older upload buckets to 10 MB images', async () => {
  const rows = (await db.query(
    "select id, file_size_limit, allowed_mime_types from storage.buckets where id in ('avatars','chat-attachments','job-photos','verification-docs') order by id",
  )).rows;
  assert.equal(rows.length, 4);
  for (const row of rows) {
    assert.equal(Number(row.file_size_limit), 10485760);
    assert.deepEqual(row.allowed_mime_types, ['image/jpeg', 'image/png', 'image/webp']);
  }
});
