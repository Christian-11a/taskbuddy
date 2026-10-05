/** Local-only receiving ledger. Never imported by the production API. */
import { migratedDatabase } from './harness.mjs';
export const PROVIDER = '22222222-2222-2222-2222-222222222222';
export const ADMIN = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
export const DESTINATION = 'SIM-RECEIVER-001';
export async function createSimulator() {
  const db = await migratedDatabase();
  for (const [id, role] of [[PROVIDER, 'provider'], [ADMIN, 'admin']]) {
    await db.query(`insert into auth.users (id,email,raw_user_meta_data) values ($1,$2,$3)`,
      [id, `${id}@simulation.test`, JSON.stringify({role, full_name: 'SIMULATED account'})]);
  }
  await db.query(`insert into wallet_transactions (profile_id,direction,kind,status,amount,title)
    values ($1,'credit','topup','completed',1000,'SIMULATED funding — no real charge')`, [PROVIDER]);
  await db.exec(`create schema payout_demo;
    create table payout_demo.receiving_accounts (
      destination text primary key, profile_id uuid not null references profiles(id),
      initial_balance numeric(12,2) not null check(initial_balance >= 0));
    create table payout_demo.receipts (
      withdrawal_id uuid primary key references wallet_transactions(id),
      destination text not null references payout_demo.receiving_accounts(destination),
      amount numeric(12,2) not null check(amount > 0),
      reference text not null unique check(reference like 'SIM-%'));
  `);
  await db.query(`insert into payout_demo.receiving_accounts values ($1,$2,100)`, [DESTINATION, PROVIDER]);
  return db;
}
export async function requestWithdrawal(db, amount, destination = DESTINATION) {
  const result = await db.query(`insert into wallet_transactions
    (profile_id,direction,kind,status,amount,title,withdrawal_destination)
    values ($1,'debit','withdrawal','pending',$2,'SIMULATED withdrawal',$3) returning id`,
    [PROVIDER, amount, destination]);
  return result.rows[0].id;
}
export async function settleWithdrawal(db, id) {
  return db.transaction(async tx => {
    const {rows} = await tx.query(`select * from wallet_transactions
      where id=$1 and kind='withdrawal' and status='pending' for update`, [id]);
    if (!rows.length) throw new Error('Withdrawal is not pending');
    const withdrawal = rows[0];
    const receiver = await tx.query(`select destination from payout_demo.receiving_accounts
      where destination=$1 and profile_id=$2`, [withdrawal.withdrawal_destination, withdrawal.profile_id]);
    if (!receiver.rows.length) throw new Error('Simulated receiving account is unavailable');
    const reference = `SIM-${id}`;
    // Production balance/ledger triggers execute on this update. The receiving
    // credit and debit share one local transaction; a failed receipt rolls back both.
    await tx.query(`update wallet_transactions set status='completed', reviewed_by=$2,
      reviewed_at=now(),review_note=$3 where id=$1 and status='pending'`, [id, ADMIN, reference]);
    await tx.query(`insert into payout_demo.receipts values ($1,$2,$3,$4)`,
      [id, withdrawal.withdrawal_destination, withdrawal.amount, reference]);
    return reference;
  });
}
export async function rejectWithdrawal(db, id) {
  const {rows} = await db.query(`update wallet_transactions set status='failed',
    reviewed_by=$2, reviewed_at=now(),review_note='SIMULATED receiver rejection'
    where id=$1 and kind='withdrawal' and status='pending' returning id`, [id, ADMIN]);
  if (!rows.length) throw new Error('Withdrawal is not pending');
}
export async function snapshot(db) {
  const wallet = (await db.query(`select
    coalesce(sum(case when direction='credit' then amount else -amount end)
      filter(where status='completed'),0)::numeric(12,2) as settled,
    wallet_available_balance($1)::numeric(12,2) as available
    from wallet_transactions where profile_id=$1`, [PROVIDER])).rows[0];
  const receiver = (await db.query(`select a.destination,
    (a.initial_balance + coalesce(sum(r.amount),0))::numeric(12,2) as balance
    from payout_demo.receiving_accounts a left join payout_demo.receipts r using(destination)
    group by a.destination,a.initial_balance`)).rows[0];
  const receipts = (await db.query(`select * from payout_demo.receipts order by withdrawal_id`)).rows;
  const withdrawals = (await db.query(`select id,status,amount,review_note from wallet_transactions
    where kind='withdrawal' order by created_at,id`)).rows;
  return { simulated: true, currency: 'PHP', wallet, receiver, receipts, withdrawals,
    reconciled_total: (Number(wallet.settled) + Number(receiver.balance)).toFixed(2) };
}
