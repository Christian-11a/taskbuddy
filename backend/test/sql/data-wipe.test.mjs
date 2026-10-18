import { before, after, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migratedDatabase, promoteAdmins } from './harness.mjs';

// scripts/data-wipe.sql keeps config and admins and removes everything else.
const WIPE = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../scripts/data-wipe.sql'),
  'utf8',
);
let db;
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const admin = 'd1111111-1111-4111-8111-111111111111';
const client = 'd2222222-2222-4222-8222-222222222222';

before(async () => {
  db = await migratedDatabase();
  for (const [id, role] of [[admin, 'admin'], [client, 'client']]) {
    await q('insert into auth.users(id, raw_user_meta_data) values ($1, $2)', [id, JSON.stringify({ role, full_name: role })]);
  }
  await promoteAdmins(db);
  await q(`insert into jobs(client_id, category_id, title, description, address, latitude, longitude)
    values ($1, 1, 'Fix sink', 'Repair a leaking kitchen faucet and check the pressure.', 'QC', 14.6, 121)`, [client]);
  await q(`insert into wallet_transactions(profile_id, direction, kind, status, amount, title) values ($1, 'credit', 'topup', 'completed', 100, 'Payment')`, [client]);
});
after(async () => { await db.close(); });

it('removes marketplace data and non-admin accounts, keeps config and admins', async () => {
  const categories = (await q('select count(*)::int as n from service_categories'))[0].n;
  await db.exec(WIPE);
  assert.deepEqual((await q('select id from auth.users')).map((r) => r.id), [admin]);
  assert.equal((await q("select role from profiles where id = $1", [admin]))[0].role, 'admin');
  assert.equal((await q('select count(*)::int as n from jobs'))[0].n, 0);
  assert.equal((await q('select count(*)::int as n from wallet_transactions'))[0].n, 0);
  assert.equal((await q('select count(*)::int as n from service_categories'))[0].n, categories);
  assert.equal((await q('select count(*)::int as n from platform_settings'))[0].n, 1);
});
