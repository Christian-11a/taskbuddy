import { before, after, it } from 'node:test';
import assert from 'node:assert/strict';
import { migratedDatabase, readMigration } from './harness.mjs';
let db, primaryRequest;
const client = '11111111-1111-1111-1111-111111111111';
const provider = '22222222-2222-2222-2222-222222222222';
const admin = '33333333-3333-3333-3333-333333333333';
const query = async (sql, args = []) => (await db.query(sql, args)).rows;
before(async () => {
  db = await migratedDatabase();
  for (const [id, role] of [
    [client, 'client'],
    [provider, 'provider'],
    [admin, 'admin'],
  ])
    await query('insert into auth.users(id,raw_user_meta_data) values($1,$2)', [
      id,
      JSON.stringify({ role, full_name: role }),
    ]);
  await query('update profiles set latitude=14.6, longitude=121 where id=$1', [
    provider,
  ]);
  await query(
    "insert into provider_profiles(profile_id,category_id,bio,years_experience,is_verified,is_available,service_radius_km) values($1,1,'Experienced provider offering reliable home services',5,true,true,50)",
    [provider],
  );
});
after(async () => {
  await db.close();
});
async function job(category = 2) {
  return (
    await query(
      "insert into jobs(client_id,category_id,title,description,address,latitude,longitude,status,budget) values($1,$2,'Approved service work','Inspect and repair the leaking faucet and test the water pressure','QC',14.6,121,'open',500) returning id",
      [client, category],
    )
  )[0].id;
}
async function request(type, category) {
  return (
    await query(
      "insert into skill_change_requests(provider_id,type,category_id,reason) values($1,$2,$3,'I have training in this service') returning id",
      [provider, type, category],
    )
  )[0].id;
}
const decide = (id, status = 'approved') =>
  query('select review_service_request($1,$2,$3,$4)', [
    id,
    admin,
    status,
    'Validated service training',
  ]);
it('pending/rejected services confer no eligibility; approved secondary services permit matching, applications and hiring', async () => {
  const id = await job();
  const r = await request('add_secondary', 2);
  assert.deepEqual(
    (
      await query(
        'select category_id from provider_approved_categories($1) order by category_id',
        [provider],
      )
    ).map((row) => row.category_id),
    [1],
  );
  await assert.rejects(
    query('insert into job_applications(job_id,provider_id) values($1,$2)', [
      id,
      provider,
    ]),
    /approved skill/,
  );
  await decide(r, 'rejected');
  assert.equal(
    (await query('select * from fn_job_provider_features($1)', [id])).length,
    0,
  );
  const approved = await request('add_secondary', 2);
  await decide(approved);
  assert.deepEqual(
    (
      await query(
        'select category_id from provider_approved_categories($1) order by category_id',
        [provider],
      )
    ).map((row) => row.category_id),
    [1, 2],
  );
  assert.equal(
    (await query('select * from fn_job_provider_features($1)', [id]))[0]
      .provider_id,
    provider,
  );
  const [{ id: application }] = await query(
    'insert into job_applications(job_id,provider_id) values($1,$2) returning id',
    [id, provider],
  );
  primaryRequest = await request('change_primary', 3);
  await query(
    "insert into wallet_transactions(profile_id,direction,kind,status,amount,title) values($1,'credit','topup','completed',500,'Fixture funds')",
    [client],
  );
  await query('select escrow_place_hold($1,$2)', [id, provider]);
  await query("update job_applications set status='accepted' where id=$1", [
    application,
  ]);
  assert.equal(
    (await query('select status from jobs where id=$1', [id]))[0].status,
    'confirmed',
  );
});
it('approval rechecks work accepted after the request was filed and leaves the decision/audit unchanged', async () => {
  await assert.rejects(decide(primaryRequest), /Finish accepted jobs/);
  assert.equal(
    (
      await query('select status from skill_change_requests where id=$1', [
        primaryRequest,
      ])
    )[0].status,
    'pending',
  );
  assert.equal(
    (
      await query(
        'select category_id from provider_profiles where profile_id=$1',
        [provider],
      )
    )[0].category_id,
    1,
  );
  assert.equal(
    (
      await query('select * from admin_actions where target_id=$1', [
        primaryRequest,
      ])
    ).length,
    0,
  );
});
it('changing an assigned job category rechecks approved services and rolls back an ineligible change', async () => {
  await assert.rejects(
    query('update jobs set category_id=3 where assigned_provider_id=$1', [
      provider,
    ]),
    /approved skill/,
  );
  assert.equal(
    (
      await query(
        'select category_id from jobs where assigned_provider_id=$1',
        [provider],
      )
    )[0].category_id,
    2,
  );
});
it('an old application cannot assign a provider after their approved service changes', async () => {
  await query(
    "update jobs set status='completed', completed_at=now() where assigned_provider_id=$1",
    [provider],
  );
  const id = await job(1);
  const [{ id: application }] = await query(
    'insert into job_applications(job_id,provider_id) values($1,$2) returning id',
    [id, provider],
  );
  await decide(primaryRequest);
  await assert.rejects(
    query("update job_applications set status='accepted' where id=$1", [
      application,
    ]),
    /approved skill/,
  );
  assert.equal(
    (
      await query('select status from job_applications where id=$1', [
        application,
      ])
    )[0].status,
    'pending',
  );
  assert.equal(
    (await query('select assigned_provider_id from jobs where id=$1', [id]))[0]
      .assigned_provider_id,
    null,
  );
});
it('migration replay preserves approved services and service-role review privileges', async () => {
  await db.exec(readMigration('0043_approved_services_consistency.sql'));
  assert.deepEqual(
    (
      await query(
        'select category_id from provider_approved_categories($1) order by category_id',
        [provider],
      )
    ).map((row) => row.category_id),
    [2, 3],
  );
  assert.equal(
    (
      await query(
        "select has_function_privilege('authenticated','review_service_request(uuid,uuid,text,text)','execute') as allowed",
      )
    )[0].allowed,
    false,
  );
});
