/**
 * The `messages` body-or-attachment constraint from migration 0031, executed
 * on real Postgres (see harness.mjs). Run with `npm run test:sql`.
 *
 * Migration 0030 added `attachment_path` to `messages` but left 0006's
 * `char_length(body) between 1 and 1000` CHECK in place, so every
 * attachment-only message — the only kind the mobile app's attach flow
 * produces — was rejected with `23514` against the real schema. 0031 relaxes
 * the constraint to require body OR attachment, never neither. This is the
 * regression suite for that fix.
 *
 * Each test gets a freshly migrated database, so nothing leaks between them.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { migratedDatabase } from './harness.mjs';

const CLIENT = '11111111-1111-1111-1111-111111111111';
const PROVIDER = '22222222-2222-2222-2222-222222222222';

let db;
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await q(sql, params))[0];

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

async function insertMessage({ body, attachmentPath = null }) {
  return one(
    `insert into messages (conversation_id, sender_id, body, attachment_path)
     values ($1, $2, $3, $4)
     returning id, body, attachment_path`,
    [conversationId, CLIENT, body, attachmentPath],
  );
}

let conversationId;

beforeEach(async () => {
  db = await migratedDatabase();
  // Profiles come from the real signup trigger (handle_new_user).
  for (const [id, role, name] of [
    [CLIENT, 'client', 'Ana Cruz'],
    [PROVIDER, 'provider', 'Boy Plumber'],
  ]) {
    await q(
      `insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`,
      [id, `${id}@taskbuddy.test`, JSON.stringify({ role, full_name: name })],
    );
  }
  await q(
    `insert into provider_profiles (profile_id, category_id, bio, is_verified)
     values ($1, 1, 'Licensed plumber, ten years around Quezon City.', true)`,
    [PROVIDER],
  );
  const job = await one(
    `insert into jobs (client_id, category_id, title, description, address,
                       latitude, longitude, budget, recommendation_deadline,
                       status, assigned_provider_id)
     values ($1, 1, 'Fix kitchen faucet', 'Tumutulo yung gripo sa kusina, need ayusin.',
             'Quezon City', 14.676, 121.043, 1500, now(), 'assigned', $2)
     returning id`,
    [CLIENT, PROVIDER],
  );
  const conversation = await one(
    `insert into conversations (job_id, client_id, provider_id)
     values ($1, $2, $3) returning id`,
    [job.id, CLIENT, PROVIDER],
  );
  conversationId = conversation.id;
});

describe('messages body-or-attachment constraint (0031)', () => {
  it('accepts an attachment-only message (empty body, non-null attachment_path)', async () => {
    const row = await insertMessage({
      body: '',
      attachmentPath: `${CLIENT}/photo.jpg`,
    });
    assert.equal(row.body, '');
    assert.equal(row.attachment_path, `${CLIENT}/photo.jpg`);
  });

  it('refuses a message with neither body nor attachment', async () => {
    await refusal(
      `insert into messages (conversation_id, sender_id, body, attachment_path)
       values ($1, $2, '', null)`,
      [conversationId, CLIENT],
      '23514',
    );
  });

  it('still accepts a text-only message (no attachment)', async () => {
    const row = await insertMessage({ body: 'Nasaan ka na?' });
    assert.equal(row.body, 'Nasaan ka na?');
    assert.equal(row.attachment_path, null);
  });

  it('still refuses body over 1000 characters, attachment or not', async () => {
    await refusal(
      `insert into messages (conversation_id, sender_id, body, attachment_path)
       values ($1, $2, $3, $4)`,
      [conversationId, CLIENT, 'x'.repeat(1001), `${CLIENT}/photo.jpg`],
      '23514',
    );
  });
});
