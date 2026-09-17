/**
 * Recommendation eligibility (migration 0032, BACKEND_SCHEMA.md §32), executed
 * on real Postgres (see harness.mjs). Run with `npm run test:sql`.
 *
 * `fn_job_provider_features` decides who the model ever sees. The jest suites
 * mock the RPC and cannot tell whether it returns anyone at all — which is how
 * a pool that was empty for every app-created provider, or that handed the
 * model a NULL bio it rejects outright, went unnoticed. Each case below is one
 * provider who is or is not eligible for a job in Quezon City, and why.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { migratedDatabase } from './harness.mjs';

const CLIENT = '11111111-1111-1111-1111-111111111111';
const PLUMBING = 1;
const CLEANING = 2;

/** The job's location — Quezon City. */
const JOB = { lat: 14.676, lng: 121.0437 };
/** ~0.6 km from the job. */
const NEARBY = { lat: 14.68, lng: 121.04 };
/** ~13 km from the job (Makati). */
const MAKATI = { lat: 14.5547, lng: 121.0244 };
/** ~575 km from the job (Cebu). */
const CEBU = { lat: 10.31, lng: 123.89 };

const BIO = 'Licensed plumber fixing leaks and pipes around Metro Manila.';

let db;
let seq = 0;
const q = async (sql, params = []) => (await db.query(sql, params)).rows;

/** A provider as the app would leave them, with overrides for the case under test. */
async function provider({
  category = PLUMBING,
  bio = BIO,
  verified = true,
  available = true,
  radiusKm = 15,
  location = NEARBY,
  deactivated = false,
  deleted = false,
} = {}) {
  seq += 1;
  const id = `22222222-2222-2222-2222-${String(seq).padStart(12, '0')}`;
  await q(
    `insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`,
    [id, `${id}@taskbuddy.test`, JSON.stringify({ role: 'provider', full_name: 'P' })],
  );
  await q(
    `insert into provider_profiles
       (profile_id, category_id, bio, is_verified, is_available, service_radius_km)
     values ($1, $2, $3, $4, $5, $6)`,
    [id, category, bio, verified, available, radiusKm],
  );
  await q(
    `update profiles
        set latitude = $2, longitude = $3,
            deactivated_at = case when $4 then now() end,
            deleted_at = case when $5 then now() end
      where id = $1`,
    [id, location?.lat ?? null, location?.lng ?? null, deactivated || deleted, deleted],
  );
  return id;
}

async function postJob() {
  const [job] = await q(
    `insert into jobs (client_id, category_id, title, description, urgency, address, latitude, longitude)
     values ($1, $2, 'Fix faucet', 'Tumutulo ang gripo sa kusina, need ayusin agad.', 'urgent', 'QC', $3, $4)
     returning id`,
    [CLIENT, PLUMBING, JOB.lat, JOB.lng],
  );
  return job.id;
}

async function pool(jobId) {
  return q(`select * from fn_job_provider_features($1)`, [jobId]);
}

async function eligible(providerId) {
  const jobId = await postJob();
  return (await pool(jobId)).some((r) => r.provider_id === providerId);
}

beforeEach(async () => {
  db = await migratedDatabase();
  seq = 0;
  await q(
    `insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`,
    [CLIENT, 'client@taskbuddy.test', JSON.stringify({ role: 'client', full_name: 'Ana Cruz' })],
  );
});

describe('fn_job_provider_features eligibility', () => {
  it('includes a verified, available provider with a bio, located within their radius', async () => {
    const id = await provider();
    const jobId = await postJob();

    const rows = await pool(jobId);

    assert.equal(rows.length, 1);
    assert.equal(rows[0].provider_id, id);
    assert.equal(Number(rows[0].skills_match), 1);
    assert.equal(rows[0].provider_bio, BIO);
    assert.ok(Number(rows[0].distance_km) < 1);
  });

  it('includes a provider of another category within their radius, with skills_match 0', async () => {
    const id = await provider({ category: CLEANING });
    const jobId = await postJob();

    const [row] = await pool(jobId);

    assert.equal(row.provider_id, id);
    assert.equal(Number(row.skills_match), 0);
  });

  it('includes a provider 13 km away with a 15 km radius', async () => {
    assert.equal(await eligible(await provider({ location: MAKATI, radiusKm: 15 })), true);
  });

  it('never returns a NULL bio, which ml-service rejects for the whole batch', async () => {
    const withBio = await provider();
    await provider({ bio: null });
    const jobId = await postJob();

    const rows = await pool(jobId);

    assert.deepEqual(
      rows.map((r) => r.provider_id),
      [withBio],
    );
    assert.ok(rows.every((r) => r.provider_bio !== null));
  });

  const excluded = [
    ['has no coordinates (the app never used to save them)', { location: null }],
    ['is not verified', { verified: false }],
    ['is unavailable', { available: false }],
    ['is suspended', { deactivated: true }],
    ['deleted their account', { deleted: true }],
    ['is in the job category but outside their radius (Cebu)', { location: CEBU, radiusKm: 15 }],
    ['is 13 km away with a 10 km radius', { location: MAKATI, radiusKm: 10 }],
  ];

  for (const [reason, overrides] of excluded) {
    it(`excludes a provider who ${reason}`, async () => {
      assert.equal(await eligible(await provider(overrides)), false);
    });
  }

  it('excludes a provider who already applied to the job', async () => {
    const id = await provider();
    const jobId = await postJob();
    await q(`insert into job_applications (job_id, provider_id) values ($1, $2)`, [jobId, id]);

    assert.equal((await pool(jobId)).length, 0);
  });
});

describe('claim_unscored_recommending_jobs', () => {
  const claim = async (retryAfterSeconds = 300, limit = 20) =>
    q(`select * from claim_unscored_recommending_jobs($1, $2)`, [
      retryAfterSeconds,
      limit,
    ]);

  /** A job already in 'recommending', optionally scored and/or attempted `attemptedAgo` ago. */
  async function recommendingJob({ scored = false, attemptedAgo = null } = {}) {
    const id = await postJob();
    await q(
      `update jobs
          set status = 'recommending',
              recommendation_attempted_at =
                case when $2::text is null then null else now() - $2::interval end
        where id = $1`,
      [id, attemptedAgo],
    );
    if (scored) {
      await q(
        `insert into recommendation_runs (job_id, model_version, pool_size) values ($1, 'rf-a-v1', 3)`,
        [id],
      );
    }
    return id;
  }

  it('claims a recommending job with no run, and stamps the attempt', async () => {
    const id = await recommendingJob();

    const rows = await claim();

    assert.deepEqual(
      rows.map((r) => r.id),
      [id],
    );
    const [job] = await q(`select recommendation_attempted_at from jobs where id = $1`, [id]);
    assert.ok(job.recommendation_attempted_at, 'attempt was stamped');
  });

  it('does not claim the same job again inside the retry window', async () => {
    await recommendingJob();

    assert.equal((await claim()).length, 1);
    assert.equal((await claim()).length, 0);
  });

  it('reclaims a job whose last attempt is older than the retry window', async () => {
    const id = await recommendingJob({ attemptedAgo: '10 minutes' });

    assert.deepEqual(
      (await claim(300)).map((r) => r.id),
      [id],
    );
  });

  it('skips jobs attempted within the window, e.g. by a manual trigger still scoring', async () => {
    await recommendingJob({ attemptedAgo: '30 seconds' });

    assert.equal((await claim(300)).length, 0);
  });

  it('never claims a job that already has a run, or one that is not recommending', async () => {
    await recommendingJob({ scored: true });
    await postJob(); // still 'open'

    assert.equal((await claim()).length, 0);
  });

  it('is not starved by scored jobs filling the batch', async () => {
    // The first version limited the batch before excluding scored jobs, and
    // scored jobs stay 'recommending' until a hire — so enough of them hid
    // every unscored job from the retry.
    for (let i = 0; i < 3; i++) await recommendingJob({ scored: true });
    const unscored = await recommendingJob();

    assert.deepEqual(
      (await claim(300, 2)).map((r) => r.id),
      [unscored],
    );
  });

  it('rotates through a backlog, never-attempted jobs first', async () => {
    const attemptedLongAgo = await recommendingJob({ attemptedAgo: '1 hour' });
    const neverAttempted = await recommendingJob();

    assert.deepEqual((await claim(300, 1)).map((r) => r.id), [neverAttempted]);
    assert.deepEqual((await claim(300, 1)).map((r) => r.id), [attemptedLongAgo]);
    assert.equal((await claim(300, 1)).length, 0);
  });

  it('is executable by the service role only', async () => {
    const rows = await q(
      `select grantee from information_schema.routine_privileges
        where routine_name = 'claim_unscored_recommending_jobs'
          and privilege_type = 'EXECUTE'`,
    );
    const grantees = rows.map((r) => r.grantee);
    assert.ok(grantees.includes('service_role'));
    assert.ok(!grantees.includes('anon'));
    assert.ok(!grantees.includes('authenticated'));
    assert.ok(!grantees.includes('PUBLIC'));
  });
});
