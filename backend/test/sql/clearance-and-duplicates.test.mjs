/**
 * NBI/police clearance as part of verification, and duplicate signals
 * (migration 0082), on real Postgres (see harness.mjs). Run with `npm run test:sql`.
 */
import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { migratedDatabase, promoteAdmins } from './harness.mjs';

let db;
let seq = 0;
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const ADMIN = '99999999-9999-9999-9999-999999999999';
const CLIENT = '11111111-1111-1111-1111-111111111111';
const NEXT_YEAR = "((now() at time zone 'Asia/Manila')::date + 365)";
const YESTERDAY = "((now() at time zone 'Asia/Manila')::date - 1)";

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
  await q('select set_clearance_required(false)');
  await db.close();
});

/** Verified under the ID + certificate rule (0068). */
async function verifiedProvider({ phone = null } = {}) {
  seq += 1;
  const id = `77777777-7777-7777-7777-${String(seq).padStart(12, '0')}`;
  await q('insert into auth.users(id,raw_user_meta_data) values($1,$2)', [
    id,
    JSON.stringify({ role: 'provider', full_name: `P${seq}` }),
  ]);
  if (phone) await q('update profiles set phone=$2 where id=$1', [id, phone]);
  await q(
    "insert into provider_profiles(profile_id,category_id,bio) values($1,1,'Licensed plumber with years of experience')",
    [id],
  );
  const [{ id: v }] = await q(
    "insert into provider_verifications(provider_id,id_document_path,selfie_path) values ($1,'p/id.jpg','p/s.jpg') returning id",
    [id],
  );
  await q('select decide_identity_verification($1,true,$2,null)', [v, ADMIN]);
  const [{ id: c }] = await q(
    `insert into provider_credentials(provider_id,category_id,credential_type,title,issuer,document_path,credential_number)
     values ($1::uuid,1,'tesda_nc','NC II','TESDA',$1::uuid::text||'/'||gen_random_uuid()::text||'.png','NC-${seq}-0001') returning id`,
    [id],
  );
  await q('select decide_credential($1,true,$2,null)', [c, ADMIN]);
  return id;
}

const verified = async (id) =>
  (await q('select is_verified from provider_profiles where profile_id=$1', [id]))[0].is_verified;

async function clearance(providerId, { expires = NEXT_YEAR, number = null, type = 'nbi' } = {}) {
  const [{ id }] = await q(
    `insert into provider_clearances(provider_id,clearance_type,clearance_number,expires_on,document_path)
     values ($1::uuid,$2,$3,${expires},$1::uuid::text||'/'||gen_random_uuid()::text||'.jpg') returning id`,
    [providerId, type, number ?? `NBI-${providerId.slice(-6)}-${Math.random().toString(36).slice(2, 8)}`],
  );
  return id;
}

describe('clearance as part of verification', () => {
  it('changes nothing while the requirement is off', async () => {
    const p = await verifiedProvider();
    assert.equal(await verified(p), true);
    const c = await clearance(p);
    await q('select decide_clearance($1,false,$2,$3)', [c, ADMIN, 'Photo is blurry']);
    assert.equal(await verified(p), true);
  });

  it('turning it on removes Verified until an approved, unexpired clearance, and gates proposals', async () => {
    const p = await verifiedProvider();
    const changed = (await q('select set_clearance_required(true) as n'))[0].n;
    assert.ok(changed >= 1);
    assert.equal(await verified(p), false);
    assert.deepEqual(await q('select category_id from provider_approved_categories($1)', [p]), []);

    const c = await clearance(p);
    assert.equal(await verified(p), false, 'pending does not count');
    const result = (await q('select decide_clearance($1,true,$2,null) as r', [c, ADMIN]))[0].r;
    assert.equal(result.verified, true);
    assert.equal(await verified(p), true);
    assert.equal((await q('select count(*)::int as n from provider_approved_categories($1)', [p]))[0].n, 1);

    const [note] = await q("select title from notifications where recipient_id=$1 and title='Clearance approved'", [p]);
    assert.ok(note);
    const [audit] = await q("select 1 as ok from admin_actions where action='clearance.approve' and target_id=$1", [c]);
    assert.ok(audit);
    await q('select set_clearance_required(false)');
  });

  it('a proposal without a required clearance is refused with a clearance message, not a certificate one', async () => {
    const p = await verifiedProvider();
    await q('select set_clearance_required(true)');
    const [{ id: job }] = await q(
      `insert into jobs (client_id, category_id, title, description, address, latitude, longitude)
       values ($1, 1, 'Fix sink', 'A valid description for the job.', 'Lipa City', 13.9, 121.1) returning id`,
      [CLIENT],
    );
    await assert.rejects(
      q('insert into job_applications(job_id, provider_id) values ($1,$2)', [job, p]),
      /NBI or police clearance/,
    );
    await q('select set_clearance_required(false)');
    await q('insert into job_applications(job_id, provider_id) values ($1,$2)', [job, p]);
  });

  it('an expired clearance does not count, and cannot be approved', async () => {
    const p = await verifiedProvider();
    await q('select set_clearance_required(true)');
    const c = await clearance(p, { expires: YESTERDAY });
    await assert.rejects(q('select decide_clearance($1,true,$2,null)', [c, ADMIN]), /expired/);
    assert.equal(await verified(p), false);
    await q('select set_clearance_required(false)');
  });

  it('a rejection needs a reason and tells the provider', async () => {
    const p = await verifiedProvider();
    const c = await clearance(p);
    await assert.rejects(q('select decide_clearance($1,false,$2,$3)', [c, ADMIN, '  ']), /reason/);
    await q('select decide_clearance($1,false,$2,$3)', [c, ADMIN, 'Wrong person on the clearance']);
    const [row] = await q('select status, rejection_reason from provider_clearances where id=$1', [c]);
    assert.deepEqual(row, { status: 'rejected', rejection_reason: 'Wrong person on the clearance' });
    await assert.rejects(q('select decide_clearance($1,true,$2,null)', [c, ADMIN]), /already rejected/);
  });

  it('only one clearance under review at a time', async () => {
    const p = await verifiedProvider();
    await clearance(p);
    await assert.rejects(clearance(p), /provider_clearances_one_pending/);
  });

  it('revoking a clearance removes Verified when it is required, and is audited', async () => {
    const p = await verifiedProvider();
    await q('select set_clearance_required(true)');
    const c = await clearance(p);
    await q('select decide_clearance($1,true,$2,null)', [c, ADMIN]);
    assert.equal(await verified(p), true);
    const r = (await q('select admin_revoke_verification($1,$2,$3,$4) as r', ['clearance', c, ADMIN, 'The clearance number does not match NBI records.']))[0].r;
    assert.equal(r.verified, false);
    const [row] = await q('select status, revoke_reason from provider_clearances where id=$1', [c]);
    assert.equal(row.status, 'revoked');
    const [audit] = await q("select 1 as ok from admin_actions where action='clearance.revoke' and target_id=$1", [c]);
    assert.ok(audit);
    await assert.rejects(q("update provider_clearances set status='approved' where id=$1", [c]), /already revoked/);
    await q('select set_clearance_required(false)');
  });

  it('identity and certificate revokes still work as in 0080', async () => {
    const p = await verifiedProvider();
    const [{ id: v }] = await q("select id from provider_verifications where provider_id=$1 and status='approved'", [p]);
    const r = (await q('select admin_revoke_verification($1,$2,$3,$4) as r', ['identity', v, ADMIN, 'The ID photo was edited badly.']))[0].r;
    assert.equal(r.verified, false);
    await assert.rejects(q('select admin_revoke_verification($1,$2,$3,$4)', ['other', v, ADMIN, 'Some long enough reason']), /Unknown verification kind/);
  });

  it('only the service role may call the new functions', async () => {
    for (const fn of ['decide_clearance(uuid,boolean,uuid,text)', 'set_clearance_required(boolean)', 'provider_duplicate_signals(uuid)']) {
      const [{ g }] = await q(`select has_function_privilege('authenticated', '${fn}', 'execute') as g`);
      assert.equal(g, false, fn);
    }
  });
});

describe('duplicate signals', () => {
  const signals = (id) => q('select kind, other_id, other_status from provider_duplicate_signals($1)', [id]);

  it('finds a certificate number used on another account, ignoring spaces, dashes and case', async () => {
    const a = await verifiedProvider();
    const b = await verifiedProvider();
    await q("update provider_credentials set credential_number='nc 12-3456' where provider_id=$1", [a]);
    await q("update provider_credentials set credential_number='NC-123456' where provider_id=$1", [b]);
    const s = await signals(a);
    assert.deepEqual(s.filter((x) => x.kind === 'certificate_number').map((x) => x.other_id), [b]);
  });

  it('finds a clearance number used on another account', async () => {
    const a = await verifiedProvider();
    const b = await verifiedProvider();
    await clearance(a, { number: 'A12345678' });
    await clearance(b, { number: 'a1234-5678' });
    assert.ok((await signals(a)).some((x) => x.kind === 'clearance_number' && x.other_id === b));
  });

  it('finds the same uploaded file under another account, not the provider\'s own copies', async () => {
    const a = await verifiedProvider();
    const b = await verifiedProvider();
    await q(
      `insert into storage.objects(bucket_id,name,metadata) values
        ('verification-docs', $1||'/x1.jpg', '{"eTag":"\\"abc\\""}'),
        ('verification-docs', $1||'/x2.jpg', '{"eTag":"\\"abc\\""}'),
        ('provider-credentials', $2||'/y.jpg', '{"eTag":"\\"abc\\""}'),
        ('provider-credentials', $2||'/z.jpg', '{"eTag":"\\"zzz\\""}')`,
      [a, b],
    );
    const docs = (await signals(a)).filter((x) => x.kind === 'document');
    assert.deepEqual(docs.map((x) => x.other_id), [b]);
  });

  it('finds the same phone and says when that account is suspended', async () => {
    const a = await verifiedProvider({ phone: '+63 917 123 4567' });
    const b = await verifiedProvider({ phone: '09171234567' });
    await q('update profiles set deactivated_at=now() where id=$1', [b]);
    const phone = (await signals(a)).filter((x) => x.kind === 'phone');
    assert.deepEqual(phone, [{ kind: 'phone', other_id: b, other_status: 'suspended' }]);
  });

  it('reports nothing for a provider with nothing shared', async () => {
    const a = await verifiedProvider();
    assert.deepEqual(await signals(a), []);
  });
});
