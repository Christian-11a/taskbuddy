import { it } from 'node:test';
import assert from 'node:assert/strict';
import {createSimulator, requestWithdrawal, settleWithdrawal, rejectWithdrawal, snapshot} from './payout-simulator.mjs';
it('reserves real ledger funds and reconciles simulated receipt with one settlement', async () => {
  const db = await createSimulator();
  try {
    const before = await snapshot(db);
    assert.equal(before.reconciled_total, '1100.00');
    const id = await requestWithdrawal(db, 350);
    const reserved = await snapshot(db);
    assert.equal(Number(reserved.wallet.available), 650);
    assert.equal(Number(reserved.wallet.settled), 1000);
    assert.equal(Number(reserved.receiver.balance), 100);
    await assert.rejects(requestWithdrawal(db, 700));
    const reference = await settleWithdrawal(db, id);
    const paid = await snapshot(db);
    assert.equal(Number(paid.wallet.settled), 650);
    assert.equal(Number(paid.receiver.balance), 450);
    assert.equal(paid.reconciled_total, before.reconciled_total);
    assert.equal(paid.receipts[0].reference, reference);
    assert.equal(paid.withdrawals[0].review_note, reference);
    await assert.rejects(settleWithdrawal(db,id), /not pending/);
    assert.deepEqual(await snapshot(db), paid);
  } finally { await db.close(); }
});
it('a rejected withdrawal restores availability without crediting the receiver', async () => {
  const db = await createSimulator();
  try {
    const id = await requestWithdrawal(db, 300);
    await rejectWithdrawal(db,id);
    const state = await snapshot(db);
    assert.equal(Number(state.wallet.available),1000);
    assert.equal(Number(state.receiver.balance),100);
    assert.equal(state.receipts.length,0);
    await assert.rejects(settleWithdrawal(db,id), /not pending/);
  } finally { await db.close(); }
});
it('receiver failure leaves the withdrawal pending and preserves reserved funds', async () => {
  const db = await createSimulator();
  try {
    const id = await requestWithdrawal(db, 300, 'SIM-MISSING');
    const before = await snapshot(db);
    await assert.rejects(settleWithdrawal(db,id), /unavailable/);
    assert.deepEqual(await snapshot(db),before);
  } finally { await db.close(); }
});
it('a receiving ledger failure rolls back settlement instead of losing money', async () => {
  const db = await createSimulator();
  try {
    const id = await requestWithdrawal(db,300);
    await db.exec(`create function payout_demo.reject_receipt() returns trigger language plpgsql as
      $$ begin raise exception 'SIMULATED receiving ledger failure'; end; $$;
      create trigger reject_receipt before insert on payout_demo.receipts
      for each row execute function payout_demo.reject_receipt();`);
    const before = await snapshot(db);
    await assert.rejects(settleWithdrawal(db,id), /receiving ledger failure/);
    assert.deepEqual(await snapshot(db),before);
  } finally { await db.close(); }
});
it('competing reservations cannot reuse the same available funds', async () => {
  const db = await createSimulator();
  try {
    const results = await Promise.allSettled([requestWithdrawal(db,800),requestWithdrawal(db,800)]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length,1);
    assert.equal(results.filter(r => r.status === 'rejected').length,1);
    assert.equal(Number((await snapshot(db)).wallet.available),200);
  } finally { await db.close(); }
});
it('guards other spending paths and preserves reservations during settlement/replay', async () => {
  const db = await createSimulator();
  try {
    const id = await requestWithdrawal(db,800);
    await assert.rejects(db.query(`insert into wallet_transactions
      (profile_id,direction,kind,status,amount,title) values ($1,'debit','escrow_hold','completed',300,'Overspend')`,
      ['22222222-2222-2222-2222-222222222222']), /Insufficient wallet balance/);
    await settleWithdrawal(db,id);
    const {readMigration} = await import('./harness.mjs');
    await db.exec(readMigration('0045_wallet_debit_reservations.sql'));
    assert.equal(Number((await snapshot(db)).wallet.available),200);
    await assert.rejects(requestWithdrawal(db,201), /Insufficient wallet balance/);
  } finally { await db.close(); }
});
