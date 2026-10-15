// Standalone fake backend for benchmarking a production build of the admin console.
// Plain Node 18+, no dependencies:  node web/scripts/perf/fake-api.mjs
//
// Env knobs (all optional):
//   PORT=4600           listen port on 127.0.0.1
//   USERS=5000          BOOKINGS=12000   TRANSACTIONS=8000   WALLET=15000
//   DISPUTES=200        VERIFICATIONS=300
//   LATENCY_MS=60       added to every response, plus 1 ms per 100 rows returned
//   ANALYTICS=fail      GET /admin/analytics/summary returns 500 (exercises the fallback)
//   SEED=20261015       the same seed and sizes always produce the same data
//
// Responses use the wire shapes in web/src/lib/api/types.ts. Each request is logged
// to stdout as one JSON line. GET /__stats returns per-route counts and bytes since
// start; POST /__reset clears them.

import http from "node:http";
import { randomBytes } from "node:crypto";

// ─── Config ───────────────────────────────────────────────────────────────────

function numEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative number, got "${raw}"`);
  return value;
}

const PORT = Math.floor(numEnv("PORT", 4600));
const HOST = "127.0.0.1";
const SIZE = {
  users: Math.floor(numEnv("USERS", 5000)),
  bookings: Math.floor(numEnv("BOOKINGS", 12000)),
  transactions: Math.floor(numEnv("TRANSACTIONS", 8000)),
  wallet: Math.floor(numEnv("WALLET", 15000)),
  disputes: Math.floor(numEnv("DISPUTES", 200)),
  verifications: Math.floor(numEnv("VERIFICATIONS", 300)),
};
const LATENCY_MS = numEnv("LATENCY_MS", 60);
const ANALYTICS_FAIL = process.env.ANALYTICS === "fail";
const SEED = Math.floor(numEnv("SEED", 20261015)) >>> 0;
// The largest page the console asks for (LIST_PAGE_SIZE in services/index.ts).
// The admin DTOs set no maximum, so limits above this are clamped to it.
const MAX_PAGE = 200;
const SKILL_REQUEST_MAX_PAGE = 100; // backend/src/skill-requests/dto: @Max(100), 400 above it
const COMMISSION_DEFAULT = 0.1;

if (SIZE.users < 10) throw new Error("USERS must be at least 10");

const DAY = 86_400_000;
const NOW = Date.now();
const DATA_START = Date.parse("2023-10-15T00:00:00Z");
const ALLOWED_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

// ─── Seeded randomness ────────────────────────────────────────────────────────

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(SEED);
const rint = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
const chance = (p) => rand() < p;
const pick = (xs) => xs[Math.floor(rand() * xs.length)];
function weighted(pairs) {
  let r = rand();
  for (const [value, w] of pairs) {
    r -= w;
    if (r < 0) return value;
  }
  return pairs[pairs.length - 1][0];
}
function shuffle(xs) {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
}
function hex(bytes) {
  let s = "";
  for (let i = 0; i < bytes; i++) s += rint(0, 255).toString(16).padStart(2, "0");
  return s;
}
function uuid(r = null) {
  const h = r ? Array.from({ length: 32 }, () => Math.floor(r() * 16).toString(16)).join("") : hex(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${(8 + rint(0, 3)).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
const iso = (ms) => new Date(ms).toISOString();
const clampNow = (ms) => Math.min(ms, NOW);
const round2 = (x) => Math.round(x * 100) / 100;
const randomMs = (from = DATA_START, to = NOW) => from + Math.floor(rand() * Math.max(0, to - from));
const money = (lo, hi) => (rint(lo * 100, hi * 100) / 100).toFixed(2);
const signedUrl = (bucket, name) => `https://storage.example.test/${bucket}/${uuid()}/${name}?token=${hex(12)}&expires=${NOW + 3_600_000}`;

// ─── Reference lists ──────────────────────────────────────────────────────────

const FIRST_NAMES = ["Maria", "Juan", "Jose", "Ana", "Carlo", "Mark", "Kristine", "Angelo", "Jessa", "Rhea", "Paolo", "Liza", "Miguel", "Angela", "Ramon", "Grace", "Rodel", "Christine", "Ivan", "Joy", "Noel", "Marites", "Eduardo", "Lorna", "Jerome", "Cherry", "Dennis", "Mae", "Renz", "Hazel"];
const LAST_NAMES = ["Santos", "Reyes", "Cruz", "Bautista", "Ocampo", "Garcia", "Mendoza", "Torres", "Flores", "Villanueva", "Ramos", "Dela Cruz", "Aquino", "Castillo", "Pascual", "Lim", "Tan", "Go", "Navarro", "Domingo", "Lopez", "Gonzales", "Rivera", "Salazar"];
const CITIES = ["Manila", "Quezon City", "Makati", "Taguig", "Pasig", "Mandaluyong", "Cebu City", "Davao City", "Antipolo", "Iloilo City", "Bacolod", "Cagayan de Oro"];
const STREETS = ["Rizal", "Mabini", "Aguinaldo", "Del Pilar", "Bonifacio", "Katipunan", "Session", "Lapu-Lapu", "Quezon", "Osmena"];

const CATEGORIES = [
  { name: "Plumbing", active: true, titles: ["Fix leaking kitchen sink", "Unclog bathroom drain", "Replace water heater"] },
  { name: "Electrical", active: true, titles: ["Install ceiling fan", "Repair breaker box", "Rewire outdoor lights"] },
  { name: "House Cleaning", active: true, titles: ["Deep clean 2-bedroom condo", "Post-renovation cleaning", "Weekly apartment cleaning"] },
  { name: "Carpentry", active: true, titles: ["Assemble wardrobe", "Repair kitchen cabinet door", "Build shoe rack"] },
  { name: "Painting", active: true, titles: ["Repaint living room", "Touch up exterior wall", "Paint bedroom ceiling"] },
  { name: "Aircon Repair", active: true, titles: ["Aircon cleaning and check-up", "Refill aircon gas", "Fix aircon not cooling"] },
  { name: "Appliance Repair", active: true, titles: ["Repair washing machine", "Fix refrigerator not cooling", "Microwave repair"] },
  { name: "Gardening", active: true, titles: ["Trim hedges and lawn", "Garden cleanup", "Install potted plants"] },
  { name: "Moving Help", active: false, titles: ["Help moving a 1BR apartment", "Load and unload van", "Furniture moving"] },
  { name: "Tutoring", active: true, titles: ["Math tutoring for high school", "English tutoring", "Coding lessons for beginners"] },
  { name: "IT Support", active: true, titles: ["Set up home Wi-Fi", "Laptop virus removal", "Install CCTV cameras"] },
  { name: "Massage Therapy", active: false, titles: ["Home massage 60 min", "Sports massage", "Prenatal massage"] },
];
const CATEGORY_ROWS = CATEGORIES.map((c, i) => ({ id: i + 1, name: c.name, is_active: c.active }));

const BOOKING_STATUSES = ["open", "recommending", "assigned", "confirmed", "in_progress", "completed", "cancelled", "expired"];
const BOOKING_STATUS_WEIGHTS = [
  ["completed", 0.45], ["cancelled", 0.1], ["expired", 0.05], ["open", 0.08],
  ["recommending", 0.05], ["assigned", 0.07], ["confirmed", 0.08], ["in_progress", 0.12],
];
const ESCROW_STATUSES = ["held", "released", "disputed", "refunded", "cancelled"];
const WALLET_KINDS = [
  ["topup", 0.3], ["withdrawal", 0.1], ["escrow_hold", 0.25], ["payout", 0.2],
  ["refund", 0.07], ["adjustment", 0.03], ["recovery_credit", 0.01], ["connect_transfer", 0.04],
];
const WALLET_KIND_NAMES = WALLET_KINDS.map(([k]) => k);
const CREDIT_KINDS = new Set(["topup", "payout", "refund", "recovery_credit"]);
const KIND_TITLES = {
  topup: ["Top-up via Stripe Checkout", "Wallet top-up"],
  withdrawal: ["Withdrawal to GCash", "Withdrawal to bank account"],
  escrow_hold: ["Escrow hold for booking"],
  payout: ["Payout for completed job"],
  refund: ["Refund for cancelled job"],
  adjustment: ["Manual balance adjustment"],
  recovery_credit: ["Recovery voucher credit"],
  connect_transfer: ["Transfer to Stripe Connect account"],
};
const SUSPENSION_REASONS = ["Repeated no-shows", "Submitted fake verification documents", "Abusive chat messages", "Pattern of payment disputes", "Account under review"];
const REJECTION_REASONS = ["ID photo is blurry", "Name does not match the ID", "ID has expired", "Selfie does not match the ID photo"];
const DISPUTE_REASONS = ["Work was not completed", "Provider did not show up", "Quality below what was agreed", "Charged beyond the agreed budget", "Property damaged during the job", "Arrived very late"];
const DISPUTE_DETAILS = ["The provider left before finishing the agreed scope.", "Photos attached show the unfinished work.", "I was not contacted about the schedule change.", "The invoice does not match the quoted budget.", "Client asked for a refund after the visit."];
const RESOLUTION_NOTES = {
  released_to_provider: ["Reviewed chat history and photos. Released to provider.", "Work confirmed complete on the photos. Released to provider."],
  refunded_to_client: ["Refund approved after both parties confirmed.", "Partial refund agreed by both sides."],
  reviewed: ["No evidence of fault on either side.", "Escalated for a second review."],
};
const CHAT_LINES = ["Can you share a photo of the finished work?", "The job was completed as described.", "I already sent the photos in chat.", "We agreed on a revised schedule.", "Please check the receipt I uploaded.", "Sure, I will be there at 9.", "On my way now.", "Thanks for the update.", "Can we move it to Friday?", "The materials were not included in the budget."];
const DESCRIPTIONS = ["Need someone to look at this as soon as possible.", "Materials are on site. Bring your own tools.", "Please call before arriving.", "Work area is on the second floor.", "Pets in the house, please keep the gate closed.", "Flexible on time, weekday mornings preferred."];
const SKILL_REASONS = ["I have five years of experience in this area.", "Certified by TESDA for this trade.", "Clients have asked me for this service repeatedly.", "Completed several similar jobs on the platform.", "Want to offer this as a secondary service."];
const REVIEW_NOTES = ["Verified certificate on file.", "Overlaps with an existing category.", "Need proof of previous work.", "Approved after call with provider."];
const AUDIT_REASONS = ["Routine review", "Duplicate account", "Requested by provider", "Policy violation", "Verified by phone call"];
const AUDIT_ACTIONS = [
  ["user.suspend", "user"], ["user.reinstate", "user"], ["verification.approve", "verification"], ["verification.reject", "verification"],
  ["dispute.resolve", "dispute"], ["booking.cancel", "job"], ["withdrawal.settle", "withdrawal"], ["withdrawal.reject", "withdrawal"],
  ["maintenance.update", "platform"], ["commission.update", "platform"], ["category.create", "category"], ["category.update", "category"],
  ["admin.create", "admin"], ["admin.revoke", "admin"], ["broadcast.send", "notification"], ["wallet.recovery_credit", "wallet_transaction"],
  ["skill_request.approve", "skill_request"], ["skill_request.reject", "skill_request"], ["platform_identity.update", "platform"], ["job_capacity.update", "platform"],
];

// ─── Generated data ───────────────────────────────────────────────────────────
// Every collection keeps `row` (the wire shape) plus the fields the filters and
// the detail routes need. Lists are sorted newest first, as the backend orders them.

const genStart = Date.now();

const users = [];
const adminCount = Math.min(3, SIZE.users);
for (let i = 0; i < SIZE.users; i++) {
  const role = i < adminCount ? "admin" : chance(0.58) ? "client" : "provider";
  const isAdmin = role === "admin";
  const first = pick(FIRST_NAMES);
  const last = pick(LAST_NAMES);
  const createdMs = randomMs(DATA_START, NOW - 30 * DAY);
  const deleted = !isAdmin && chance(0.02);
  const suspended = !isAdmin && !deleted && chance(0.04);
  const row = {
    id: uuid(),
    email: isAdmin ? `admin${i + 1}@taskbuddy.example` : `${(first + last + i).toLowerCase().replace(/[^a-z0-9]/g, "")}@example.com`,
    full_name: `${first} ${last}`,
    role,
    deactivated_at: suspended ? iso(randomMs(createdMs, NOW)) : null,
    deleted_at: deleted ? iso(randomMs(createdMs, NOW)) : null,
    created_at: iso(createdMs),
    cached_avg_rating: null,
    cached_completed_jobs: null,
    phone: isAdmin ? null : `+639${String(rint(0, 999_999_999)).padStart(9, "0")}`,
    city: isAdmin ? null : pick(CITIES),
    category_name: null,
    suspended_until: suspended && chance(0.5) ? iso(NOW + rint(1, 60) * DAY) : null,
    suspension_reason: suspended ? pick(SUSPENSION_REASONS) : null,
    is_verified: role === "provider" ? false : null,
    latest_verification_status: null,
  };
  if (role === "provider") {
    row.category_name = pick(CATEGORIES).name;
    row.cached_completed_jobs = rint(0, 140);
    row.cached_avg_rating = chance(0.85) ? Math.round((3 + rand() * 2) * 10) / 10 : null;
  } else if (role === "client") {
    row.cached_completed_jobs = rint(0, 20);
  }
  users.push({ row, role, deleted, suspended, createdMs, hay: `${row.full_name} ${row.email}`.toLowerCase() });
}
users.sort((a, b) => b.createdMs - a.createdMs);

const liveUsers = users.filter((u) => !u.deleted);
const admins = users.filter((u) => u.role === "admin");
const clients = liveUsers.filter((u) => u.role === "client");
const providers = liveUsers.filter((u) => u.role === "provider");
const clientPool = clients.length ? clients : liveUsers;
const providerPool = providers.length ? providers : liveUsers;
const nonAdminPool = liveUsers.filter((u) => u.role !== "admin");

const verifications = [];
for (const p of shuffle(providers.slice()).slice(0, SIZE.verifications)) {
  const status = weighted([["pending", 0.3], ["approved", 0.5], ["rejected", 0.2]]);
  const submittedMs = randomMs(p.createdMs, NOW);
  p.row.latest_verification_status = status;
  p.row.is_verified = status === "approved";
  const row = {
    id: uuid(),
    provider_id: p.row.id,
    full_name: p.row.full_name,
    email: p.row.email,
    status,
    submitted_at: iso(submittedMs),
    reviewed_at: status === "pending" ? null : iso(clampNow(submittedMs + rint(1, 5) * DAY)),
    rejection_reason: status === "rejected" ? pick(REJECTION_REASONS) : null,
    document_type: pick(["passport", "national_id", "drivers_license", "umid"]),
    documents: [signedUrl("verification-docs", "id-front.jpg"), signedUrl("verification-docs", "selfie.jpg")],
    method: chance(0.2) ? "stripe_identity" : "manual",
  };
  verifications.push({ row, status, submittedMs, hay: `${row.full_name} ${row.email}`.toLowerCase() });
}
verifications.sort((a, b) => b.submittedMs - a.submittedMs);

const jobs = [];
for (let i = 0; i < SIZE.bookings; i++) {
  const status = weighted(BOOKING_STATUS_WEIGHTS);
  const catIndex = rint(0, CATEGORIES.length - 1);
  const cat = CATEGORIES[catIndex];
  const client = pick(clientPool);
  const needsProvider = ["assigned", "confirmed", "in_progress", "completed"].includes(status) || (status === "cancelled" && chance(0.5));
  const provider = needsProvider ? pick(providerPool) : null;
  const postedMs = randomMs(DATA_START, NOW - DAY);
  const row = {
    id: uuid(),
    status,
    posted_at: iso(postedMs),
    budget: chance(0.03) ? null : money(250, 9000),
    service_categories: { name: cat.name },
    client: { id: client.row.id, full_name: client.row.full_name },
    provider: provider ? { id: provider.row.id, full_name: provider.row.full_name } : null,
  };
  jobs.push({
    index: i,
    row,
    status,
    catId: catIndex + 1,
    catName: cat.name,
    title: pick(cat.titles),
    postedMs,
    description: pick(DESCRIPTIONS),
    address: `${rint(1, 999)} ${pick(STREETS)} St., ${pick(CITIES)}`,
    scheduledMs: postedMs + rint(1, 30) * DAY,
    completedMs: status === "completed" ? clampNow(postedMs + rint(2, 20) * DAY) : null,
    photos: Array.from({ length: rint(0, 3) }, (_, k) => `https://storage.example.test/job-photos/${uuid()}/${k + 1}.jpg`),
    client,
    provider,
    txn: null,
    hay: `${client.row.full_name} ${provider ? provider.row.full_name : ""} ${cat.name}`.toLowerCase(),
  });
}

const txns = [];
for (let i = 0; i < SIZE.transactions && jobs.length; i++) {
  const job = jobs[i % jobs.length];
  const status = weighted([["held", 0.05], ["released", 0.78], ["disputed", 0.03], ["refunded", 0.09], ["cancelled", 0.05]]);
  const card = chance(0.3);
  let transferStatus = "none";
  let stripeTransferId = null;
  let transferError = null;
  if (card && status === "released") {
    transferStatus = weighted([["transferred", 0.8], ["failed", 0.08], ["pending", 0.04], ["not_eligible", 0.04], ["abandoned", 0.04]]);
    if (transferStatus === "transferred") stripeTransferId = `tr_${hex(12)}`;
    if (transferStatus === "failed") transferError = "Stripe: destination account is not enabled for transfers";
  }
  const heldMs = clampNow(job.postedMs + rint(0, 3) * DAY + rint(0, 86_399) * 1000);
  const row = {
    id: uuid(),
    job_id: job.row.id,
    amount: money(250, 9000),
    status,
    held_at: iso(heldMs),
    jobs: { title: job.title, service_categories: { name: job.catName } },
    client: job.row.client,
    provider: job.row.provider,
    funding_method: card ? "card" : "wallet",
    transfer_status: transferStatus,
    stripe_transfer_id: stripeTransferId,
    transfer_last_error: transferError,
  };
  const txn = {
    row,
    job,
    ms: heldMs,
    amount: Number(row.amount),
    status,
    hay: `${job.row.client.full_name} ${job.row.provider ? job.row.provider.full_name : ""} ${job.title} ${job.catName}`.toLowerCase(),
  };
  txns.push(txn);
  if (!job.txn) job.txn = txn;
}
txns.sort((a, b) => b.ms - a.ms);

const disputes = [];
for (const txn of shuffle(txns.slice()).slice(0, SIZE.disputes)) {
  const { job } = txn;
  const status = weighted([["open", 0.2], ["resolved", 0.7], ["cancelled", 0.1]]);
  const resolution = status === "resolved" ? weighted([["released_to_provider", 0.45], ["refunded_to_client", 0.4], ["reviewed", 0.15]]) : null;
  const createdMs = randomMs(job.postedMs, NOW);
  const escrowId = chance(0.9) ? txn.row.id : null;
  const cancelState = job.status === "cancelled" && chance(0.5) ? pick(["pending", "contested", "accepted", "expired"]) : null;
  const authors = job.provider ? [job.row.client, job.row.provider] : [job.row.client];
  const entries = Array.from({ length: rint(1, 4) }, (_, k) => {
    const kind = pick(["message", "evidence", "note"]);
    const author = pick(authors);
    const body = pick(CHAT_LINES);
    return {
      id: uuid(),
      kind,
      body,
      created_at: iso(clampNow(createdMs + (k + 1) * rint(1, 12) * 3_600_000)),
      author: { id: author.id, full_name: author.full_name, role: author.id === job.row.client.id ? "client" : "provider" },
      message: kind === "message" ? { id: uuid(), body, attachment_path: chance(0.2) ? `disputes/${hex(8)}.jpg` : null } : null,
      attachment_url: chance(0.2) ? signedUrl("dispute-evidence", "evidence.jpg") : null,
    };
  });
  const row = {
    id: uuid(),
    job_id: job.row.id,
    reason: pick(DISPUTE_REASONS),
    details: chance(0.7) ? pick(DISPUTE_DETAILS) : null,
    status,
    resolution,
    resolution_note: resolution ? pick(RESOLUTION_NOTES[resolution]) : null,
    created_at: iso(createdMs),
    resolved_at: status === "resolved" ? iso(randomMs(createdMs, NOW)) : null,
    escrow_id: escrowId,
    entries,
    jobs: {
      title: job.title,
      service_categories: { name: job.catName },
      client: { full_name: job.row.client.full_name },
      provider: job.row.provider ? { full_name: job.row.provider.full_name } : null,
      client_id: job.row.client.id,
      assigned_provider_id: job.row.provider ? job.row.provider.id : null,
    },
    escrow_transactions: escrowId ? { amount: txn.row.amount, status: txn.row.status } : null,
    raised_by_profile: { id: job.row.client.id, full_name: job.row.client.full_name },
    cancellation_state: cancelState,
    cancellation_deadline: cancelState ? iso(clampNow(createdMs + 3 * DAY)) : null,
  };
  disputes.push({ row, createdMs, status, hay: `${job.row.client.full_name} ${job.title}`.toLowerCase() });
}
disputes.sort((a, b) => b.createdMs - a.createdMs);

const activityRows = [];
for (const job of jobs) {
  activityRows.push({ ms: job.postedMs, oldStatus: null, newStatus: "open", job });
  if (job.status !== "open") activityRows.push({ ms: clampNow(job.postedMs + rint(1, 5) * DAY), oldStatus: "open", newStatus: job.status, job });
}
activityRows.sort((a, b) => b.ms - a.ms);
const activity = activityRows.map((a, idx) => ({
  ms: a.ms,
  hay: a.job.title.toLowerCase(),
  row: {
    id: activityRows.length - idx,
    old_status: a.oldStatus,
    new_status: a.newStatus,
    changed_at: iso(a.ms),
    jobs: { title: a.job.title },
    changed_by: chance(0.2) ? null : chance(0.3) ? { full_name: pick(admins).row.full_name } : { full_name: a.job.row.client.full_name },
  },
}));

const wallet = [];
for (let i = 0; i < SIZE.wallet; i++) {
  const kind = weighted(WALLET_KINDS);
  const direction = kind === "adjustment" ? pick(["credit", "debit"]) : CREDIT_KINDS.has(kind) ? "credit" : "debit";
  const status = weighted([["completed", 0.85], ["pending", 0.08], ["failed", 0.07]]);
  const profile = kind === "withdrawal" ? pick(providerPool) : pick(nonAdminPool);
  const createdMs = randomMs();
  const title = pick(KIND_TITLES[kind]);
  const row = {
    id: uuid(),
    direction,
    status,
    kind,
    amount: money(50, 5000),
    title,
    created_at: iso(createdMs),
    profile: { id: profile.row.id, full_name: profile.row.full_name },
  };
  wallet.push({ row, createdMs, hay: `${profile.row.full_name} ${title}`.toLowerCase() });
}
wallet.sort((a, b) => b.createdMs - a.createdMs);

// Withdrawals are the wallet's `withdrawal` rows plus the review and destination fields.
const withdrawals = wallet
  .filter((w) => w.row.kind === "withdrawal")
  .map((w) => {
    const pending = w.row.status === "pending";
    const row = {
      ...w.row,
      profile_id: w.row.profile.id,
      withdrawal_destination: `${pick(["GCash", "BDO", "BPI"])} ****${rint(1000, 9999)}`,
      reviewed_at: pending ? null : iso(clampNow(w.createdMs + rint(0, 3) * DAY)),
      reviewed_by: pending ? null : pick(admins).row.id,
      review_note: w.row.status === "failed" ? "Account name does not match the registered GCash name" : null,
    };
    return { row, status: w.row.status, hay: w.hay };
  });

const skillRequests = [];
for (let i = 0; i < 240; i++) {
  const provider = pick(providerPool);
  const cat = pick(CATEGORY_ROWS);
  const status = weighted([["pending", 0.25], ["approved", 0.55], ["rejected", 0.15], ["cancelled", 0.05]]);
  const createdMs = randomMs();
  const reason = pick(SKILL_REASONS);
  const row = {
    id: uuid(),
    provider_id: provider.row.id,
    type: weighted([["change_primary", 0.4], ["add_secondary", 0.6]]),
    category_id: cat.id,
    reason,
    status,
    review_note: status === "approved" || status === "rejected" ? pick(REVIEW_NOTES) : null,
    created_at: iso(createdMs),
    category: { id: cat.id, name: cat.name },
    provider: { full_name: provider.row.full_name },
  };
  skillRequests.push({ row, status, createdMs, hay: `${provider.row.full_name} ${cat.name} ${reason}`.toLowerCase() });
}
skillRequests.sort((a, b) => b.createdMs - a.createdMs);

const auditRows = [];
for (let i = 0; i < 2000; i++) {
  const [action, targetType] = pick(AUDIT_ACTIONS);
  const actor = pick(admins);
  const createdMs = randomMs();
  const row = {
    id: uuid(),
    actor_id: actor.row.id,
    action,
    target_type: targetType,
    target_id: uuid(),
    metadata: { reason: pick(AUDIT_REASONS) },
    created_at: iso(createdMs),
    actor: { id: actor.row.id, full_name: actor.row.full_name },
  };
  auditRows.push({ row, createdMs, action, actorId: actor.row.id, hay: `${actor.row.full_name} ${action} ${targetType}`.toLowerCase() });
}
auditRows.sort((a, b) => b.createdMs - a.createdMs);

// Sorting jobs newest first after the transactions have linked to them.
jobs.sort((a, b) => b.postedMs - a.postedMs);
const jobById = new Map(jobs.map((j) => [j.row.id, j]));
const bookingCountsByStatus = Object.fromEntries(BOOKING_STATUSES.map((s) => [s, 0]));
for (const j of jobs) bookingCountsByStatus[j.status] += 1;

// Summary numbers are computed once from the generated data. Commission is
// applied per request, so PATCH /admin/commission shows up in the summary.
function buildAnalyticsBase() {
  const bookingsByCategory = Object.fromEntries(CATEGORIES.map((c) => [c.name, 0]));
  const perDay = new Map();
  for (const j of jobs) {
    bookingsByCategory[j.catName] += 1;
    const day = iso(j.postedMs).slice(0, 10);
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }
  const bookingTrend = [];
  for (let ms = DATA_START; ms <= NOW; ms += DAY) {
    const date = iso(ms).slice(0, 10);
    bookingTrend.push({ date, count: perDay.get(date) ?? 0 });
  }

  let totalRevenue = 0;
  let monthlyRevenue = 0;
  let escrowHeld = 0;
  let escrowCount = 0;
  const perMonth = new Map();
  const monthStart = NOW - 30 * DAY;
  for (const t of txns) {
    if (t.status === "released") {
      totalRevenue += t.amount;
      if (t.ms >= monthStart) monthlyRevenue += t.amount;
      const key = iso(t.ms).slice(0, 7);
      perMonth.set(key, (perMonth.get(key) ?? 0) + t.amount);
    }
    if (t.status === "held") {
      escrowHeld += t.amount;
      escrowCount += 1;
    }
  }
  const revenueTrend = [];
  const endKey = iso(NOW).slice(0, 7);
  let y = new Date(DATA_START).getUTCFullYear();
  let m = new Date(DATA_START).getUTCMonth();
  for (;;) {
    const key = `${y}-${String(m + 1).padStart(2, "0")}`;
    revenueTrend.push({ month: key, amount: round2(perMonth.get(key) ?? 0) });
    if (key === endKey) break;
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }

  const rated = providers.map((p) => p.row.cached_avg_rating).filter((r) => r !== null);
  const avgRating = rated.length ? round2(rated.reduce((a, b) => a + b, 0) / rated.length) : null;
  const topProviders = [...providers]
    .sort((a, b) => (b.row.cached_completed_jobs ?? 0) - (a.row.cached_completed_jobs ?? 0))
    .slice(0, 5)
    .map((p) => ({
      profile_id: p.row.id,
      cached_avg_rating: p.row.cached_avg_rating,
      cached_ratings_count: Math.round((p.row.cached_completed_jobs ?? 0) * 0.8),
      cached_completed_jobs: p.row.cached_completed_jobs,
      profiles: { full_name: p.row.full_name },
      service_categories: { name: p.row.category_name },
    }));

  return {
    totals: {
      users: liveUsers.length,
      clients: clients.length,
      providers: providers.length,
      suspended: liveUsers.filter((u) => u.suspended).length,
      bookings: jobs.length,
      avg_rating: avgRating,
      total_revenue: round2(totalRevenue),
      monthly_revenue: round2(monthlyRevenue),
      pending_verifications: verifications.filter((v) => v.status === "pending").length,
      pending_withdrawals: withdrawals.filter((w) => w.status === "pending").length,
      escrow_held_total: round2(escrowHeld),
      escrow_held_count: escrowCount,
      open_jobs: bookingCountsByStatus.open,
      matching_jobs: bookingCountsByStatus.recommending,
    },
    bookings_by_status: bookingCountsByStatus,
    bookings_by_category: bookingsByCategory,
    booking_trend: bookingTrend,
    revenue_trend: revenueTrend,
    top_providers: topProviders,
  };
}
const ANALYTICS_BASE = buildAnalyticsBase();

// ─── Mutable state ────────────────────────────────────────────────────────────

const state = {
  maintenance: { maintenance_mode: false, maintenance_message: null, updated_at: iso(NOW) },
  commission: { commission_rate: COMMISSION_DEFAULT, updated_at: iso(NOW) },
  settings: {
    profile_id: admins[0].row.id,
    push_enabled: true,
    email_enabled: true,
    sms_enabled: false,
    location_sharing: false,
    dark_mode: false,
    created_at: iso(NOW - 400 * DAY),
    updated_at: iso(NOW),
  },
};
/** access token -> { user, csrf }. In memory; a restart signs everyone out. */
const sessions = new Map();

const GENERATED_IN_MS = Date.now() - genStart;

// ─── Helpers for requests ─────────────────────────────────────────────────────

class HttpError extends Error {
  constructor(status, detail) {
    super(Array.isArray(detail) ? detail[0] : detail);
    this.status = status;
    this.detail = detail;
  }
}
const badRequest = (detail) => new HttpError(400, detail);
const STATUS_TEXT = { 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 405: "Method Not Allowed", 500: "Internal Server Error" };
const errorBody = (status, detail) => ({ message: detail, error: STATUS_TEXT[status] ?? "Error", statusCode: status });

function enumParam(query, name, allowed) {
  const raw = query.get(name);
  if (raw === null || raw === "") return null;
  if (!allowed.includes(raw)) throw badRequest([`${name} must be one of the following values: ${allowed.join(", ")}`]);
  return raw;
}
function intParam(query, name) {
  const raw = query.get(name);
  if (raw === null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isInteger(n)) throw badRequest([`${name} must be an integer`]);
  return n;
}
function dateParam(query, name) {
  const raw = query.get(name);
  if (raw === null || raw === "") return null;
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) throw badRequest([`${name} must be a valid ISO 8601 date string`]);
  return ms;
}
function searchParam(query, max) {
  const raw = query.get("search") ?? "";
  if (raw.length > max) throw badRequest([`search must be shorter than or equal to ${max} characters`]);
  return raw.trim().toLowerCase();
}
function pageParams(query, defaultLimit, maxLimit, rejectOverMax) {
  const rawLimit = query.get("limit");
  const rawOffset = query.get("offset");
  let limit = defaultLimit;
  if (rawLimit !== null && rawLimit !== "") {
    limit = Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 0) throw badRequest(["limit must be a non-negative integer"]);
    if (limit > maxLimit) {
      if (rejectOverMax) throw badRequest([`limit must not be greater than ${maxLimit}`]);
      limit = maxLimit;
    }
  }
  let offset = 0;
  if (rawOffset !== null && rawOffset !== "") {
    offset = Number(rawOffset);
    if (!Number.isInteger(offset) || offset < 0) throw badRequest(["offset must be a non-negative integer"]);
  }
  return { limit, offset };
}
/** Honest paging: `total` is the filtered count, and rows are the requested slice. */
function listResponse(key, items, query, { defaultLimit = 20, maxLimit = MAX_PAGE, rejectOverMax = false, extra = {} } = {}) {
  const { limit, offset } = pageParams(query, defaultLimit, maxLimit, rejectOverMax);
  const rows = items.slice(offset, offset + limit).map((item) => item.row);
  return { body: { [key]: rows, total: items.length, ...extra }, rows: rows.length };
}
function parseBody(raw) {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" ? value : {};
  } catch {
    throw badRequest("Invalid JSON body");
  }
}
function parseCookies(header = "") {
  const out = {};
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}
const sessionCookie = (name, value, httpOnly) => `${name}=${value}; Path=/; Max-Age=28800; SameSite=Lax${httpOnly ? "; HttpOnly" : ""}`;
const clearCookie = (name, httpOnly) => `${name}=; Path=/; Max-Age=0; SameSite=Lax${httpOnly ? "; HttpOnly" : ""}`;
function nameFromEmail(email) {
  const local = email.split("@")[0] ?? "";
  const words = local.split(/[._-]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1));
  return words.length ? words.join(" ") : "Admin";
}
function verificationOf(row) {
  if (row.role !== "provider") return null;
  if (row.is_verified) return "verified";
  if (row.latest_verification_status === "pending") return "pending";
  if (row.latest_verification_status === "rejected") return "rejected";
  return "unverified";
}
function jobConversation(job) {
  if (job.messages) return job.messages;
  // A per-job generator, so conversations are stable without storing them up front.
  const r = mulberry32((SEED ^ Math.imul(job.index + 1, 2654435761)) >>> 0);
  const count = 2 + Math.floor(r() * 11);
  let t = job.postedMs;
  job.messages = Array.from({ length: count }, (_, k) => {
    const fromClient = !job.provider || r() < 0.5;
    const sender = fromClient ? job.client : job.provider;
    t = clampNow(t + Math.floor(r() * 6 * 3_600_000) + 60_000);
    const message = {
      id: `msg-${job.index}-${k}`,
      sender_id: sender.row?.id ?? sender.id,
      sender_name: sender.row?.full_name ?? sender.full_name,
      body: CHAT_LINES[Math.floor(r() * CHAT_LINES.length)],
      read_at: r() < 0.8 ? iso(clampNow(t + 600_000)) : null,
      created_at: iso(t),
    };
    if (r() < 0.1) message.attachment_url = signedUrl("chat-attachments", "photo.jpg");
    return message;
  });
  return job.messages;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────
// Each handler gets { params, query, body, session, cookies } and returns
// { body, rows?, status?, headers? }. Errors are thrown as HttpError.

function sessionGet({ cookies }) {
  const s = cookies.tb_admin_access ? sessions.get(cookies.tb_admin_access) : undefined;
  if (!s) throw new HttpError(401, "Unauthorized");
  return { body: { user: s.user, csrf_token: s.csrf } };
}

function login({ body }) {
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  // Any non-empty email and password are accepted.
  if (!email || !password) throw new HttpError(401, "Invalid email or password");
  const access = randomBytes(24).toString("hex");
  const csrf = randomBytes(24).toString("hex");
  const user = { id: admins[0].row.id, email, full_name: nameFromEmail(email), role: "admin" };
  sessions.set(access, { user, csrf });
  return {
    body: { user, csrf_token: csrf },
    headers: { "set-cookie": [sessionCookie("tb_admin_access", access, true), sessionCookie("tb_admin_csrf", csrf, false)] },
  };
}

function refresh({ cookies }) {
  const s = cookies.tb_admin_access ? sessions.get(cookies.tb_admin_access) : undefined;
  if (!s) throw new HttpError(401, "Unauthorized");
  return { body: { csrf_token: s.csrf } };
}

function logout({ cookies }) {
  if (cookies.tb_admin_access) sessions.delete(cookies.tb_admin_access);
  return { body: { ok: true }, headers: { "set-cookie": [clearCookie("tb_admin_access", true), clearCookie("tb_admin_csrf", false)] } };
}

function getSettings() {
  return { body: state.settings };
}

function patchSettings({ body }) {
  if (body.dark_mode !== undefined) {
    if (typeof body.dark_mode !== "boolean") throw badRequest(["dark_mode must be a boolean"]);
    state.settings = { ...state.settings, dark_mode: body.dark_mode, updated_at: iso(Date.now()) };
  }
  return { body: state.settings };
}

function listUsers({ query }) {
  const status = enumParam(query, "status", ["active", "suspended", "deleted"]);
  const role = enumParam(query, "role", ["client", "provider", "admin"]);
  const verification = enumParam(query, "verification", ["verified", "pending", "rejected", "unverified"]);
  const q = searchParam(query, 200);
  const inScope = (u) => {
    if (status === "deleted") return u.deleted;
    if (u.deleted) return false;
    if (status === "suspended") return u.suspended;
    if (status === "active") return !u.suspended;
    return true;
  };
  const list = users.filter(
    (u) => inScope(u) && (!role || u.role === role) && (!verification || verificationOf(u.row) === verification) && (!q || u.hay.includes(q)),
  );
  return listResponse("users", list, query, { defaultLimit: 20 });
}

function listVerifications({ query }) {
  const status = enumParam(query, "status", ["pending", "approved", "rejected"]);
  const q = searchParam(query, 200);
  const list = verifications.filter((v) => (!status || v.status === status) && (!q || v.hay.includes(q)));
  return listResponse("verifications", list, query, { defaultLimit: 20 });
}

function listDisputes({ query }) {
  const status = enumParam(query, "status", ["open", "resolved", "cancelled"]);
  const q = searchParam(query, 200);
  const list = disputes.filter((d) => (!status || d.status === status) && (!q || d.hay.includes(q)));
  return listResponse("disputes", list, query, { defaultLimit: 50 });
}

function listBookings({ query }) {
  const status = enumParam(query, "status", BOOKING_STATUSES);
  const categoryId = intParam(query, "category_id");
  const q = searchParam(query, 100);
  const list = jobs.filter(
    (j) => (!status || j.status === status) && (categoryId === null || j.catId === categoryId) && (!q || j.hay.includes(q)),
  );
  return listResponse("bookings", list, query, { defaultLimit: 20, extra: { status_counts: bookingCountsByStatus } });
}

function bookingDetail({ params }) {
  const job = jobById.get(params.id);
  if (!job) throw new HttpError(404, "Booking not found");
  return {
    body: {
      ...job.row,
      description: job.description,
      address: job.address,
      scheduled_at: iso(job.scheduledMs),
      photo_urls: job.photos,
      escrow: job.txn ? { amount: job.txn.row.amount, status: job.txn.row.status } : null,
      completed_at: job.completedMs ? iso(job.completedMs) : null,
    },
  };
}

function listTransactions({ query }) {
  const status = enumParam(query, "status", ESCROW_STATUSES);
  const q = searchParam(query, 200);
  const list = txns.filter((t) => (!status || t.status === status) && (!q || t.hay.includes(q)));
  return listResponse("transactions", list, query, { defaultLimit: 50 });
}

function listWalletTransactions({ query }) {
  const kind = enumParam(query, "kind", WALLET_KIND_NAMES);
  const status = enumParam(query, "status", ["pending", "completed", "failed"]);
  const q = searchParam(query, 200);
  const list = wallet.filter((w) => (!kind || w.row.kind === kind) && (!status || w.row.status === status) && (!q || w.hay.includes(q)));
  return listResponse("transactions", list, query, { defaultLimit: 50 });
}

function listWithdrawals({ query }) {
  const status = enumParam(query, "status", ["pending", "completed", "failed"]) ?? "pending";
  const list = withdrawals.filter((w) => w.status === status);
  return listResponse("withdrawals", list, query, { defaultLimit: 50 });
}

function listSkillRequests({ query }) {
  const status = enumParam(query, "status", ["pending", "approved", "rejected", "cancelled"]);
  const q = searchParam(query, 200);
  const list = skillRequests.filter((s) => (!status || s.status === status) && (!q || s.hay.includes(q)));
  return listResponse("items", list, query, { defaultLimit: 100, maxLimit: SKILL_REQUEST_MAX_PAGE, rejectOverMax: true });
}

function listAudit({ query }) {
  const action = query.get("action") || null;
  const actorId = query.get("actor_id") || null;
  const q = searchParam(query, 200);
  const from = dateParam(query, "from");
  const to = dateParam(query, "to");
  const list = auditRows.filter(
    (a) =>
      (!action || a.action === action) &&
      (!actorId || a.actorId === actorId) &&
      (!q || a.hay.includes(q)) &&
      (from === null || a.createdMs >= from) &&
      (to === null || a.createdMs <= to),
  );
  return listResponse("actions", list, query, { defaultLimit: 50 });
}

function listActivity({ query }) {
  const q = searchParam(query, 100);
  const from = dateParam(query, "from");
  const to = dateParam(query, "to");
  const list = activity.filter((a) => (!q || a.hay.includes(q)) && (from === null || a.ms >= from) && (to === null || a.ms <= to));
  return listResponse("items", list, query, { defaultLimit: 20 });
}

function analyticsSummary() {
  if (ANALYTICS_FAIL) throw new HttpError(500, "Analytics temporarily unavailable");
  const rate = state.commission.commission_rate;
  return {
    body: {
      ...ANALYTICS_BASE,
      totals: {
        ...ANALYTICS_BASE.totals,
        total_commission: round2(ANALYTICS_BASE.totals.total_revenue * rate),
        monthly_commission: round2(ANALYTICS_BASE.totals.monthly_revenue * rate),
      },
    },
  };
}

function getMaintenance() {
  return { body: state.maintenance };
}

function patchMaintenance({ body }) {
  if (typeof body.maintenance_mode !== "boolean") throw badRequest(["maintenance_mode must be a boolean"]);
  const message = typeof body.maintenance_message === "string" ? body.maintenance_message.slice(0, 500) : state.maintenance.maintenance_message;
  state.maintenance = { maintenance_mode: body.maintenance_mode, maintenance_message: message, updated_at: iso(Date.now()) };
  return { body: state.maintenance };
}

function getCommission() {
  return { body: state.commission };
}

function patchCommission({ body }) {
  const rate = body.commission_rate;
  if (typeof rate !== "number" || rate < 0 || rate > 0.5) throw badRequest(["commission_rate must be a number between 0 and 0.5"]);
  state.commission = { commission_rate: rate, updated_at: iso(Date.now()) };
  return { body: state.commission };
}

function broadcast({ body }) {
  const audience = body.audience;
  if (!["all", "clients", "providers"].includes(audience)) throw badRequest(["audience must be one of the following values: all, clients, providers"]);
  if (typeof body.title !== "string" || !body.title.trim()) throw badRequest(["title should not be empty"]);
  if (typeof body.body !== "string" || !body.body.trim()) throw badRequest(["body should not be empty"]);
  const sent = audience === "clients" ? clients.length : audience === "providers" ? providers.length : clients.length + providers.length;
  return { body: { sent, failed: 0, audience } };
}

function categoriesGet() {
  return { body: CATEGORY_ROWS, rows: CATEGORY_ROWS.length };
}

function adminsGet() {
  const rows = admins.map((a) => ({
    id: a.row.id,
    email: a.row.email,
    full_name: a.row.full_name,
    role: "admin",
    created_at: a.row.created_at,
    deactivated_at: null,
    deleted_at: null,
  }));
  return { body: rows, rows: rows.length };
}

function platformIdentity() {
  return { body: { platform_name: "TaskBuddy", support_email: "support@taskbuddy.example", identity_version: 3 } };
}

function jobCapacity() {
  return {
    body: {
      client_active_max: 5,
      provider_active_max: 8,
      provider_pending_max: 12,
      daily_hours_max: 10,
      rest_hours: 8,
      travel_kmh: 25,
    },
  };
}

function conversation({ params }) {
  const job = jobById.get(params.id);
  if (!job) throw new HttpError(404, "Job not found");
  const messages = jobConversation(job);
  return { body: { messages }, rows: messages.length };
}

// ─── Routing ──────────────────────────────────────────────────────────────────

function route(method, path, handler, { auth = false } = {}) {
  const re = new RegExp(`^${path.replace(/:(\w+)/g, "(?<$1>[^/]+)")}$`);
  return { method, path, re, handler, auth };
}

// `auth: true` needs a session cookie, and an X-CSRF-Token header on non-GET requests.
const ROUTES = [
  route("GET", "/auth/admin/session", sessionGet),
  route("POST", "/auth/admin/login", login),
  route("POST", "/auth/admin/refresh", refresh),
  route("POST", "/auth/admin/logout", logout),
  route("GET", "/settings", getSettings, { auth: true }),
  route("PATCH", "/settings", patchSettings, { auth: true }),
  route("GET", "/admin/users", listUsers, { auth: true }),
  route("GET", "/admin/verifications", listVerifications, { auth: true }),
  route("GET", "/admin/disputes", listDisputes, { auth: true }),
  route("GET", "/admin/bookings", listBookings, { auth: true }),
  route("GET", "/admin/bookings/:id", bookingDetail, { auth: true }),
  route("GET", "/admin/transactions", listTransactions, { auth: true }),
  route("GET", "/admin/wallet-transactions", listWalletTransactions, { auth: true }),
  route("GET", "/admin/withdrawals", listWithdrawals, { auth: true }),
  route("GET", "/admin/skill-requests", listSkillRequests, { auth: true }),
  route("GET", "/admin/audit", listAudit, { auth: true }),
  route("GET", "/admin/activity", listActivity, { auth: true }),
  route("GET", "/admin/analytics/summary", analyticsSummary, { auth: true }),
  route("GET", "/admin/maintenance", getMaintenance, { auth: true }),
  route("PATCH", "/admin/maintenance", patchMaintenance, { auth: true }),
  route("GET", "/admin/commission", getCommission, { auth: true }),
  route("PATCH", "/admin/commission", patchCommission, { auth: true }),
  route("POST", "/admin/notifications/broadcast", broadcast, { auth: true }),
  route("GET", "/admin/categories", categoriesGet, { auth: true }),
  route("GET", "/admin/admins", adminsGet, { auth: true }),
  route("GET", "/admin/platform-identity", platformIdentity, { auth: true }),
  route("GET", "/admin/job-capacity", jobCapacity, { auth: true }),
  route("GET", "/admin/jobs/:id/conversation", conversation, { auth: true }),
];

function dispatch(method, url, rawBody, headers) {
  const pathname = url.pathname;
  let pathSeen = false;
  let match = null;
  for (const r of ROUTES) {
    const m = r.re.exec(pathname);
    if (!m) continue;
    pathSeen = true;
    if (r.method === method) {
      match = { r, params: { ...(m.groups ?? {}) } };
      break;
    }
  }
  if (!match) {
    return pathSeen
      ? { status: 405, body: errorBody(405, `Cannot ${method} ${pathname}`), rows: 0, key: `${method} (405)` }
      : { status: 404, body: errorBody(404, `Cannot ${method} ${pathname}`), rows: 0, key: "NOT_FOUND" };
  }
  const { r, params } = match;
  const key = `${method} ${r.path}`;
  try {
    const cookies = parseCookies(headers.cookie);
    if (r.auth) {
      const session = cookies.tb_admin_access ? sessions.get(cookies.tb_admin_access) : undefined;
      if (!session) throw new HttpError(401, "Unauthorized");
      if (method !== "GET" && headers["x-csrf-token"] !== session.csrf) throw new HttpError(403, "Invalid CSRF token");
      const out = r.handler({ params, query: url.searchParams, body: parseBody(rawBody), session, cookies });
      return { status: out.status ?? 200, body: out.body, rows: out.rows ?? 0, headers: out.headers, key };
    }
    const out = r.handler({ params, query: url.searchParams, body: parseBody(rawBody), session: null, cookies });
    return { status: out.status ?? 200, body: out.body, rows: out.rows ?? 0, headers: out.headers, key };
  } catch (err) {
    if (err instanceof HttpError) return { status: err.status, body: errorBody(err.status, err.detail), rows: 0, key };
    console.error("[fake-api] handler error", method, pathname, err);
    return { status: 500, body: errorBody(500, "Internal server error"), rows: 0, key };
  }
}

// ─── HTTP server, CORS, logging and stats ─────────────────────────────────────

const stats = { since: new Date().toISOString(), requests: 0, bytes: 0, routes: {} };

function resetStats() {
  stats.since = new Date().toISOString();
  stats.requests = 0;
  stats.bytes = 0;
  stats.routes = {};
}

function recordRequest({ key, method, url, status, rows, bytes, ms }) {
  stats.requests += 1;
  stats.bytes += bytes;
  const entry = stats.routes[key] ?? (stats.routes[key] = { count: 0, bytes: 0, rows: 0 });
  entry.count += 1;
  entry.bytes += bytes;
  entry.rows += rows;
  console.log(JSON.stringify({ t: new Date().toISOString(), method, url, status, rows, bytes, ms: Math.round(ms * 10) / 10 }));
}

function snapshotStats() {
  const routes = Object.fromEntries(Object.entries(stats.routes).sort(([, a], [, b]) => b.bytes - a.bytes));
  return { since: stats.since, requests: stats.requests, bytes: stats.bytes, routes };
}

function corsHeaders(origin, preflight) {
  if (!origin || !ALLOWED_ORIGIN.test(origin)) return {};
  const headers = {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-expose-headers": "Retry-After",
    vary: "Origin",
  };
  if (preflight) {
    headers["access-control-allow-methods"] = "GET, POST, PATCH, PUT, DELETE, OPTIONS";
    headers["access-control-allow-headers"] = "Content-Type, X-CSRF-Token";
    headers["access-control-max-age"] = "600";
  }
  return headers;
}

const normalizePath = (pathname) =>
  pathname.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id");

function sendNow(res, status, body, headers) {
  const text = JSON.stringify(body);
  res.writeHead(status, { ...headers, "content-type": "application/json; charset=utf-8" });
  res.end(text);
}

function handle(req, res, rawBody, startedAt) {
  const method = req.method ?? "GET";
  const url = new URL(req.url ?? "/", `http://${HOST}`);
  const path = url.pathname;
  const cors = corsHeaders(req.headers.origin, method === "OPTIONS");

  if (path.startsWith("/__")) {
    if (path === "/__stats" && method === "GET") return sendNow(res, 200, snapshotStats(), cors);
    if (path === "/__reset" && method === "POST") {
      resetStats();
      return sendNow(res, 200, { ok: true, since: stats.since }, cors);
    }
    return sendNow(res, 404, errorBody(404, `Cannot ${method} ${path}`), cors);
  }

  const outcome =
    method === "OPTIONS"
      ? { status: 204, body: null, rows: 0, key: `OPTIONS ${normalizePath(path)}` }
      : dispatch(method, url, rawBody, req.headers);
  const text = outcome.body === null || outcome.body === undefined ? "" : JSON.stringify(outcome.body);
  const bytes = Buffer.byteLength(text);
  // LATENCY_MS per response, plus about 1 ms per 100 rows serialized.
  const delayMs = LATENCY_MS + outcome.rows / 100;

  setTimeout(() => {
    const headers = { ...cors, ...(outcome.headers ?? {}) };
    if (text) headers["content-type"] = "application/json; charset=utf-8";
    res.writeHead(outcome.status, headers);
    res.end(text);
    recordRequest({
      key: outcome.key,
      method,
      url: req.url ?? path,
      status: outcome.status,
      rows: outcome.rows,
      bytes,
      ms: Number(process.hrtime.bigint() - startedAt) / 1e6,
    });
  }, delayMs);
}

const server = http.createServer((req, res) => {
  const startedAt = process.hrtime.bigint();
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("error", () => {});
  req.on("end", () => {
    try {
      handle(req, res, Buffer.concat(chunks).toString("utf8"), startedAt);
    } catch (err) {
      console.error("[fake-api] request error", err);
      if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify(errorBody(500, "Internal server error")));
    }
  });
});

server.on("error", (err) => {
  console.error(`[fake-api] ${err.message}`);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const counts = `users=${SIZE.users} bookings=${SIZE.bookings} transactions=${SIZE.transactions} wallet=${SIZE.wallet} disputes=${SIZE.disputes} verifications=${SIZE.verifications}`;
  console.error(`[fake-api] http://${HOST}:${PORT} latency=${LATENCY_MS}ms analytics=${ANALYTICS_FAIL ? "fail" : "ok"} seed=${SEED}`);
  console.error(`[fake-api] generated ${counts} in ${GENERATED_IN_MS} ms`);
});
