/**
 * Credentials hardening (migration 0068): deploy-order safety, same-transaction
 * decisions, notifications and per-service certificates, on real Postgres
 * (see harness.mjs). Run with `npm run test:sql`.
 */
import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { migratedDatabase, readMigration, promoteAdmins } from './harness.mjs';

let db;
let seq = 0;
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const ADMIN = '99999999-9999-9999-9999-999999999998';
const CLIENT = '99999999-9999-9999-9999-999999999997';
const TODAY = "(now() at time zone 'Asia/Manila')::date";

before(async () => {
  db = await migratedDatabase();
  await q('insert into auth.users(id,raw_user_meta_data) values($1,$2)', [
    ADMIN,
    JSON.stringify({ role: 'admin', full_name: 'Admin' }),
  ]);
  await q('insert into auth.users(id,raw_user_meta_data) values($1,$2)', [
    CLIENT,
    JSON.stringify({ role: 'client', full_name: 'Client' }),
  ]);
  await promoteAdmins(db);
});
after(async () => {
  await db.close();
});

async function provider({ identity = false, category = 1 } = {}) {
  seq += 1;
  const id = `55555555-5555-5555-5555-${String(seq).padStart(12, '0')}`;
  await q('insert into auth.users(id,raw_user_meta_data) values($1,$2)', [
    id,
    JSON.stringify({ role: 'provider', full_name: `H${seq}` }),
  ]);
  await q(
    "insert into provider_profiles(profile_id,category_id,bio,identity_verified) values($1,$2,'Licensed plumber with years of experience',$3)",
    [id, category, identity],
  );
  return id;
}
async function credential(id, { category = 1, status = 'approved', expires = null } = {}) {
  return (
    await q(
      `insert into provider_credentials(provider_id,category_id,credential_type,title,issuer,document_path,status,expires_on)
       values ($1::uuid,$2::smallint,'tesda_nc','NC II','TESDA',$1::uuid::text||'/'||gen_random_uuid()::text||'.png',$3::text, ${expires ?? 'null'}) returning id`,
      [id, category, status],
    )
  )[0].id;
}
async function submission(id, status = 'pending', reviewedAgo = null) {
  return (
    await q(
      `insert into provider_verifications(provider_id,id_document_path,selfie_path,status,reviewed_at)
       values ($1,'p/id.jpg','p/s.jpg',$2::verification_status, ${reviewedAgo ? `now() - interval '${reviewedAgo}'` : 'null'}) returning id`,
      [id, status],
    )
  )[0].id;
}
const flags = async (id) =>
  (await q('select is_verified, identity_verified from provider_profiles where profile_id=$1', [id]))[0];
const notes = async (id) =>
  (await q('select title from notifications where recipient_id=$1 order by created_at, title', [id])).map((r) => r.title);
const withoutTriggers = async (fn) => {
  await q('alter table provider_profiles disable trigger provider_profiles_sync_verified');
  await q('alter table provider_credentials disable trigger provider_credentials_sync_verified');
  try {
    await fn();
  } finally {
    await q('alter table provider_profiles enable trigger provider_profiles_sync_verified');
    await q('alter table provider_credentials enable trigger provider_credentials_sync_verified');
  }
};
const cats = async (id) =>
  (await q('select category_id from provider_approved_categories($1) order by 1', [id])).map((r) => r.category_id);

describe('backfill from submissions', () => {
  it('repairs a stranded approved submission on rerun and never resurrects a later rejection', async () => {
    const stranded = await provider();
    await submission(stranded, 'approved', '1 day');
    const revoked = await provider();
    await submission(revoked, 'approved', '3 days');
    await submission(revoked, 'rejected', '1 day');
    const pendingOnly = await provider();
    await submission(pendingOnly, 'pending');
    await credential(stranded);
    for (let i = 0; i < 2; i += 1) await db.exec(readMigration('0068_credentials_required.sql'));
    assert.deepEqual(await flags(stranded), { is_verified: true, identity_verified: true });
    assert.equal((await flags(revoked)).identity_verified, false);
    assert.equal((await flags(pendingOnly)).identity_verified, false);
  });
});

describe('backfill keeps identity for providers verified today', () => {
  it('is_verified = true with no submission keeps identity, needs a certificate, and survives a rerun', async () => {
    const hand = await provider();
    const certified = await provider();
    await credential(certified);
    await withoutTriggers(() =>
      q('update provider_profiles set is_verified=true where profile_id = any($1)', [[hand, certified]]),
    );
    assert.equal((await flags(hand)).identity_verified, false);
    for (let i = 0; i < 2; i += 1) {
      await db.exec(readMigration('0068_credentials_required.sql'));
      assert.deepEqual(await flags(hand), { is_verified: false, identity_verified: true });
      assert.deepEqual(await flags(certified), { is_verified: true, identity_verified: true });
    }
    await credential(hand);
    assert.deepEqual(await flags(hand), { is_verified: true, identity_verified: true });
    await db.exec(readMigration('0068_credentials_required.sql'));
    assert.deepEqual(await flags(hand), { is_verified: true, identity_verified: true });
  });
});

describe('old API writes (migration before API)', () => {
  it('is_verified = true alone is an identity approval, with the certificate rule applied', async () => {
    const id = await provider();
    await q('update provider_profiles set is_verified=true where profile_id=$1', [id]);
    assert.deepEqual(await flags(id), { is_verified: false, identity_verified: true });
    await credential(id);
    assert.equal((await flags(id)).is_verified, true);
  });

  it('is_verified = false alone is an identity rejection', async () => {
    const id = await provider({ identity: true });
    await credential(id);
    assert.equal((await flags(id)).is_verified, true);
    await q('update provider_profiles set is_verified=false where profile_id=$1', [id]);
    assert.deepEqual(await flags(id), { is_verified: false, identity_verified: false });
  });

  it('the refresh functions do not trip the rule (expiry keeps identity)', async () => {
    const id = await provider({ identity: true });
    const c = await credential(id, { expires: `${TODAY} + 1` });
    await withoutTriggers(() => q(`update provider_credentials set expires_on = ${TODAY} - 1 where id=$1`, [c]));
    await q('select refresh_provider_verified($1)', [id]);
    assert.deepEqual(await flags(id), { is_verified: false, identity_verified: true });
  });
});

describe('same-transaction decisions with pending checks', () => {
  it('decide_identity_verification sets identity with the decision and refuses a decided row', async () => {
    const id = await provider();
    await credential(id);
    const v = await submission(id);
    const [{ r }] = await q('select decide_identity_verification($1,true,$2,null) as r', [v, ADMIN]);
    assert.equal(r.verified, true);
    assert.deepEqual(await flags(id), { is_verified: true, identity_verified: true });
    // Second writer (e.g. a Stripe webhook that read 'pending' earlier) loses and changes nothing.
    await assert.rejects(q('select decide_identity_verification($1,false,null,$2)', [v, 'late']), /already approved/);
    assert.equal((await q('select status from provider_verifications where id=$1', [v]))[0].status, 'approved');
    assert.equal((await flags(id)).identity_verified, true);
  });

  it('a failure after the status write rolls the whole decision back', async () => {
    const id = await provider();
    await q('delete from provider_profiles where profile_id=$1', [id]);
    const v = await submission(id);
    await assert.rejects(q('select decide_identity_verification($1,true,$2,null)', [v, ADMIN]), /service profile/);
    assert.equal((await q('select status from provider_verifications where id=$1', [v]))[0].status, 'pending');
  });

  it('decide_credential is pending-only and refuses expired approvals', async () => {
    const id = await provider({ identity: true });
    const c = await credential(id, { status: 'pending' });
    const [{ r }] = await q('select decide_credential($1,true,$2,null) as r', [c, ADMIN]);
    assert.equal(r.verified, true);
    await assert.rejects(q('select decide_credential($1,false,$2,$3)', [c, ADMIN, 'x']), /already approved/);
    const old = await credential(id, { status: 'pending', expires: `${TODAY} - 1` });
    await assert.rejects(q('select decide_credential($1,true,$2,null)', [old, ADMIN]), /expired/);
  });
});

describe('notifications', () => {
  const decide = (ver, cred, decision, failed = [], note = null) =>
    q('select admin_decide_verification_case($1,$2,$3,$4,$5,$6) as r', [ADMIN, ver, cred, decision, failed, note]);

  it('a rejected renewal sends "needs changes" even though the provider stays verified', async () => {
    const id = await provider({ identity: true });
    await credential(id);
    const renewal = await credential(id, { status: 'pending' });
    const [{ r }] = await decide(null, renewal, 'reject', ['certificate'], 'Blurry');
    assert.equal(r.verified, true);
    assert.deepEqual(await notes(id), ['Verification needs changes']);
  });

  it('losing the flag for other reasons sends no expired notice', async () => {
    const id = await provider({ identity: true });
    await credential(id);
    await q('update provider_profiles set identity_verified=false where profile_id=$1', [id]);
    await q('select credential_expiry_tick()');
    assert.deepEqual(await notes(id), []);
  });

  it('an approved certificate that passed its date is announced exactly once', async () => {
    const id = await provider({ identity: true });
    const c = await credential(id, { expires: `${TODAY} + 1` });
    await withoutTriggers(() => q(`update provider_credentials set expires_on = ${TODAY} - 1 where id=$1`, [c]));
    await q('update provider_credentials set expiry_notified_at = now() where id=$1', [c]);
    const [a, b] = await Promise.all([q('select credential_expiry_tick() as r'), q('select credential_expiry_tick() as r')]);
    assert.equal(a[0].r.expired + b[0].r.expired, 1);
    await q('select credential_expiry_tick()');
    assert.deepEqual(await notes(id), ['Your certificate expired']);
    assert.equal((await flags(id)).is_verified, false);
  });
});

describe('per-service certificates', () => {
  async function job(category) {
    return (
      await q(
        "insert into jobs(client_id,category_id,title,description,address,latitude,longitude,status,budget) values($1,$2,'Secondary service job','Inspect and repair the leaking faucet and test the water pressure','QC',14.6,121,'open',500) returning id",
        [CLIENT, category],
      )
    )[0].id;
  }
  const apply = (jobId, id) => q('insert into job_applications(job_id,provider_id) values($1,$2)', [jobId, id]);

  it('a secondary service needs its own certificate; the primary one is not enough', async () => {
    const id = await provider({ identity: true });
    await credential(id, { category: 1 });
    await q('insert into provider_secondary_categories(provider_id,category_id) values($1,2)', [id]);
    assert.deepEqual(await cats(id), [1]);
    const j = await job(2);
    await assert.rejects(apply(j, id), /certificate for .* to take this job/);
    await credential(id, { category: 2 });
    assert.deepEqual(await cats(id), [1, 2]);
    await apply(j, id);
  });

  it('expiry takes effect live, before any tick', async () => {
    const id = await provider({ identity: true });
    await credential(id, { category: 1 });
    const c2 = await credential(id, { category: 2, expires: `${TODAY} + 1` });
    await q('insert into provider_secondary_categories(provider_id,category_id) values($1,2)', [id]);
    assert.deepEqual(await cats(id), [1, 2]);
    await withoutTriggers(() => q(`update provider_credentials set expires_on = ${TODAY} - 1 where id=$1`, [c2]));
    assert.deepEqual(await cats(id), [1]);
    await assert.rejects(apply(await job(2), id), /certificate for .* to take this job/);
  });

  it('an uncertified primary hides the whole profile and a secondary cert alone does not unlock the badge', async () => {
    const id = await provider({ identity: true });
    await q('insert into provider_secondary_categories(provider_id,category_id) values($1,2)', [id]);
    await credential(id, { category: 2 });
    assert.equal((await flags(id)).is_verified, false);
    assert.deepEqual(await cats(id), [2]);
  });
});

describe('old writers and atomic legacy decisions', () => {
  it('an old is_verified = true cannot restore identity after a rejection, and cannot overwrite the decision', async () => {
    const id = await provider();
    await credential(id);
    const v = await submission(id);
    await q('select decide_identity_verification($1,false,$2,$3)', [v, ADMIN, 'Blurry']);
    // Old review() has no pending check: the overwrite is refused outright ...
    await assert.rejects(q("update provider_verifications set status='approved' where id=$1", [v]), /already rejected/);
    // ... and a bare is_verified = true write does not grant identity.
    await q('update provider_profiles set is_verified=true where profile_id=$1', [id]);
    assert.deepEqual(await flags(id), { is_verified: false, identity_verified: false });
    // A later approved submission is honoured again.
    const v2 = await submission(id);
    await q("update provider_verifications set status='approved', reviewed_at=now() where id=$1", [v2]);
    await q('update provider_profiles set is_verified=true where profile_id=$1', [id]);
    assert.deepEqual(await flags(id), { is_verified: true, identity_verified: true });
  });

  it('decision, audit row and notice are one transaction: a forced audit failure rolls the decision back', async () => {
    await q(`create or replace function fail_audit() returns trigger language plpgsql as $$ begin raise exception 'audit down'; end $$`);
    await q('create trigger fail_audit before insert on admin_actions for each row execute function fail_audit()');
    try {
      const id = await provider();
      const v = await submission(id);
      await assert.rejects(q('select decide_identity_verification($1,true,$2,null)', [v, ADMIN]), /audit down/);
      assert.equal((await q('select status from provider_verifications where id=$1', [v]))[0].status, 'pending');
      assert.equal((await flags(id)).identity_verified, false);
      assert.deepEqual(await notes(id), []);
      const c = await credential(id, { status: 'pending' });
      await assert.rejects(q('select decide_credential($1,true,$2,null)', [c, ADMIN]), /audit down/);
      assert.equal((await q('select status from provider_credentials where id=$1', [c]))[0].status, 'pending');
      assert.deepEqual(await notes(id), []);
    } finally {
      await q('drop trigger fail_audit on admin_actions');
    }
  });

  it('a successful decision writes its audit row and notice', async () => {
    const id = await provider();
    const v = await submission(id);
    await q('select decide_identity_verification($1,true,$2,null)', [v, ADMIN]);
    assert.equal((await q("select count(*)::int n from admin_actions where target_id=$1 and action='verification.approve'", [v]))[0].n, 1);
    assert.deepEqual(await notes(id), ['Upload your certificate to finish verification']);
  });

  it('identity approval names the missing PRIMARY certificate even when a secondary one is pending', async () => {
    const id = await provider();
    await credential(id, { category: 2, status: 'pending' });
    const v = await submission(id);
    await q('select decide_identity_verification($1,true,$2,null)', [v, ADMIN]);
    const n = await q('select title, body from notifications where recipient_id=$1', [id]);
    assert.equal(n[0].title, 'Upload your certificate to finish verification');
    assert.match(n[0].body, /main service/);
    // With a pending PRIMARY certificate it says that one is waiting.
    const id2 = await provider();
    await credential(id2, { category: 1, status: 'pending' });
    const v2 = await submission(id2);
    await q('select decide_identity_verification($1,true,$2,null)', [v2, ADMIN]);
    assert.deepEqual(await notes(id2), ['ID verified']);
  });
});
