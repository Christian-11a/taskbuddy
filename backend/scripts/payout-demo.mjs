import assert from 'node:assert/strict';
import { createSimulator, requestWithdrawal, settleWithdrawal, rejectWithdrawal, snapshot } from '../test/sql/payout-simulator.mjs';
const db = await createSimulator();
try {
  const before = await snapshot(db);
  const id = await requestWithdrawal(db,350);
  const reserved = await snapshot(db);
  const reference = await settleWithdrawal(db,id);
  const rejectedId = await requestWithdrawal(db,200);
  await rejectWithdrawal(db,rejectedId);
  const after = await snapshot(db);
  assert.equal(after.reconciled_total,before.reconciled_total);
  assert.equal(Number(after.wallet.settled),650);
  assert.equal(Number(after.receiver.balance),450);
  console.log(JSON.stringify({label: 'LOCAL SIMULATION — no real bank/GCash delivery', before, reserved, settlement_reference:reference, after},null,2));
} finally { await db.close(); }
