/**
 * The escrow and payout SQL functions from migration 0028, executed on real
 * Postgres (see harness.mjs). Run with `npm run test:sql`.
 *
 * Each test gets a freshly migrated database, so nothing leaks between them.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { migratedDatabase, migrationFiles, readMigration } from './harness.mjs';

const CLIENT = '11111111-1111-1111-1111-111111111111';
const PROVIDER = '22222222-2222-2222-2222-222222222222';
const RIVAL = '33333333-3333-3333-3333-333333333333';

let db;
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await q(sql, params))[0];
const rpc = async (sql, params = []) => (await one(`select ${sql} as r`, params)).r;

/** Runs `sql` and returns the Postgres error it raised; fails if it did not. */
async function refusal(sql, params, code) {
  try {
    await q(sql, params);
  } catch (err) {
    assert.equal(err.code, code, `${sql} raised ${err.code}: ${err.message}`);
    return err;
  }
  assert.fail(`expected SQLSTATE ${code} from: ${sql}`);
}

async function credit(profileId, amount, kind = 'topup') {
  await q(
    `insert into wallet_transactions (profile_id, direction, kind, status, amount, title)
     values ($1, 'credit', $2, 'completed', $3, 'Seed credit')`,
    [profileId, kind, amount],
  );
}

async function pendingWithdrawal(profileId, amount) {
  const row = await one(
    `insert into wallet_transactions
       (profile_id, direction, kind, status, amount, title, withdrawal_destination)
     values ($1, 'debit', 'withdrawal', 'pending', $2, 'Withdrawal', 'GCash 0917')
     returning id`,
    [profileId, amount],
  );
  return row.id;
}

async function postJob(budget = 1500) {
  const row = await one(
    `insert into jobs (client_id, category_id, title, description, address,
                       latitude, longitude, budget, recommendation_deadline)
     values ($1, 1, 'Fix kitchen faucet', 'Tumutulo yung gripo sa kusina, need ayusin.',
             'Quezon City', 14.676, 121.043, $2, now())
     returning id`,
    [CLIENT, budget],
  );
  return row.id;
}

const available = async (profileId) =>
  Number(await rpc('wallet_available_balance($1)', [profileId]));

const ledger = (profileId) =>
  q(
    `select kind, direction, status, amount::float as amount
       from wallet_transactions where profile_id = $1 order by created_at, id`,
    [profileId],
  );

beforeEach(async () => {
  db = await migratedDatabase();
  // Profiles come from the real signup trigger (handle_new_user).
  for (const [id, role, name] of [
    [CLIENT, 'client', 'Ana Cruz'],
    [PROVIDER, 'provider', 'Boy Plumber'],
    [RIVAL, 'provider', 'Rival Plumber'],
  ]) {
    await q(
      `insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`,
      [id, `${id}@taskbuddy.test`, JSON.stringify({ role, full_name: name })],
    );
  }
  for (const id of [PROVIDER, RIVAL]) {
    await q(
      `insert into provider_profiles (profile_id, category_id, bio, is_verified)
       values ($1, 1, 'Licensed plumber, ten years around Quezon City.', true)`,
      [id],
    );
  }
});

describe('wallet_available_balance', () => {
  it('is settled balance minus every pending debit', async () => {
    await credit(CLIENT, 2000);
    await pendingWithdrawal(CLIENT, 600);
    assert.equal(await available(CLIENT), 1400);
  });
});

describe('escrow_place_hold', () => {
  it('refuses a short wallet with the figures, and writes nothing', async () => {
    const job = await postJob(1500);
    await credit(CLIENT, 1000);

    const err = await refusal('select escrow_place_hold($1, $2)', [job, PROVIDER], 'TB402');

    assert.deepEqual(JSON.parse(err.detail), { needed: 1500, available: 1000 });
    assert.deepEqual(await q('select id from escrow_transactions'), []);
  });

  it('counts a pending withdrawal as spoken for', async () => {
    const job = await postJob(1500);
    await credit(CLIENT, 2000);
    await pendingWithdrawal(CLIENT, 600);

    await refusal('select escrow_place_hold($1, $2)', [job, PROVIDER], 'TB402');
  });

  it('holds and debits in one step, and a retry debits nobody', async () => {
    const job = await postJob(1500);
    await credit(CLIENT, 2000);

    const first = await rpc('escrow_place_hold($1, $2)', [job, PROVIDER]);
    const retry = await rpc('escrow_place_hold($1, $2)', [job, PROVIDER]);

    assert.equal(first.placed, true);
    assert.equal(first.escrow.status, 'held');
    assert.equal(first.escrow.funding_method, 'wallet');
    assert.equal(retry.placed, false);
    assert.equal(retry.escrow.id, first.escrow.id);
    assert.deepEqual(
      (await ledger(CLIENT)).map((t) => t.kind),
      ['topup', 'escrow_hold'],
    );
  });

  it('refuses a second hire for another provider', async () => {
    const job = await postJob(1500);
    await credit(CLIENT, 5000);
    await rpc('escrow_place_hold($1, $2)', [job, PROVIDER]);

    await refusal('select escrow_place_hold($1, $2)', [job, RIVAL], 'TB409');
  });

  it('no-ops for a job posted without a budget', async () => {
    const job = await one(
      `insert into jobs (client_id, category_id, title, description, address,
                         latitude, longitude, recommendation_deadline)
       values ($1, 1, 'Fix kitchen faucet', 'Tumutulo yung gripo sa kusina, need ayusin.',
               'QC', 14.6, 121.0, now()) returning id`,
      [CLIENT],
    );
    assert.deepEqual(await rpc('escrow_place_hold($1, $2)', [job.id, PROVIDER]), {
      escrow: null,
      placed: false,
    });
  });

  it('revives a rolled-back hold, overwriting how it was funded', async () => {
    const job = await postJob(1500);
    await credit(CLIENT, 3000);
    const { escrow } = await rpc('escrow_place_hold($1, $2)', [job, PROVIDER]);
    await rpc(`escrow_settle($1, 'held', 'cancelled', 0, 'Refund')`, [escrow.id]);

    const revived = await rpc(`escrow_place_hold($1, $2, 'card', 'pi_1', 'ch_1')`, [job, PROVIDER]);

    assert.equal(revived.placed, true);
    assert.equal(revived.escrow.id, escrow.id);
    assert.equal(revived.escrow.funding_method, 'card');
    assert.equal(revived.escrow.funding_charge_id, 'ch_1');
    assert.equal(await available(CLIENT), 1500);
  });

  it('will not store a card-funded hold without the payment that funded it', async () => {
    const job = await postJob(1500);
    await credit(CLIENT, 3000);
    await refusal(`select escrow_place_hold($1, $2, 'card', null, null)`, [job, PROVIDER], '23514');
  });
});

describe('escrow_settle', () => {
  async function held(method = 'wallet') {
    const job = await postJob(1500);
    await credit(CLIENT, 1500);
    const args = method === 'card' ? `'card', 'pi_1', 'ch_1'` : `'wallet'`;
    return (await rpc(`escrow_place_hold($1, $2, ${args})`, [job, PROVIDER])).escrow;
  }

  it('cancels once; the losing cancel credits nobody', async () => {
    const escrow = await held();

    const won = await rpc(`escrow_settle($1, 'held', 'cancelled', 0, 'Refund — job cancelled')`, [escrow.id]);
    const lost = await rpc(`escrow_settle($1, 'held', 'cancelled', 0, 'Refund')`, [escrow.id]);

    assert.equal(won.status, 'cancelled');
    assert.equal(lost, null);
    assert.equal(await available(CLIENT), 1500);
  });

  it('releases net of commission, freezing the commission on the row', async () => {
    const escrow = await held();

    const released = await rpc(
      `escrow_settle($1, 'held', 'released', 225, 'Payout — Fix kitchen faucet')`,
      [escrow.id],
    );

    assert.equal(released.status, 'released');
    assert.equal(Number(released.commission_amount), 225);
    assert.equal(released.transfer_status, 'none', 'wallet money stays in the wallet');
    assert.deepEqual(await ledger(PROVIDER), [
      { kind: 'payout', direction: 'credit', status: 'completed', amount: 1275 },
    ]);
    assert.equal(await rpc(`escrow_settle($1, 'held', 'released', 0, 'x')`, [escrow.id]), null);
  });

  it('marks a card-funded release for transfer in the same transaction', async () => {
    const escrow = await held('card');
    const released = await rpc(`escrow_settle($1, 'held', 'released', 0, 'Payout')`, [escrow.id]);
    assert.equal(released.transfer_status, 'pending');
  });

  it('pays a disputed escrow either way, exactly once', async () => {
    const escrow = await held();
    await rpc(`escrow_settle($1, 'held', 'disputed')`, [escrow.id]);
    assert.deepEqual(await ledger(PROVIDER), [], 'a dispute moves no money');

    const refunded = await rpc(`escrow_settle($1, 'disputed', 'refunded', 0, 'Refund — dispute resolved')`, [escrow.id]);
    const second = await rpc(`escrow_settle($1, 'disputed', 'released', 0, 'Payout')`, [escrow.id]);

    assert.equal(refunded.status, 'refunded');
    assert.equal(second, null, 'a second admin decision pays nobody');
    assert.deepEqual(await ledger(PROVIDER), []);
    assert.equal(await available(CLIENT), 1500);
  });

  it('will not hold funds — that is escrow_place_hold', async () => {
    const escrow = await held();
    await rpc(`escrow_settle($1, 'held', 'cancelled', 0, 'Refund')`, [escrow.id]);
    await refusal(`select escrow_settle($1, 'cancelled', 'held')`, [escrow.id], 'TB409');
  });
});

describe('wallet_reserve_connect_transfer', () => {
  async function released(method = 'card') {
    const job = await postJob(1500);
    await credit(CLIENT, 1500);
    const args = method === 'card' ? `'card', 'pi_1', 'ch_1'` : `'wallet'`;
    const { escrow } = await rpc(`escrow_place_hold($1, $2, ${args})`, [job, PROVIDER]);
    await rpc(`escrow_settle($1, 'held', 'released', 225, 'Payout')`, [escrow.id]);
    return { escrow, job };
  }

  it('reserves the payout as a pending debit, idempotently', async () => {
    const { escrow } = await released();

    const first = await rpc('wallet_reserve_connect_transfer($1, 1275)', [escrow.id]);
    const retry = await rpc('wallet_reserve_connect_transfer($1, 1275)', [escrow.id]);

    assert.equal(first.kind, 'connect_transfer');
    assert.equal(first.status, 'pending');
    assert.equal(retry.id, first.id);
    assert.equal(await available(PROVIDER), 0, 'cannot also be withdrawn by hand');
  });

  it('refuses when the provider already withdrew the money', async () => {
    const { escrow } = await released();
    await pendingWithdrawal(PROVIDER, 1000);

    await refusal('select wallet_reserve_connect_transfer($1, 1275)', [escrow.id], 'TB402');
  });

  it('allows a fresh attempt once the previous one failed', async () => {
    const { escrow } = await released();
    const first = await rpc('wallet_reserve_connect_transfer($1, 1275)', [escrow.id]);
    await q(`update wallet_transactions set status = 'failed' where id = $1`, [first.id]);

    const next = await rpc('wallet_reserve_connect_transfer($1, 1275)', [escrow.id]);

    assert.notEqual(next.id, first.id);
  });

  it('allows at most one live transfer per job, even bypassing the function', async () => {
    const { escrow, job } = await released();
    await rpc('wallet_reserve_connect_transfer($1, 1275)', [escrow.id]);

    await refusal(
      `insert into wallet_transactions (profile_id, direction, kind, status, amount, title, job_id)
       values ($1, 'debit', 'connect_transfer', 'pending', 1, 'Duplicate', $2)`,
      [PROVIDER, job],
      '23505',
    );
  });

  it('never sends a wallet-funded or unreleased escrow to Stripe', async () => {
    const { escrow } = await released('wallet');
    await refusal('select wallet_reserve_connect_transfer($1, 1275)', [escrow.id], 'TB409');
    await refusal(
      `update escrow_transactions set transfer_status = 'pending' where id = $1`,
      [escrow.id],
      '23514',
    );
  });

  it('will not mark a transfer done without the Stripe transfer id', async () => {
    const { escrow } = await released();
    await refusal(
      `update escrow_transactions set transfer_status = 'transferred' where id = $1`,
      [escrow.id],
      '23514',
    );
  });
});

describe('privileges and RLS', () => {
  it('lets only the service role run the money functions', async () => {
    const signatures = [
      'escrow_place_hold(uuid, uuid, text, text, text)',
      'escrow_settle(uuid, escrow_status, escrow_status, numeric, text)',
      'wallet_reserve_connect_transfer(uuid, numeric, text)',
      'wallet_available_balance(uuid)',
    ];
    for (const fn of signatures) {
      for (const [role, expected] of [
        ['anon', false],
        ['authenticated', false],
        ['service_role', true],
      ]) {
        const { ok } = await one(
          `select has_function_privilege($1, $2, 'execute') as ok`,
          [role, `public.${fn}`],
        );
        assert.equal(ok, expected, `${role} on ${fn}`);
      }
    }
  });

  it('leaves signed-in users no write policy on the tables the API owns (0026)', async () => {
    const writes = await q(
      `select tablename, policyname, cmd from pg_policies
        where schemaname = 'public'
          and tablename in ('profiles', 'provider_profiles', 'jobs', 'job_applications',
                            'reviews', 'messages', 'job_tasks', 'notifications',
                            'provider_payout_accounts')
          and cmd <> 'SELECT'`,
    );
    assert.deepEqual(writes, []);
  });
});

describe('migrations', () => {
  it('re-apply cleanly from 0026 on', async () => {
    for (const file of migrationFiles().filter((f) => f >= '0026')) {
      await db.exec(readMigration(file));
    }
  });
});
