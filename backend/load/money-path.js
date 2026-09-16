/**
 * k6 load test for TaskBuddy's money path (HANDOFF.md §3).
 *
 * Every iteration runs the core flow as it happens in the app:
 *
 *   client posts a job (with a budget)
 *     → provider applies
 *     → client lists the applicants
 *     → client accepts (holds escrow from the client's wallet)
 *     → client cancels (refunds escrow, so the wallet is not drained)
 *
 * ⚠️ This writes REAL rows to whatever BASE_URL points at: jobs, applications,
 * escrow holds and ledger entries. It defaults to the deployed API, where the
 * maestro.* test accounts live. See load/README.md before running it.
 *
 * Run:
 *   CLIENT_PASSWORD=... PROVIDER_PASSWORD=... k6 run load/money-path.js
 */
import http from 'k6/http';
import { check, fail, group, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const BASE_URL = (
  __ENV.BASE_URL || 'https://taskbuddy-kpek.onrender.com'
).replace(/\/$/, '');
const CLIENT_EMAIL = __ENV.CLIENT_EMAIL || 'maestro.client@taskbuddy.test';
const PROVIDER_EMAIL =
  __ENV.PROVIDER_EMAIL || 'maestro.provider@taskbuddy.test';
const CLIENT_PASSWORD = __ENV.CLIENT_PASSWORD;
const PROVIDER_PASSWORD = __ENV.PROVIDER_PASSWORD;
const CATEGORY_ID = Number(__ENV.CATEGORY_ID || 1);
const BUDGET = Number(__ENV.BUDGET || 20);

/**
 * A small default ramp. Every virtual user shares one machine's IP, and the API
 * limits each endpoint to 240 requests a minute per IP (BACKEND_SCHEMA.md §28.4),
 * so past roughly 4 iterations a second this measures the rate limiter, not the
 * platform. Watch `rate_limited` in the summary: if it is not zero, lower the load.
 *
 * Keep the whole run under the Supabase access-token lifetime (1 hour by default):
 * the tokens from setup() are never refreshed.
 */
export const options = {
  scenarios: {
    money_path: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '30s', target: 3 },
        { duration: '1m', target: 5 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    checks: ['rate>0.95'],
    step_post_job: ['p(95)<2000'],
    step_apply: ['p(95)<2000'],
    step_list_applications: ['p(95)<2000'],
    step_accept_hold: ['p(95)<3000'],
    step_cancel_refund: ['p(95)<3000'],
    rate_limited: ['count==0'],
  },
};

const stepPostJob = new Trend('step_post_job', true);
const stepApply = new Trend('step_apply', true);
const stepListApplications = new Trend('step_list_applications', true);
const stepAcceptHold = new Trend('step_accept_hold', true);
const stepCancelRefund = new Trend('step_cancel_refund', true);
const rateLimited = new Counter('rate_limited');
const flowsCompleted = new Counter('flows_completed');

function headers(token) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  return { headers: h, timeout: '30s' };
}

/** Records the step timing, counts 429s apart from other failures, and checks the status. */
function track(res, trend, expectedStatus, label) {
  trend.add(res.timings.duration);
  if (res.status === 429) rateLimited.add(1);
  return check(res, {
    [`${label}: status ${expectedStatus}`]: (r) => r.status === expectedStatus,
  });
}

function login(email, password) {
  const res = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email, password }),
    headers(),
  );
  if (res.status !== 200 && res.status !== 201) {
    fail(`login failed for ${email}: ${res.status} ${res.body}`);
  }
  return res.json('session.access_token');
}

/**
 * Runs once. Wakes the API (a sleeping Render free-tier instance takes 30–60 s),
 * then signs each role in exactly once: POST /auth/login allows 10 a minute per
 * IP, so logging in per virtual user would fail the test on the limiter alone.
 */
export function setup() {
  if (!CLIENT_PASSWORD || !PROVIDER_PASSWORD) {
    fail('Set CLIENT_PASSWORD and PROVIDER_PASSWORD (see load/README.md).');
  }

  const health = http.get(`${BASE_URL}/health`, { timeout: '120s' });
  if (health.status !== 200) {
    fail(`API not healthy at ${BASE_URL}: ${health.status}`);
  }

  return {
    clientToken: login(CLIENT_EMAIL, CLIENT_PASSWORD),
    providerToken: login(PROVIDER_EMAIL, PROVIDER_PASSWORD),
  };
}

export default function (data) {
  const client = headers(data.clientToken);
  const provider = headers(data.providerToken);
  let jobId;
  let applicationId;

  group('1. client posts a job', () => {
    const res = http.post(
      `${BASE_URL}/jobs`,
      JSON.stringify({
        category_id: CATEGORY_ID,
        title: `Load test job VU${__VU}-${__ITER}`,
        description: 'Automated k6 load test job. It is cancelled immediately.',
        urgency: 'flexible',
        address: 'Quezon City, Metro Manila',
        latitude: 14.676,
        longitude: 121.0437,
        budget: BUDGET,
      }),
      client,
    );
    if (track(res, stepPostJob, 201, 'post job')) jobId = res.json('id');
  });
  if (!jobId) return;

  group('2. provider applies', () => {
    const res = http.post(
      `${BASE_URL}/jobs/${jobId}/applications`,
      JSON.stringify({ cover_message: 'k6 load test application' }),
      provider,
    );
    if (track(res, stepApply, 201, 'apply')) applicationId = res.json('id');
  });

  group('3. client lists applicants', () => {
    const res = http.get(`${BASE_URL}/jobs/${jobId}/applications`, client);
    track(res, stepListApplications, 200, 'list applications');
  });

  let accepted = false;
  if (applicationId) {
    group('4. client accepts (escrow hold)', () => {
      const res = http.post(
        `${BASE_URL}/applications/${applicationId}/accept`,
        null,
        client,
      );
      accepted = track(res, stepAcceptHold, 201, 'accept');
    });
  }

  // Always cancel a job this iteration created, even when a later step failed,
  // so a failing run does not leave open jobs or held escrow behind.
  group('5. client cancels (escrow refund)', () => {
    const res = http.post(`${BASE_URL}/jobs/${jobId}/cancel`, null, client);
    const cancelled = track(res, stepCancelRefund, 201, 'cancel');
    if (accepted && cancelled) flowsCompleted.add(1);
  });

  // A person does not post, hire and cancel in the same second.
  sleep(1);
}
