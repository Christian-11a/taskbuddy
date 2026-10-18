import { before, after, it } from 'node:test';
import assert from 'node:assert/strict';
import { migratedDatabase } from './harness.mjs';

// 0070: sign-up metadata cannot make an admin (audit C3).
let db;
before(async () => { db = await migratedDatabase(); });
after(async () => { await db.close(); });

async function signUp(id, meta) {
  await db.query('insert into auth.users(id, raw_user_meta_data) values ($1, $2)', [id, JSON.stringify(meta)]);
  return (await db.query('select role, google_signup_pending from profiles where id = $1', [id])).rows[0];
}

it('turns a sign-up asking for admin into a client', async () => {
  assert.deepEqual(await signUp('a0000000-0000-0000-0000-000000000001', { role: 'admin', full_name: 'Mallory' }),
    { role: 'client', google_signup_pending: false });
});

it('keeps client and provider sign-ups as asked', async () => {
  assert.equal((await signUp('a0000000-0000-0000-0000-000000000002', { role: 'provider' })).role, 'provider');
  assert.equal((await signUp('a0000000-0000-0000-0000-000000000003', { role: 'client' })).role, 'client');
});

it('treats an unknown role as client and no role as a pending Google sign-up', async () => {
  assert.equal((await signUp('a0000000-0000-0000-0000-000000000004', { role: 'superuser' })).role, 'client');
  assert.deepEqual(await signUp('a0000000-0000-0000-0000-000000000005', { full_name: 'G User' }),
    { role: 'client', google_signup_pending: true });
});
