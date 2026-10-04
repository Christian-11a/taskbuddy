import { before, after, it } from 'node:test';
import assert from 'node:assert/strict';
import { migratedDatabase, readMigration } from './harness.mjs';
let db;
const provider = '22222222-2222-2222-2222-222222222222';
const admin = '33333333-3333-3333-3333-333333333333';
const client = '11111111-1111-1111-1111-111111111111';
const query = async (sql, args = []) => (await db.query(sql, args)).rows;
before(async () => {
  db = await migratedDatabase();
  for (const [id, role] of [[provider, 'provider'], [admin, 'admin'], [client, 'client']]) {
    await query('insert into auth.users(id, raw_user_meta_data) values($1,$2)', [id, JSON.stringify({ role, full_name: role })]);
  }
  await query('insert into provider_profiles(profile_id,category_id) values($1,1)', [provider]);
});
after(async () => { await db.close(); });
async function request(type = 'add_secondary') {
  return (await query("insert into skill_change_requests(provider_id,type,category_id,reason) values($1,$2,2,'Qualified in this service') returning id", [provider, type]))[0].id;
}
const notices = (id) => query("select * from notifications where data->>'request_id' = $1 order by created_at,id", [id]);
const review = (id, status) => query('select review_service_request($1,$2,$3,$4)', [id, admin, status, 'Reviewed supporting evidence']);
it('submission and decisions notify exactly once with request IDs and notes', async () => {
  const id = await request();
  assert.equal((await notices(id)).length, 1);
  await review(id, 'approved');
  await assert.rejects(review(id, 'rejected'), /already been decided/);
  const rows = await notices(id);
  assert.equal(rows.length, 2);
  const decision = rows.find((row) => row.data.status === 'approved');
  assert.equal(decision.recipient_id, provider);
  assert.equal(decision.data.review_note, 'Reviewed supporting evidence');
  assert.equal((await query('select * from provider_secondary_categories where provider_id=$1 and category_id=2', [provider])).length, 1);
});
it('rejection preserves services and records an audited reason', async () => {
  const id = await request('change_primary');
  await review(id, 'rejected');
  assert.equal((await notices(id)).length, 2);
  assert.equal((await query('select category_id from provider_profiles where profile_id=$1', [provider]))[0].category_id, 1);
  assert.equal((await query('select * from admin_actions where target_id=$1', [id])).length, 1);
});
it('notification failure rolls back decision, service change and audit', async () => {
  const id = await request('change_primary');
  await db.exec(`create function refuse_decision_notice() returns trigger language plpgsql as $$ begin
    if new.data->>'status' = 'approved' then raise exception 'Injected notification failure'; end if; return new;
    end; $$; create trigger refuse_decision before insert on notifications for each row execute function refuse_decision_notice();`);
  try {
    await assert.rejects(review(id, 'approved'), /Injected notification failure/);
    assert.equal((await query('select status from skill_change_requests where id=$1', [id]))[0].status, 'pending');
    assert.equal((await query('select category_id from provider_profiles where profile_id=$1', [provider]))[0].category_id, 1);
    assert.equal((await query('select * from admin_actions where target_id=$1', [id])).length, 0);
    assert.equal((await notices(id)).length, 1);
  } finally { await db.exec('drop trigger refuse_decision on notifications; drop function refuse_decision_notice();'); }
  await review(id, 'approved');
});
it('only admins can decide and the migration replays without duplicate delivery', async () => {
  const id = await request();
  await assert.rejects(query('select review_service_request($1,$2,$3,null)', [id, provider, 'approved']), /Admin access/);
  await review(id, 'rejected');
  await db.exec(readMigration('0042_service_request_notifications.sql'));
  assert.equal((await notices(id)).length, 2);
  const [{ allowed }] = await query("select has_function_privilege('authenticated','review_service_request(uuid,uuid,text,text)','execute') as allowed");
  assert.equal(allowed, false);
});
it('text and photo messages create one recipient notice with every routing ID', async () => {
  const [{ id: job }] = await query(`insert into jobs(client_id,category_id,title,description,address,latitude,longitude,assigned_provider_id,status)
    values($1,1,'Repair notification','Repair the leaking faucet and inspect the water pressure','QC',14.6,121,$2,'in_progress') returning id`, [client, provider]);
  const [{ id: conversation }] = await query('insert into conversations(job_id,client_id,provider_id) values($1,$2,$3) returning id', [job, client, provider]);
  for (const [sender, body, path] of [[client, 'Hello provider', null], [provider, '', `${provider}/photo.jpg`]]) {
    const [{ id }] = await query('insert into messages(conversation_id,sender_id,body,attachment_path) values($1,$2,$3,$4) returning id', [conversation, sender, body, path]);
    const rows = await query("select * from notifications where data->>'message_id'=$1", [id]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].recipient_id, sender === client ? provider : client);
    assert.equal(rows[0].data.job_id, job);
    assert.equal(rows[0].data.conversation_id, conversation);
  }
});
it('snapshot is recipient-scoped, limits rows to 50 and counts all unread rows', async () => {
  await query("insert into notifications(recipient_id,type,title,body) select $1,'job_update','Batch notice','Test' from generate_series(1,100)", [provider]);
  const [{ snapshot }] = await query('select notification_snapshot($1) as snapshot', [provider]);
  const [{ count }] = await query('select count(*)::int as count from notifications where recipient_id=$1 and read_at is null', [provider]);
  assert.equal(snapshot.notifications.length, 50);
  assert.equal(snapshot.unreadCount, count);
  assert.ok(snapshot.notifications.every((row) => row.recipient_id === provider));
  assert.equal((await query("select has_function_privilege('authenticated','notification_snapshot(uuid)','execute') as allowed"))[0].allowed, false);
});
