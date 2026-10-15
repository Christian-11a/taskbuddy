import { beforeEach, it } from 'node:test';
import assert from 'node:assert/strict';
import { migratedDatabase } from './harness.mjs';
let db;
const client='11111111-1111-1111-1111-111111111111';
const provider='22222222-2222-2222-2222-222222222222';
const admin='33333333-3333-3333-3333-333333333333';
const q=async(sql,p=[]) => (await db.query(sql,p)).rows;
const refusal=(sql,p,code)=>assert.rejects(q(sql,p),e=>e.code===code);
beforeEach(async()=>{
 db=await migratedDatabase();
 await q(`update job_capacity_settings set client_active_max=3,provider_active_max=3,provider_pending_max=3,daily_hours_max=8,rest_hours=1,travel_kmh=20`);
 await q(`alter table jobs enable trigger guard_provider_booking_capacity`);
 for(const [id,role] of [[client,'client'],[provider,'provider'],[admin,'admin']])
  await q(`insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)`,[id,`${role}@test.com`,JSON.stringify({role,full_name:role})]);
 await q(`insert into provider_profiles(profile_id,category_id,bio,is_verified) values($1,1,'Careful Lipa plumbing and repair service.',true)`,[provider]);
});
const job=async(n,status='open')=>(await q(`insert into jobs(client_id,category_id,title,description,address,latitude,longitude,budget,assigned_provider_id,status)
 values($1,1,$2,'Repair the leaking kitchen sink and check fittings.','Lipa',13.94,121.14,1000,$3,$4) returning id`,
 [client,`Repair sink ${n}`,status==='open'?null:provider,status]))[0].id;
it('caps clients at three active jobs',async()=>{
 for(let n=1;n<=3;n++)await job(n);
 await refusal(`insert into jobs(client_id,category_id,title,description,address,latitude,longitude)
 values($1,1,'Fourth job','Repair the leaking kitchen sink and check fittings.','Lipa',13.94,121.14)`,[client],'TB409');
});
it('releases a completed hold only once',async()=>{
 const id=await job(1,'completed');
 await q(`insert into escrow_transactions(job_id,client_id,provider_id,amount,status) values($1,$2,$3,1000,'held')`,[id,client,provider]);
 await q(`update jobs set completed_at=now() where id=$1`,[id]);
 assert.equal((await q(`select status from escrow_release_early($1,$2)`,[id,client]))[0].status,'released');
 assert.equal((await q(`select count(*)::int as n from wallet_transactions where job_id=$1 and kind='payout'`,[id]))[0].n,1);
 await refusal(`select escrow_release_early($1,$2)`,[id,client],'TB409');
});
it('rejects a stale platform identity edit',async()=>{
 assert.equal((await q(`select platform_name from admin_update_platform_identity($1,1,'TaskBuddy UAT','')`,[admin]))[0].platform_name,'TaskBuddy UAT');
 await refusal(`select admin_update_platform_identity($1,1,'Stale','')`,[admin],'TB409');
});
it('audits an admin capacity change and rejects a non-admin',async()=>{
 await refusal(`select admin_update_job_capacity($1,4,3,3,8,1,20)`,[client],'TB403');
 assert.equal((await q(`select client_active_max from admin_update_job_capacity($1,4,3,3,8,1,20)`,[admin]))[0].client_active_max,4);
 assert.equal((await q(`select count(*)::int as n from admin_actions where actor_id=$1 and action='job_capacity.update'`,[admin]))[0].n,1);
});
it('accepts a wallet-funded price change atomically',async()=>{
 const id=await job(1,'assigned');
 await q(`insert into escrow_transactions(job_id,client_id,provider_id,amount,status) values($1,$2,$3,1000,'held')`,[id,client,provider]);
 await q(`insert into wallet_transactions(profile_id,direction,kind,status,amount,title) values($1,'credit','topup','completed',500,'Test funds')`,[client]);
 const r=await q(`select id from job_change_propose($1,$2,'price',null,1200,'More materials needed')`,[id,provider]);
 await q(`select job_change_decide($1,$2,'accepted')`,[r[0].id,client]);
 assert.equal(Number((await q(`select budget from jobs where id=$1`,[id]))[0].budget),1200);
 assert.equal(Number((await q(`select amount from escrow_transactions where job_id=$1`,[id]))[0].amount),1200);
 assert.equal((await q(`select count(*)::int as n from wallet_transactions where job_id=$1 and kind='escrow_hold'`,[id]))[0].n,1);
});
it('limits provider release requests and notifies the client',async()=>{
 const id=await job(1,'completed');
 await q(`insert into escrow_transactions(job_id,client_id,provider_id,amount,status) values($1,$2,$3,1000,'held')`,[id,client,provider]);
 const first=(await q(`select * from request_early_payment_release($1,$2)`,[id,provider]))[0];
 assert.ok(new Date(first.next_allowed_at)>new Date(first.created_at));
 await assert.rejects(q(`select request_early_payment_release($1,$2)`,[id,provider]),e=>e.code==='TB409' && Boolean(e.detail));
 assert.equal((await q(`select count(*)::int as n from notifications where recipient_id=$1 and title='Provider requested payment release'`,[client]))[0].n,1);
});
it('expires pending job changes without a participant opening the job',async()=>{
 const id=await job(1,'assigned');
 const when=new Date(Date.now()+172800000).toISOString();
 const request=(await q(`select id from job_change_propose($1,$2,'schedule',$3,null,'Move the appointment')`,[id,client,when]))[0];
 await q(`update job_change_requests set expires_at=now()-interval '1 minute' where id=$1`,[request.id]);
 assert.equal((await q(`select job_change_expire_all() as n`))[0].n,1);
 assert.equal((await q(`select status from job_change_requests where id=$1`,[request.id]))[0].status,'expired');
 assert.equal((await q(`select job_change_expire_all() as n`))[0].n,0);
});
it('rejects overlapping provider bookings',async()=>{
 const first=await job(1);
 const second=await job(2);
 const when=new Date(Date.now()+86400000).toISOString();
 await q(`update jobs set scheduled_at=$2,assigned_provider_id=$3,status='assigned' where id=$1`,[first,when,provider]);
 await refusal(`update jobs set scheduled_at=$2,assigned_provider_id=$3,status='assigned' where id=$1`,[second,when,provider],'TB409');
});
it('accepts a schedule change and updates the job',async()=>{
 const id=await job(1,'assigned');
 const when=new Date(Date.now()+172800000).toISOString();
 const request=await q(`select id from job_change_propose($1,$2,'schedule',$3,null,'Move the appointment')`,[id,client,when]);
 await q(`select job_change_decide($1,$2,'accepted')`,[request[0].id,provider]);
 assert.equal(new Date((await q(`select scheduled_at from jobs where id=$1`,[id]))[0].scheduled_at).toISOString(),when);
});
