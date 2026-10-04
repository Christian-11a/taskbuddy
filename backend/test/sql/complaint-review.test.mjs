import { before, after, it } from 'node:test';
import assert from 'node:assert/strict';
import { migratedDatabase, readMigration } from './harness.mjs';
let db;
const client = '11111111-1111-1111-1111-111111111111';
const provider = '22222222-2222-2222-2222-222222222222';
const admin = '33333333-3333-3333-3333-333333333333';
const outsider = '44444444-4444-4444-4444-444444444444';
const query = async (sql, args = []) => (await db.query(sql, args)).rows;
const rpc = async (sql, args = []) => (await query(`select to_jsonb(${sql}) as result`, args))[0].result;
before(async () => {
  db = await migratedDatabase();
  for (const [id, role] of [[client, 'client'], [provider, 'provider'], [admin, 'admin'], [outsider, 'client']]) {
    await query('insert into auth.users(id, raw_user_meta_data) values ($1, $2)', [id, JSON.stringify({ role, full_name: role })]);
  }
  await query('insert into provider_profiles(profile_id, category_id, is_verified) values ($1, 1, true)', [provider]);
});
after(async () => { await db.close(); });
async function job(status = 'confirmed', funded = true) {
  const [{ id }] = await query(`insert into jobs(client_id, category_id, title, description, address, latitude, longitude, assigned_provider_id, status, budget)
    values ($1, 1, 'Case repair', 'Repair a leaking kitchen faucet and verify the water pressure.', 'QC', 14.6, 121, $2, $3, $4) returning id`, [client, provider, status, funded ? 500 : null]);
  if (funded) {
    await query("insert into wallet_transactions(profile_id, direction, kind, status, amount, title) values ($1, 'credit', 'topup', 'completed', 500, 'Fixture funding')", [client]);
    await rpc('escrow_place_hold($1, $2)', [id, provider]);
  }
  return id;
}
async function cancel(id, actor = client) {
  await query("update jobs set status = 'cancelled', cancelled_by = $2 where id = $1", [id, actor]);
  return (await query("select * from disputes where job_id = $1 and status = 'open'", [id]))[0];
}
const complaint = (id, actor = client) => rpc('raise_job_dispute($1,$2,$3,null)', [id, actor, 'Work quality']);
const entry = (id, actor, kind = 'statement', body = 'My statement', message = null) => rpc('add_dispute_entry($1,$2,$3,$4,$5)', [id, actor, kind, body, message]);
const resolve = (id, resolution = 'refunded_to_client', actor = admin, note = 'Reviewed statements from both participants.') => rpc('resolve_job_dispute($1,$2,$3,$4)', [id, actor, resolution, note]);
const payment = async (id) => (await query('select * from escrow_transactions where job_id = $1', [id]))[0];
const moneyRows = (id) => query("select kind, direction, amount::float as amount from wallet_transactions where job_id = $1 and kind in ('refund', 'payout')", [id]);

it('zero-budget participants can file, give evidence and receive a reasoned decision without fabricated escrow', async () => {
  const id = await job('in_progress', false);
  const c = await complaint(id, provider);
  assert.equal(c.escrow_id, null);
  await entry(c.id, client);
  await entry(c.id, provider, 'appeal', 'The checklist was completed');
  await entry(c.id, admin, 'clarification', 'Please explain the missing task');
  await assert.rejects(resolve(c.id, 'released_to_provider'), /No unsettled payment/);
  assert.equal((await resolve(c.id, 'reviewed')).status, 'resolved');
  assert.equal(await payment(id), undefined);
  assert.deepEqual(await moneyRows(id), []);
  assert.equal((await query('select * from dispute_entries where dispute_id = $1', [c.id])).length, 4);
});

it('pre-start cancellation freezes money, preserves evidence, and requires provider response', async () => {
  const id = await job();
  const c = await cancel(id);
  assert.equal(c.cancellation_state, 'pending');
  assert.equal((new Date(c.cancellation_deadline) - new Date(c.created_at)) / 3600000, 48);
  assert.equal((await payment(id)).status, 'disputed');
  assert.deepEqual(await moneyRows(id), []);
  const [{ id: conversation }] = await query('insert into conversations(job_id, client_id, provider_id) values ($1,$2,$3) returning id', [id, client, provider]);
  await query("insert into messages(conversation_id, sender_id, body) values ($1,$2,'Appointment discussion')", [conversation, provider]);
  await cancel(id);
  assert.equal((await query('select * from disputes where job_id = $1', [id])).length, 1);
  assert.equal((await query('select * from messages where conversation_id = $1', [conversation])).length, 1);
  await assert.rejects(rpc('respond_job_cancellation($1,$2,true,$3)', [c.id, client, 'Agreed']), /Only the assigned provider/);
  assert.equal((await rpc('respond_job_cancellation($1,$2,true,$3)', [c.id, provider, 'Agreed before starting'])).status, 'resolved');
  await assert.rejects(rpc('respond_job_cancellation($1,$2,true,$3)', [c.id, provider, 'Again']), /no longer/);
  assert.deepEqual(await moneyRows(id), [{ kind: 'refund', direction: 'credit', amount: 500 }]);
});

it('provider decline before starting refunds immediately, but never overrides an existing complaint', async () => {
  const id = await job();
  assert.equal(await cancel(id, provider), undefined);
  assert.equal((await payment(id)).status, 'cancelled');
  const contested = await job();
  const c = await complaint(contested);
  assert.equal((await cancel(contested, provider)).id, c.id);
  assert.equal((await payment(contested)).status, 'disputed');
  assert.deepEqual(await moneyRows(contested), []);
});

it('contested cancellations stay frozen beyond 48 hours until an admin decides once', async () => {
  const id = await job();
  const c = await cancel(id);
  await rpc('respond_job_cancellation($1,$2,false,$3)', [c.id, provider, 'Work preparation disputed']);
  await query("update disputes set cancellation_deadline = now() - interval '1 hour' where id = $1", [c.id]);
  await rpc('expire_job_cancellations()');
  assert.equal((await payment(id)).status, 'disputed');
  assert.deepEqual(await moneyRows(id), []);
  await resolve(c.id);
  await assert.rejects(resolve(c.id, 'released_to_provider'), /already closed/);
  assert.deepEqual(await moneyRows(id), [{ kind: 'refund', direction: 'credit', amount: 500 }]);
});

it('a timely complaint or appeal on a cancellation blocks automatic refund', async () => {
  for (const action of ['complaint', 'appeal']) {
    const id = await job();
    const c = await cancel(id);
    if (action === 'complaint') assert.equal((await complaint(id, provider)).id, c.id);
    else await entry(c.id, provider, 'appeal', 'I contest this cancellation');
    await query("update disputes set cancellation_deadline = now() - interval '1 hour' where id = $1", [c.id]);
    await rpc('expire_job_cancellations()');
    assert.equal((await payment(id)).status, 'disputed');
    assert.deepEqual(await moneyRows(id), []);
  }
});

it('the exact cancellation deadline closes the response window and refunds once on expiry', async () => {
  const id = await job();
  const c = await cancel(id);
  await assert.rejects(db.transaction(async (tx) => {
    await tx.query('update disputes set cancellation_deadline = now() where id = $1', [c.id]);
    await tx.query('select respond_job_cancellation($1,$2,false,$3)', [c.id, provider, 'Late contest']);
  }), /response window has ended/);
  await query('update disputes set cancellation_deadline = now() where id = $1', [c.id]);
  await rpc('expire_job_cancellations()');
  await rpc('expire_job_cancellations()');
  assert.equal((await query('select cancellation_state from disputes where id = $1', [c.id]))[0].cancellation_state, 'expired');
  assert.deepEqual(await moneyRows(id), [{ kind: 'refund', direction: 'credit', amount: 500 }]);
  assert.equal((await query("select * from dispute_entries where dispute_id = $1 and kind = 'system' and author_id is null", [c.id])).length, 1);
});

it('post-start cancellations require admin review for funded and zero-budget jobs', async () => {
  for (const funded of [true, false]) {
    const id = await job('in_progress', funded);
    const c = await cancel(id);
    assert.equal(c.cancellation_state, 'contested');
    assert.equal(c.cancellation_deadline, null);
    assert.deepEqual(await moneyRows(id), []);
    assert.equal((await rpc('expire_job_cancellations()')) >= 0, true);
    assert.equal((await query('select status from disputes where id = $1', [c.id]))[0].status, 'open');
  }
});

it('outsiders cannot file or submit evidence, participants cannot impersonate admin activity', async () => {
  const id = await job();
  await assert.rejects(complaint(id, outsider), /Not your job/);
  const c = await complaint(id);
  await assert.rejects(complaint(id), /already an open complaint/);
  await assert.rejects(entry(c.id, outsider), /Not your job/);
  await assert.rejects(entry(c.id, provider, 'clarification'), /Invalid participant/);
  await assert.rejects(entry(c.id, provider, 'resolution'), /Invalid participant/);
  await assert.rejects(resolve(c.id, 'refunded_to_client', provider), /Admin access/);
  await assert.rejects(resolve(c.id, 'refunded_to_client', admin, '   '), /resolution note/);
});

it('case evidence must be the actor’s own message from the same job and remains retained', async () => {
  const id = await job();
  const c = await complaint(id);
  const otherJob = await job();
  const [{ id: conversation }] = await query('insert into conversations(job_id, client_id, provider_id) values($1,$2,$3) returning id', [id, client, provider]);
  const [{ id: otherConversation }] = await query('insert into conversations(job_id, client_id, provider_id) values($1,$2,$3) returning id', [otherJob, client, provider]);
  const [{ id: photo }] = await query("insert into messages(conversation_id, sender_id, body, attachment_path) values($1,$2,'','photo.jpg') returning id", [conversation, provider]);
  const [{ id: otherMessage }] = await query("insert into messages(conversation_id, sender_id, body) values($1,$2,'Other job') returning id", [otherConversation, provider]);
  await assert.rejects(entry(c.id, client, 'statement', 'Someone else’s photo', photo), /your own message/);
  await assert.rejects(entry(c.id, provider, 'statement', 'Another job', otherMessage), /your own message/);
  const e = await entry(c.id, provider, 'statement', 'Completed repair photo', photo);
  assert.equal(e.message_id, photo);
  await assert.rejects(query('delete from messages where id = $1', [photo]), /foreign key/);
});

it('resolution, payout, audit and notification roll back together on failure', async () => {
  const id = await job();
  const c = await complaint(id);
  await db.exec(`create function reject_resolution_notice() returns trigger language plpgsql as $$ begin
    if new.title = 'Complaint resolved' then raise exception 'Injected notification failure'; end if; return new; end; $$;
    create trigger reject_resolution_notice before insert on notifications for each row execute function reject_resolution_notice();`);
  try {
    await assert.rejects(resolve(c.id, 'released_to_provider'), /Injected notification/);
  } finally { await db.exec('drop trigger reject_resolution_notice on notifications; drop function reject_resolution_notice();'); }
  assert.equal((await payment(id)).status, 'disputed');
  assert.equal((await query('select status from disputes where id = $1', [c.id]))[0].status, 'open');
  assert.deepEqual(await moneyRows(id), []);
  assert.equal((await query('select * from admin_actions where target_id = $1', [c.id])).length, 0);
  assert.equal((await query('select * from dispute_entries where dispute_id = $1', [c.id])).length, 0);
});

it('settled-payment appeals reopen review while preserving earlier decisions and money', async () => {
  const id = await job();
  const c = await complaint(id);
  await resolve(c.id, 'released_to_provider');
  await entry(c.id, provider, 'appeal', 'Please reconsider the recorded decision');
  await assert.rejects(resolve(c.id, 'refunded_to_client'), /No unsettled payment/);
  await resolve(c.id, 'reviewed');
  assert.deepEqual(await moneyRows(id), [{ kind: 'payout', direction: 'credit', amount: 500 }]);
  assert.equal((await query("select * from dispute_entries where dispute_id = $1 and kind = 'resolution'", [c.id])).length, 2);
  assert.equal((await query("select * from admin_actions where target_id = $1 and action = 'dispute.resolve'", [c.id])).length, 2);
});

it('case notifications target both participants and carry the case ID; admin clarification is audited', async () => {
  const id = await job('in_progress', false);
  const c = await complaint(id);
  await entry(c.id, admin, 'clarification', 'What happened at the appointment?');
  const notices = await query("select recipient_id, title from notifications where data->>'dispute_id' = $1", [c.id]);
  assert.equal(notices.filter((n) => n.title === 'Complaint opened').length, 2);
  assert.equal(notices.filter((n) => n.title === 'More information requested').length, 2);
  assert.equal((await query("select * from admin_actions where target_id = $1 and action = 'dispute.clarification'", [c.id])).length, 1);
});

it('migration is repeatable and only the service role can write case activity', async () => {
  await db.exec(readMigration('0041_complaints_and_cancellation_review.sql'));
  for (const fn of ['add_dispute_entry(uuid,uuid,text,text,uuid)', 'respond_job_cancellation(uuid,uuid,boolean,text,uuid)', 'expire_job_cancellations()', 'resolve_job_dispute(uuid,uuid,text,text)']) {
    for (const role of ['anon', 'authenticated']) assert.equal(await rpc("has_function_privilege($1,$2,'EXECUTE')", [role, fn]), false);
    assert.equal(await rpc("has_function_privilege('service_role',$1,'EXECUTE')", [fn]), true);
  }
  assert.equal((await query("select * from pg_policies where tablename = 'dispute_entries' and cmd <> 'SELECT'")).length, 0);
});


it('admin-decided pre-start cancellations remain appealable after the response deadline without repeating payment', async () => {
  const id = await job();
  const c = await cancel(id);
  await resolve(c.id);
  await query("update disputes set cancellation_deadline = now() - interval '1 hour' where id = $1", [c.id]);
  assert.equal((await entry(c.id, provider, 'appeal', 'Please reconsider the evidence')).kind, 'appeal');
  await resolve(c.id, 'reviewed');
  assert.deepEqual(await moneyRows(id), [{ kind: 'refund', direction: 'credit', amount: 500 }]);
});

it('contesting cancellation preserves the complete reason and details', async () => {
  const id = await job();
  const c = await cancel(id);
  const reason = 'R'.repeat(200);
  const details = 'D'.repeat(1000);
  await rpc('raise_job_dispute($1,$2,$3,$4)', [id, provider, reason, details]);
  const entries = await query('select kind, body from dispute_entries where dispute_id = $1 order by kind', [c.id]);
  assert.deepEqual(entries, [{ kind: 'appeal', body: reason }, { kind: 'statement', body: details }]);
});
