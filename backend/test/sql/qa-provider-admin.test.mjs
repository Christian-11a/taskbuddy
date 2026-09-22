/**
 * Migration 0034 on real Postgres (see harness.mjs). Run with `npm run test:sql`.
 *
 * Covers the rules the API leans on: a known set of ID document types, one
 * open skill-change request per provider, and the verification status the
 * admin Users list reads from admin_user_overview.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { migratedDatabase } from './harness.mjs';

const CLIENT = '11111111-1111-1111-1111-111111111111';
const PROVIDER = '22222222-2222-2222-2222-222222222222';

let db;
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await q(sql, params))[0];

async function refusal(sql, params, code) {
  try {
    await q(sql, params);
  } catch (err) {
    assert.equal(err.code, code, `${sql} raised ${err.code}: ${err.message}`);
    return err;
  }
  assert.fail(`expected SQLSTATE ${code} from: ${sql}`);
}

beforeEach(async () => {
  db = await migratedDatabase();
  for (const [id, role, name] of [
    [CLIENT, 'client', 'Ana Cruz'],
    [PROVIDER, 'provider', 'Boy Plumber'],
  ]) {
    await q(
      `insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`,
      [id, `${id}@taskbuddy.test`, JSON.stringify({ role, full_name: name })],
    );
  }
  await q(
    `insert into provider_profiles (profile_id, category_id, bio, is_verified)
     values ($1, 1, 'Licensed plumber, ten years around Quezon City.', false)`,
    [PROVIDER],
  );
});

describe('provider_verifications.document_type', () => {
  it('accepts a known ID type', async () => {
    const row = await one(
      `insert into provider_verifications (provider_id, id_document_path, selfie_path, document_type)
       values ($1, 'p/id.jpg', 'p/selfie.jpg', 'philsys') returning document_type`,
      [PROVIDER],
    );
    assert.equal(row.document_type, 'philsys');
  });

  it('rejects an unknown ID type', async () => {
    await refusal(
      `insert into provider_verifications (provider_id, id_document_path, selfie_path, document_type)
       values ($1, 'p/id.jpg', 'p/selfie.jpg', 'library_card')`,
      [PROVIDER],
      '23514',
    );
  });
});

describe('skill_change_requests', () => {
  const insert = (type = 'change_primary') =>
    q(
      `insert into skill_change_requests (provider_id, type, category_id, reason)
       values ($1, $2, 2, 'I am now a licensed electrician as well.')`,
      [PROVIDER, type],
    );

  it('allows only one pending request per provider', async () => {
    await insert();
    await refusal(
      `insert into skill_change_requests (provider_id, type, category_id, reason)
       values ($1, 'add_secondary', 3, 'Another request while one is open.')`,
      [PROVIDER],
      '23505',
    );
  });

  it('allows a new request once the previous one is decided', async () => {
    await insert();
    await q(`update skill_change_requests set status = 'rejected' where provider_id = $1`, [PROVIDER]);
    await insert('add_secondary');
    const { count } = await one(
      `select count(*)::int as count from skill_change_requests where provider_id = $1`,
      [PROVIDER],
    );
    assert.equal(count, 2);
  });

  it('requires a real reason', async () => {
    await refusal(
      `insert into skill_change_requests (provider_id, type, category_id, reason)
       values ($1, 'change_primary', 2, 'pls')`,
      [PROVIDER],
      '23514',
    );
  });
});

describe('admin_user_overview verification columns', () => {
  it('reports the latest verification status and the verified flag', async () => {
    const before = await one(
      `select is_verified, latest_verification_status from admin_user_overview where id = $1`,
      [PROVIDER],
    );
    assert.equal(before.is_verified, false);
    assert.equal(before.latest_verification_status, null);

    await q(
      `insert into provider_verifications (provider_id, id_document_path, selfie_path, status, submitted_at)
       values ($1, 'p/a.jpg', 'p/b.jpg', 'rejected', now() - interval '2 days'),
              ($1, 'p/c.jpg', 'p/d.jpg', 'pending',  now())`,
      [PROVIDER],
    );
    const after = await one(
      `select latest_verification_status from admin_user_overview where id = $1`,
      [PROVIDER],
    );
    assert.equal(after.latest_verification_status, 'pending');
  });

  it('leaves clients with no verification data', async () => {
    const row = await one(
      `select is_verified, latest_verification_status from admin_user_overview where id = $1`,
      [CLIENT],
    );
    assert.equal(row.is_verified, null);
    assert.equal(row.latest_verification_status, null);
  });
});
