import { before, after, it } from 'node:test';
import assert from 'node:assert/strict';
import { migratedDatabase } from './harness.mjs';

// 0074: the admin Users list says what a provider is missing.
let db;
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
let seq = 0;

before(async () => { db = await migratedDatabase(); });
after(async () => { await db.close(); });

async function provider(credentials = [], identity = false) {
  seq += 1;
  const id = `c0000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
  await q('insert into auth.users(id, raw_user_meta_data) values ($1, $2)', [id, JSON.stringify({ role: 'provider', full_name: `P${seq}` })]);
  await q('insert into provider_profiles(profile_id, category_id, identity_verified) values ($1, 1, $2)', [id, identity]);
  for (const [n, [status, expires]] of credentials.entries()) {
    await q(`insert into provider_credentials(provider_id, category_id, credential_type, title, issuer, document_path, status, expires_on)
      values ($1, 1, 'tesda_nc', 'NC II', 'TESDA', $4, $2, $3)`, [id, status, expires, `${id}/doc${n}.jpg`]);
  }
  return (await q('select identity_verified, certificate_status from admin_user_certificates where id = $1', [id]))[0];
}

it('reports identity and the main-service certificate status', async () => {
  assert.deepEqual(await provider([], true), { identity_verified: true, certificate_status: null });
  assert.equal((await q("select has_table_privilege('authenticated','public.admin_user_certificates','select') as ok"))[0].ok, false);
  assert.equal((await provider([['approved', null]])).certificate_status, 'approved');
  assert.equal((await provider([['approved', '2000-01-01']])).certificate_status, 'expired');
  assert.equal((await provider([['approved', '2000-01-01'], ['pending', null]])).certificate_status, 'pending');
  assert.equal((await provider([['rejected', null]])).certificate_status, 'rejected');
});
