import { before, after, it } from 'node:test';
import assert from 'node:assert/strict';
import { migratedDatabase } from './harness.mjs';

let db;
const client = '11111111-1111-1111-1111-111111111111';

before(async () => {
  db = await migratedDatabase();
  await db.query("insert into auth.users (id, raw_user_meta_data) values ($1, '{\"role\":\"client\"}')", [client]);
});

after(async () => {
  await db.close();
});

it('stores house/unit details independently from the pinned address', async () => {
  const { rows: [job] } = await db.query(`insert into jobs
    (client_id, category_id, title, description, address, address_details, latitude, longitude)
    values ($1, 1, 'Test job', 'A valid description for the job.', 'Lipa City', 'Unit 2, blue gate', 13.9, 121.1)
    returning address, address_details, latitude, longitude`, [client]);

  assert.deepEqual(job, {
    address: 'Lipa City',
    address_details: 'Unit 2, blue gate',
    latitude: 13.9,
    longitude: 121.1,
  });
});

it('rejects empty and overlong address details', async () => {
  for (const details of ['', 'x'.repeat(121)]) {
    await assert.rejects(
      db.query(`insert into jobs
        (client_id, category_id, title, description, address, address_details, latitude, longitude)
        values ($1, 1, 'Test job', 'A valid description for the job.', 'Lipa City', $2, 13.9, 121.1)`,
      [client, details]),
      /jobs_address_details_length/,
    );
  }
});
