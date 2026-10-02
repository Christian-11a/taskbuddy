import { before, after, it } from 'node:test';
import assert from 'node:assert/strict';
import { migratedDatabase } from './harness.mjs';

let db;
const client = '11111111-1111-1111-1111-111111111111';
const providerA = '22222222-2222-2222-2222-222222222222';
const providerB = '33333333-3333-3333-3333-333333333333';

before(async () => {
  db = await migratedDatabase();
  for (const [id, role, full_name] of [
    [client, 'client', 'Ana Reyes'],
    [providerA, 'provider', 'Rico Bautista'],
    [providerB, 'provider', 'Mia Santos'],
  ]) {
    await db.query('insert into auth.users(id, raw_user_meta_data) values ($1, $2)',
      [id, JSON.stringify({ role, full_name })]);
  }
  await db.query("insert into skill_change_requests(provider_id, type, category_id, reason) values ($1, 'add_secondary', 2, 'Qualified electrician'), ($2, 'add_secondary', 2, 'Qualified electrician')", [providerA, providerB]);
  await db.query("insert into jobs(client_id, category_id, title, description, address, latitude, longitude) values ($1, 1, 'Leaking kitchen sink', 'Repair the leaking kitchen sink.', 'QC', 14.6, 121)", [client]);
});
after(async () => { await db.close(); });

it('filters service requests before paging and returns the matching total', async () => {
  const { rows: [page] } = await db.query("select * from admin_list_skill_requests(null, 'pending', 1, 1)");
  assert.equal(Number(page.total), 2);
  assert.equal(page.rows.length, 1);
  const { rows: [searched] } = await db.query("select * from admin_list_skill_requests('Rico', 'pending', 1, 0)");
  assert.equal(Number(searched.total), 1);
  assert.equal(searched.rows[0].provider.full_name, 'Rico Bautista');
  const { rows: [category] } = await db.query("select * from admin_list_skill_requests('Cleaning', 'pending', 20, 0)");
  assert.equal(Number(category.total), 2);
  const { rows: [none] } = await db.query("select * from admin_list_skill_requests('not present', 'pending', 20, 0)");
  assert.equal(Number(none.total), 0);
});

it('searches booking titles in both the page and status counts', async () => {
  const { rows: [page] } = await db.query("select * from admin_list_bookings('Leaking kitchen sink', null, null, 20, 0)");
  assert.equal(Number(page.total), 1);
  assert.equal(page.rows[0].title, 'Leaking kitchen sink');
  const { rows: [counts] } = await db.query("select admin_booking_status_counts('Leaking kitchen sink', null) as counts");
  assert.equal(Number(counts.counts.open), 1);
});

it('restricts the new service-request RPC to service role', async () => {
  const { rows: [row] } = await db.query("select has_function_privilege('anon', 'admin_list_skill_requests(text,skill_request_status,integer,integer)', 'execute') as anon, has_function_privilege('authenticated', 'admin_list_skill_requests(text,skill_request_status,integer,integer)', 'execute') as authenticated");
  assert.deepEqual(row, { anon: false, authenticated: false });
});

it('reports whether the auth user has a password without exposing auth.users', async () => {
  await db.query("update auth.users set encrypted_password = 'hashed' where id = $1", [client]);
  const { rows: [clientRow] } = await db.query('select auth_user_has_password($1) as has_password', [client]);
  const { rows: [googleRow] } = await db.query('select auth_user_has_password($1) as has_password', [providerA]);
  assert.equal(clientRow.has_password, true);
  assert.equal(googleRow.has_password, false);
  const { rows: [permissions] } = await db.query("select has_function_privilege('anon', 'auth_user_has_password(uuid)', 'execute') as anon, has_function_privilege('authenticated', 'auth_user_has_password(uuid)', 'execute') as authenticated");
  assert.deepEqual(permissions, { anon: false, authenticated: false });
});
