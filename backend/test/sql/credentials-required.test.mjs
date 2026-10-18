/**
 * Certificates required for verification (migration 0068), on real Postgres
 * (see harness.mjs). Run with `npm run test:sql`.
 */
import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { migratedDatabase, readMigration, promoteAdmins } from './harness.mjs';

let db;
let seq = 0;
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const ADMIN = '99999999-9999-9999-9999-999999999999';
const TODAY = "(now() at time zone 'Asia/Manila')::date";

before(async () => {
  db = await migratedDatabase();
  await q('insert into auth.users(id,raw_user_meta_data) values($1,$2)', [
    ADMIN,
    JSON.stringify({ role: 'admin', full_name: 'Admin' }),
  ]);
  await promoteAdmins(db);
});
after(async () => {
  await db.close();
});

async function provider({ identity = false, category = 1 } = {}) {
  seq += 1;
  const id = `44444444-4444-4444-4444-${String(seq).padStart(12, '0')}`;
  await q('insert into auth.users(id,raw_user_meta_data) values($1,$2)', [
    id,
    JSON.stringify({ role: 'provider', full_name: `P${seq}` }),
  ]);
  await q(
    "insert into provider_profiles(profile_id,category_id,bio,identity_verified) values($1,$2,'Licensed plumber with years of experience',$3)",
    [id, category, identity],
  );
  return id;
}
async function credential(id, { category = 1, status = 'approved', expires = null } = {}) {
  const rows = await q(
    `insert into provider_credentials(provider_id,category_id,credential_type,title,issuer,document_path,status,expires_on)
     values ($1::uuid,$2::smallint,'tesda_nc','NC II','TESDA',$1::uuid::text||'/'||gen_random_uuid()::text||'.png',$3::text, ${expires ?? 'null'}) returning id`,
    [id, category, status],
  );
  return rows[0].id;
}
const verified = async (id) =>
  (await q('select is_verified from provider_profiles where profile_id=$1', [id]))[0].is_verified;
const pending = async (id) =>
  (
    await q(
      "insert into provider_verifications(provider_id,id_document_path,selfie_path) values ($1,'p/id.jpg','p/s.jpg') returning id",
      [id],
    )
  )[0].id;
const notes = async (id) =>
  (await q('select title from notifications where recipient_id=$1 order by created_at, title', [id])).map((r) => r.title);

describe('identity x certificate matrix', () => {
  const identities = { pending: false, approved: true, rejected: false };
  const certs = {
    none: null,
    pending: { status: 'pending' },
    approved: { status: 'approved' },
    rejected: { status: 'rejected' },
    expired: { status: 'approved', expires: `${TODAY} - 1` },
  };
  for (const [idState, idFlag] of Object.entries(identities)) {
    for (const [certState, cert] of Object.entries(certs)) {
      it(`identity ${idState} + certificate ${certState}`, async () => {
        const id = await provider({ identity: idFlag });
        if (cert) await credential(id, cert);
        assert.equal(await verified(id), idState === 'approved' && certState === 'approved');
      });
    }
  }
});

describe('expiry', () => {
  it('a certificate expiring today is valid, yesterday is expired', async () => {
    const today = await provider({ identity: true });
    await credential(today, { expires: TODAY });
    const yesterday = await provider({ identity: true });
    await credential(yesterday, { expires: `${TODAY} - 1` });
    assert.equal(await verified(today), true);
    assert.equal(await verified(yesterday), false);
  });

  it('the daily tick removes verified, tells the provider once, and keeps still-valid ones', async () => {
    const lapsing = await provider({ identity: true });
    const credId = await credential(lapsing, { expires: `${TODAY} + 1` });
    const keeps = await provider({ identity: true });
    await credential(keeps, { expires: `${TODAY} + 200` });
    assert.equal(await verified(lapsing), true);
    // Time passes: the date moves to yesterday behind the trigger's back.
    await q(`update provider_credentials set expires_on = ${TODAY} - 1 where id=$1`, [credId]);
    // The trigger fires on expires_on, so force the stale flag as time-only expiry would leave it.
    await q('alter table provider_profiles disable trigger provider_profiles_sync_verified');
    await q('update provider_profiles set is_verified=true where profile_id=$1', [lapsing]);
    await q('alter table provider_profiles enable trigger provider_profiles_sync_verified');
    const [{ credential_expiry_tick: first }] = await q('select credential_expiry_tick()');
    assert.equal(await verified(lapsing), false);
    assert.equal(await verified(keeps), true);
    assert.deepEqual(await notes(lapsing), ['Your certificate expired']);
    const [{ credential_expiry_tick: second }] = await q('select credential_expiry_tick()');
    assert.ok(first.changed >= 1);
    assert.equal(second.changed, 0);
    assert.deepEqual(await notes(lapsing), ['Your certificate expired']);
  });

  it('warns 30 days before expiry exactly once per certificate', async () => {
    const id = await provider({ identity: true });
    await credential(id, { expires: `${TODAY} + 30` });
    const far = await provider({ identity: true });
    await credential(far, { expires: `${TODAY} + 31` });
    await q('select credential_expiry_tick()');
    await q('select credential_expiry_tick()');
    assert.deepEqual(await notes(id), ['Your certificate expires soon']);
    assert.deepEqual(await notes(far), []);
  });
});

describe('primary service change', () => {
  it('only a certificate for the current primary category counts', async () => {
    const id = await provider({ identity: true, category: 1 });
    await credential(id, { category: 1 });
    assert.equal(await verified(id), true);
    await q('update provider_profiles set category_id=2 where profile_id=$1', [id]);
    assert.equal(await verified(id), false);
    await credential(id, { category: 2 });
    assert.equal(await verified(id), true);
    await q('update provider_profiles set category_id=1 where profile_id=$1', [id]);
    assert.equal(await verified(id), true);
    await q('update provider_profiles set category_id=3 where profile_id=$1', [id]);
    assert.equal(await verified(id), false);
  });
});

describe('inserting a profile cannot bypass the rule', () => {
  it('is_verified = true on insert without identity and certificate is ignored', async () => {
    seq += 1;
    const id = `44444444-4444-4444-4444-${String(seq).padStart(12, '0')}`;
    await q('insert into auth.users(id,raw_user_meta_data) values($1,$2)', [id, JSON.stringify({ role: 'provider', full_name: 'X' })]);
    await q("insert into provider_profiles(profile_id,category_id,bio,is_verified) values($1,1,'Licensed plumber with years of experience',true)", [id]);
    assert.equal(await verified(id), false);
  });
});

describe('backfill (D5e)', () => {
  it('rerunning the migration unverifies verified providers without a certificate and keeps certified ones', async () => {
    const without = await provider({ identity: true });
    const withCert = await provider({ identity: true });
    await credential(withCert);
    // Legacy state: flag set from identity alone.
    await q('alter table provider_profiles disable trigger provider_profiles_sync_verified');
    await q('update provider_profiles set is_verified=true where profile_id = any($1)', [[without, withCert]]);
    await q('alter table provider_profiles enable trigger provider_profiles_sync_verified');
    assert.equal(await verified(without), true);
    await db.exec(readMigration('0068_credentials_required.sql'));
    assert.equal(await verified(without), false);
    assert.equal(await verified(withCert), true);
  });
});

describe('admin_decide_verification_case', () => {
  const decide = (ver, cred, decision, failed = [], note = null) =>
    q('select admin_decide_verification_case($1,$2,$3,$4,$5,$6) as r', [ADMIN, ver, cred, decision, failed, note]);

  it('approve applies identity and certificate together', async () => {
    const id = await provider();
    const v = await pending(id);
    const c = await credential(id, { status: 'pending' });
    const [{ r }] = await decide(v, c, 'approve');
    assert.equal(r.verified, true);
    assert.equal(await verified(id), true);
    assert.deepEqual(await notes(id), ['You are verified']);
  });

  it('a certificate failure rolls back the identity part', async () => {
    const id = await provider();
    const v = await pending(id);
    const c = await credential(id, { status: 'pending', expires: `${TODAY} - 1` });
    await assert.rejects(decide(v, c, 'approve'), /expired/);
    const [{ status }] = await q('select status from provider_verifications where id=$1', [v]);
    assert.equal(status, 'pending');
    assert.equal(
      (await q('select identity_verified from provider_profiles where profile_id=$1', [id]))[0].identity_verified,
      false,
    );
    assert.equal((await q('select status from provider_credentials where id=$1', [c]))[0].status, 'pending');
  });

  it('reject with only the certificate failed approves identity and tells the provider what to redo', async () => {
    const id = await provider();
    const v = await pending(id);
    const c = await credential(id, { status: 'pending' });
    await decide(v, c, 'reject', ['certificate'], 'Photo is blurry');
    assert.equal((await q('select status from provider_verifications where id=$1', [v]))[0].status, 'approved');
    assert.equal((await q('select status, rejection_reason from provider_credentials where id=$1', [c]))[0].status, 'rejected');
    assert.equal(await verified(id), false);
    const n = await q('select body from notifications where recipient_id=$1', [id]);
    assert.match(n[0].body, /redo: certificate\. Photo is blurry/);
  });

  it('reject with id and selfie failed rejects the verification and leaves identity unset', async () => {
    const id = await provider();
    const v = await pending(id);
    await decide(v, null, 'reject', ['id', 'selfie'], 'Selfie does not match');
    assert.equal((await q('select status from provider_verifications where id=$1', [v]))[0].status, 'rejected');
    assert.equal(await verified(id), false);
  });

  it('Stripe already approved identity: only the certificate is decided', async () => {
    const id = await provider({ identity: true });
    const c = await credential(id, { status: 'pending' });
    await assert.rejects(decide(null, c, 'reject', ['id'], 'x'), /Identity was already approved/);
    const [{ r }] = await decide(null, c, 'approve');
    assert.equal(r.identity, 'unchanged');
    assert.equal(await verified(id), true);
  });

  it('a second decision on the same case is refused', async () => {
    const id = await provider();
    const v = await pending(id);
    await decide(v, null, 'approve');
    await assert.rejects(decide(v, null, 'approve'), /already approved/);
  });
});
