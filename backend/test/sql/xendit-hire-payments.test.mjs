import { before, after, it } from 'node:test';
import assert from 'node:assert/strict';
import { migratedDatabase, APPROVED_CREDENTIAL_SQL } from './harness.mjs';

let db;
const client = '11111111-1111-1111-1111-111111111111';
const provider = '22222222-2222-2222-2222-222222222222';

before(async () => {
  db = await migratedDatabase();
  await db.query("insert into auth.users (id, raw_user_meta_data) values ($1, '{\"role\":\"client\"}'), ($2, '{\"role\":\"provider\"}')", [client, provider]);
  await db.query(`insert into provider_profiles
    (profile_id, category_id, bio, identity_verified)
    values ($1, 1, 'Experienced home-service provider', true)`, [provider]);
  await db.query(APPROVED_CREDENTIAL_SQL, [provider, 1]);
  const { rows: [job] } = await db.query(`insert into jobs
    (client_id, category_id, title, description, address, latitude, longitude)
    values ($1, 1, 'Hire test', 'A valid description for the job.', 'Lipa City', 13.9, 121.1)
    returning id`, [client]);
  await db.query(`insert into job_applications (job_id, provider_id)
    values ($1, $2)`, [job.id, provider]);
  const { rows: [application] } = await db.query('select id from job_applications where job_id = $1', [job.id]);
  await db.query(`insert into xendit_hire_payments
    (application_id, client_id, invoice_id, external_id, expected_amount, status)
    values ($1, $2, 'inv_test', 'hire_test_nonce', 1500, 'pending')`, [application.id, client]);
});

after(async () => {
  await db.close();
});

it('claims an invoice once and makes an abandoned processing claim recoverable after five minutes', async () => {
  const { rows: firstClaim } = await db.query(
    'select * from claim_xendit_hire_payment($1)',
    ['inv_test'],
  );
  assert.equal(firstClaim.length, 1);
  assert.equal(firstClaim[0].status, 'processing');

  const { rows: duplicateClaim } = await db.query(
    'select * from claim_xendit_hire_payment($1)',
    ['inv_test'],
  );
  assert.equal(duplicateClaim.length, 0);

  await db.query(`update xendit_hire_payments
    set last_attempt_at = now() - interval '6 minutes' where invoice_id = 'inv_test'`);
  const { rows: recoveredClaim } = await db.query(
    'select * from claim_xendit_hire_payment($1)',
    ['inv_test'],
  );
  assert.equal(recoveredClaim.length, 1);
  assert.equal(recoveredClaim[0].status, 'processing');
});

it('keeps invoice tracking and claiming private to the service role', async () => {
  const { rows: [tableAccess] } = await db.query(`select
    has_table_privilege('anon', 'xendit_hire_payments', 'select') as anon,
    has_table_privilege('authenticated', 'xendit_hire_payments', 'select') as signed_in,
    has_table_privilege('service_role', 'xendit_hire_payments', 'select') as service`);
  assert.deepEqual(tableAccess, { anon: false, signed_in: false, service: true });

  const { rows: [functionAccess] } = await db.query(`select
    has_function_privilege('anon', oid, 'execute') as anon,
    has_function_privilege('authenticated', oid, 'execute') as signed_in,
    has_function_privilege('service_role', oid, 'execute') as service
    from pg_proc where proname = 'claim_xendit_hire_payment'`);
  assert.deepEqual(functionAccess, { anon: false, signed_in: false, service: true });
});
