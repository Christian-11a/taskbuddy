/**
 * Revoking a verification (migration 0080), on real Postgres (see harness.mjs).
 * Run with `npm run test:sql`.
 */
import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { migratedDatabase, promoteAdmins } from './harness.mjs';

let db;
let seq = 0;
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const ADMIN = '99999999-9999-9999-9999-999999999999';
const CLIENT = '11111111-1111-1111-1111-111111111111';
const REASON = 'The certificate number does not match TESDA records.';

before(async () => {
  db = await migratedDatabase();
  await q('insert into auth.users(id,raw_user_meta_data) values($1,$2),($3,$4)', [
    ADMIN,
    JSON.stringify({ role: 'admin', full_name: 'Admin' }),
    CLIENT,
    JSON.stringify({ role: 'client', full_name: 'Client' }),
  ]);
  await promoteAdmins(db);
});
after(async () => {
  await db.close();
});

/** A verified provider: approved identity submission + approved certificate. */
async function verifiedProvider() {
  seq += 1;
  const id = `55555555-5555-5555-5555-${String(seq).padStart(12, '0')}`;
  await q('insert into auth.users(id,raw_user_meta_data) values($1,$2)', [
    id,
    JSON.stringify({ role: 'provider', full_name: `P${seq}` }),
  ]);
  await q(
    "insert into provider_profiles(profile_id,category_id,bio) values($1,1,'Licensed plumber with years of experience')",
    [id],
  );
  const [{ id: verification }] = await q(
    "insert into provider_verifications(provider_id,id_document_path,selfie_path) values ($1,'p/id.jpg','p/s.jpg') returning id",
    [id],
  );
  await q('select decide_identity_verification($1,true,$2,null)', [verification, ADMIN]);
  const [{ id: credential }] = await q(
    `insert into provider_credentials(provider_id,category_id,credential_type,title,issuer,document_path)
     values ($1::uuid,1,'tesda_nc','NC II','TESDA',$1::uuid::text||'/'||gen_random_uuid()::text||'.png') returning id`,
    [id],
  );
  await q('select decide_credential($1,true,$2,null)', [credential, ADMIN]);
  assert.equal(await verified(id), true);
  return { id, verification, credential };
}

const verified = async (id) =>
  (await q('select is_verified from provider_profiles where profile_id=$1', [id]))[0].is_verified;

const revoke = (kind, id, reason = REASON) =>
  q('select admin_revoke_verification($1,$2,$3,$4) as r', [kind, id, ADMIN, reason]).then(
    (rows) => rows[0].r,
  );

async function application(providerId) {
  const [{ id: job }] = await q(
    `insert into jobs (client_id, category_id, title, description, address, latitude, longitude)
     values ($1, 1, 'Fix sink', 'A valid description for the job.', 'Lipa City', 13.9, 121.1) returning id`,
    [CLIENT],
  );
  const [{ id }] = await q(
    'insert into job_applications(job_id, provider_id) values ($1,$2) returning id',
    [job, providerId],
  );
  return id;
}
const appStatus = async (id) =>
  (await q('select status from job_applications where id=$1', [id]))[0].status;

describe('admin_revoke_verification', () => {
  it('revoking the identity removes Verified, records who and why, and tells the provider', async () => {
    const p = await verifiedProvider();
    const result = await revoke('identity', p.verification);
    assert.equal(result.verified, false);
    assert.equal(await verified(p.id), false);

    const [row] = await q(
      'select status::text, revoked_by, revoke_reason, revoked_at is not null as at from provider_verifications where id=$1',
      [p.verification],
    );
    assert.deepEqual(row, { status: 'revoked', revoked_by: ADMIN, revoke_reason: REASON, at: true });
    const [profile] = await q('select identity_verified from provider_profiles where profile_id=$1', [p.id]);
    assert.equal(profile.identity_verified, false);

    const [note] = await q(
      "select body from notifications where recipient_id=$1 and title='Verification revoked'",
      [p.id],
    );
    assert.match(note.body, /ID verification was revoked: The certificate number/);
    assert.match(note.body, /Upload new documents/);

    const [audit] = await q(
      "select actor_id, target_type, metadata->>'reason' as reason from admin_actions where action='verification.revoke' and target_id=$1",
      [p.verification],
    );
    assert.deepEqual(audit, { actor_id: ADMIN, target_type: 'provider_verifications', reason: REASON });
  });

  it('revoking a certificate removes Verified and keeps the row on record', async () => {
    const p = await verifiedProvider();
    await revoke('credential', p.credential);
    assert.equal(await verified(p.id), false);
    const [row] = await q('select status, revoke_reason from provider_credentials where id=$1', [p.credential]);
    assert.deepEqual(row, { status: 'revoked', revoke_reason: REASON });
    const [audit] = await q("select 1 as ok from admin_actions where action='credential.revoke' and target_id=$1", [
      p.credential,
    ]);
    assert.ok(audit);
    const [cert] = await q('select certificate_status from admin_user_certificates where id=$1', [p.id]);
    assert.equal(cert.certificate_status, 'revoked');
  });

  it('withdraws pending proposals, keeps hired ones and ones the client is paying for', async () => {
    const p = await verifiedProvider();
    const open = await application(p.id);
    const paying = await application(p.id);
    const hired = await application(p.id);
    await q("update job_applications set status='accepted' where id=$1", [hired]);
    await q(
      "insert into xendit_hire_payments(application_id, client_id, external_id, expected_amount, status) values ($1,$2,'ext-1',500,'pending')",
      [paying, CLIENT],
    );

    const result = await revoke('credential', p.credential);
    assert.equal(result.withdrawn_proposals, 1);
    assert.equal(await appStatus(open), 'withdrawn');
    assert.equal(await appStatus(paying), 'pending');
    assert.equal(await appStatus(hired), 'accepted');
  });

  it('withdraws proposals for a secondary service whose certificate was revoked, keeping the main badge', async () => {
    const p = await verifiedProvider();
    await q('insert into provider_secondary_categories(provider_id, category_id) values ($1, 2)', [p.id]);
    const [{ id: second }] = await q(
      `insert into provider_credentials(provider_id,category_id,credential_type,title,issuer,document_path)
       values ($1::uuid,2,'tesda_nc','EIM NC II','TESDA',$1::uuid::text||'/'||gen_random_uuid()::text||'.png') returning id`,
      [p.id],
    );
    await q('select decide_credential($1,true,$2,null)', [second, ADMIN]);
    const main = await application(p.id);
    const [{ id: job2 }] = await q(
      `insert into jobs (client_id, category_id, title, description, address, latitude, longitude)
       values ($1, 2, 'Fix outlet', 'A valid description for the job.', 'Lipa City', 13.9, 121.1) returning id`,
      [CLIENT],
    );
    const [{ id: other }] = await q(
      'insert into job_applications(job_id, provider_id) values ($1,$2) returning id',
      [job2, p.id],
    );

    const result = await revoke('credential', second);
    assert.equal(result.verified, true);
    assert.equal(result.withdrawn_proposals, 1);
    assert.equal(await appStatus(other), 'withdrawn');
    assert.equal(await appStatus(main), 'pending');
  });

  it('refuses pending, rejected and already-revoked items, a short reason and an unknown id', async () => {
    const p = await verifiedProvider();
    await assert.rejects(revoke('identity', p.verification, 'too short'), /10 to 500/);
    await revoke('identity', p.verification);
    await assert.rejects(revoke('identity', p.verification), /already revoked/);

    const [{ id: pendingCred }] = await q(
      `insert into provider_credentials(provider_id,category_id,credential_type,title,issuer,document_path)
       values ($1::uuid,1,'tesda_nc','NC II','TESDA',$1::uuid::text||'/x.png') returning id`,
      [p.id],
    );
    await assert.rejects(revoke('credential', pendingCred), /Only an approved/);
    await q('select decide_credential($1,false,$2,$3)', [pendingCred, ADMIN, 'Blurry photo']);
    await assert.rejects(revoke('credential', pendingCred), /Only an approved/);
    await assert.rejects(revoke('credential', '00000000-0000-0000-0000-000000000000'), /not found/);
    await assert.rejects(revoke('other', p.credential), /Unknown verification kind/);
  });

  it('a revoke is the only change allowed after a decision', async () => {
    const p = await verifiedProvider();
    await assert.rejects(
      q("update provider_credentials set status='pending' where id=$1", [p.credential]),
      /already approved/,
    );
    await revoke('credential', p.credential);
    await assert.rejects(
      q("update provider_credentials set status='approved' where id=$1", [p.credential]),
      /already revoked/,
    );
    await assert.rejects(
      q("update provider_verifications set status='rejected' where id=$1", [p.verification]),
      /already approved/,
    );
  });

  it('the provider can get verified again with new documents', async () => {
    const p = await verifiedProvider();
    await revoke('identity', p.verification);
    const [{ id: again }] = await q(
      "insert into provider_verifications(provider_id,id_document_path,selfie_path) values ($1,'p/id2.jpg','p/s2.jpg') returning id",
      [p.id],
    );
    await q('select decide_identity_verification($1,true,$2,null)', [again, ADMIN]);
    assert.equal(await verified(p.id), true);
  });

  it('an old-API is_verified write cannot bring a revoked identity back', async () => {
    const p = await verifiedProvider();
    await revoke('identity', p.verification);
    await q('update provider_profiles set is_verified = true where profile_id=$1', [p.id]);
    assert.equal(await verified(p.id), false);
  });

  it('only the service role may call it', async () => {
    const [{ granted }] = await q(
      "select has_function_privilege('authenticated', 'admin_revoke_verification(text,uuid,uuid,text)', 'execute') as granted",
    );
    assert.equal(granted, false);
  });
});
