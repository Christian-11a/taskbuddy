/**
 * Certificate "no expiry" flag (migration 0081), on real Postgres (see harness.mjs).
 * Run with `npm run test:sql`.
 */
import { before, after, it } from 'node:test';
import assert from 'node:assert/strict';
import { migratedDatabase } from './harness.mjs';

let db;
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const P = '66666666-6666-6666-6666-666666666666';
const insert = (expires, noExpiry) =>
  q(
    `insert into provider_credentials(provider_id,category_id,credential_type,title,issuer,document_path,expires_on,no_expiry)
     values ($1::uuid,1,'tesda_nc','NC II','TESDA',$1::uuid::text||'/'||gen_random_uuid()::text||'.png',$2::date,$3) returning no_expiry`,
    [P, expires, noExpiry],
  );

before(async () => {
  db = await migratedDatabase();
  await q('insert into auth.users(id,raw_user_meta_data) values($1,$2)', [
    P,
    JSON.stringify({ role: 'provider', full_name: 'P' }),
  ]);
  await q(
    "insert into provider_profiles(profile_id,category_id,bio) values($1,1,'Licensed plumber with years of experience')",
    [P],
  );
});
after(async () => {
  await db.close();
});

it('defaults to false, so existing rows keep their meaning', async () => {
  const [row] = await q(
    `insert into provider_credentials(provider_id,category_id,credential_type,title,issuer,document_path)
     values ($1::uuid,1,'tesda_nc','NC II','TESDA',$1::uuid::text||'/legacy.png') returning no_expiry`,
    [P],
  );
  assert.equal(row.no_expiry, false);
});

it('stores either a date or "no expiry", never both', async () => {
  assert.equal((await insert('2099-01-01', false))[0].no_expiry, false);
  assert.equal((await insert(null, true))[0].no_expiry, true);
  await assert.rejects(insert('2099-01-01', true), /provider_credentials_no_expiry_or_date/);
});
