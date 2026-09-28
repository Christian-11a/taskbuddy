// Dev-only: answers the admin API from sample data inside /dev/admin-preview,
// so pages that fetch their own data (withdrawals, service requests, job
// chats…) can be previewed without the backend. Never imported elsewhere.
import { API_URL } from "@/lib/api/client";

type Handler = (url: URL, init?: RequestInit) => unknown;

const daysAgo = (d: number, h = 9) => new Date(Date.now() - d * 86_400_000 - h * 3_600_000).toISOString();

const withdrawals = [
  { id: "w1", profile_id: "u2", profile: { id: "u2", full_name: "Mark Santos" }, amount: "3500.00", title: "Withdrawal to GCash", withdrawal_destination: "GCash · 0917 555 0112 · Mark Santos", status: "pending", created_at: daysAgo(0, 3), reviewed_at: null, reviewed_by: null, review_note: null, direction: "debit", kind: "withdrawal" },
  { id: "w2", profile_id: "u7", profile: { id: "u7", full_name: "Maria Garcia" }, amount: "1820.50", title: "Withdrawal to bank", withdrawal_destination: "BPI · ****4410 · Maria Garcia", status: "pending", created_at: daysAgo(1), reviewed_at: null, reviewed_by: null, review_note: null, direction: "debit", kind: "withdrawal" },
  { id: "w3", profile_id: "u3", profile: { id: "u3", full_name: "Juan Dela Cruz" }, amount: "900.00", title: "Withdrawal to GCash", withdrawal_destination: "GCash · 0917 555 0113", status: "completed", created_at: daysAgo(6), reviewed_at: daysAgo(5), reviewed_by: "admin-1", review_note: "Ref 8812 3301", direction: "debit", kind: "withdrawal" },
  { id: "w4", profile_id: "u4", profile: { id: "u4", full_name: "Rico Bautista" }, amount: "5000.00", title: "Withdrawal to GCash", withdrawal_destination: null, status: "failed", created_at: daysAgo(9), reviewed_at: daysAgo(8), reviewed_by: "admin-1", review_note: "No destination on file", direction: "debit", kind: "withdrawal" },
];

const skillRequests = [
  { id: "s1", provider_id: "u3", provider: { full_name: "Juan Dela Cruz" }, type: "add_secondary", category_id: 2, category: { id: 2, name: "Plumbing" }, reason: "I have done plumbing repairs for 6 years and hold a TESDA NC II certificate for plumbing.", status: "pending", review_note: null, created_at: daysAgo(0, 5) },
  { id: "s2", provider_id: "u7", provider: { full_name: "Maria Garcia" }, type: "change_primary", category_id: 5, category: { id: 5, name: "Pedicure" }, reason: "Most of my clients now book me for pedicures, so I'd like that to be my main service.", status: "pending", review_note: null, created_at: daysAgo(2) },
  { id: "s3", provider_id: "u2", provider: { full_name: "Mark Santos" }, type: "add_secondary", category_id: 3, category: { id: 3, name: "Handyman" }, reason: "General repairs alongside plumbing.", status: "approved", review_note: "Welcome aboard.", created_at: daysAgo(12) },
];

const conversation = [
  { id: "m1", sender_name: "Ana Reyes", body: "Hi! The sink is leaking under the cabinet. Can you come tomorrow morning?", created_at: daysAgo(4, 2) },
  { id: "m2", sender_name: "Rico Bautista", body: "Yes, I'll be there at 9. I'll bring a new P-trap.", created_at: daysAgo(4, 1) },
  { id: "m3", sender_name: "Ana Reyes", body: "It started leaking again tonight. Can you come back?", created_at: daysAgo(3, 20) },
];

const person = (id: string, full_name: string) => ({ id, full_name });
const cats = ["Plumbing", "Cleaning", "Handyman", "Manicure", "Pedicure"];
const clients = ["Ana Reyes", "Carlo Villanueva", "Jessa Ramos", "Paolo Navarro"];
const pros = ["Mark Santos", "Maria Garcia", "Juan Dela Cruz", "Rico Bautista", null];
const jobStatuses = ["open", "recommending", "assigned", "confirmed", "in_progress", "completed", "completed", "cancelled", "expired"];
const bookings = Array.from({ length: 23 }, (_, i) => {
  const pro = pros[i % pros.length];
  return {
    id: `b${(7300 + i * 37).toString(16)}-4c1e-9a0b-${i}`,
    status: jobStatuses[i % jobStatuses.length],
    posted_at: daysAgo(i * 1.3),
    budget: 600 + ((i * 373) % 3000),
    service_categories: { name: cats[i % cats.length] },
    client: person(`c${i}`, clients[i % clients.length]),
    provider: pro ? person(`p${i}`, pro) : null,
    description: "Kitchen sink leaks under the cabinet whenever the tap runs. Needs a new P-trap and sealing.",
    address: "Brgy. Sabang, Lipa City, Batangas",
    scheduled_at: daysAgo(i - 2),
    photo_urls: ["/promo/taskbuddy-mascot.webp"],
    escrow: i % 3 === 0 ? { amount: 1450, status: "held" } : null,
  };
});
const escrowStatuses = ["released", "held", "disputed", "refunded", "released"];
const transactions = Array.from({ length: 17 }, (_, i) => ({
  id: `esc-${1000 + i}`,
  job_id: bookings[i].id,
  amount: String(500 + ((i * 611) % 4000)),
  status: escrowStatuses[i % escrowStatuses.length],
  held_at: daysAgo(i * 1.7),
  jobs: { title: "Fix leaking sink", service_categories: { name: cats[i % cats.length] } },
  client: person(`c${i}`, clients[i % clients.length]),
  provider: person(`p${i}`, pros[i % 4]!),
  funding_method: i % 2 ? "card" : "wallet",
  transfer_status: i === 0 ? "failed" : i % 5 === 0 ? "transferred" : "none",
  stripe_transfer_id: i % 5 === 0 && i ? "tr_1Q2w3E4r5T" : null,
  transfer_last_error: i === 0 ? "Account is restricted" : null,
}));
const walletKinds = ["topup", "withdrawal", "payout", "refund", "recovery_credit"];
const wallet = Array.from({ length: 19 }, (_, i) => {
  const kind = walletKinds[i % walletKinds.length];
  return {
    id: `wt-${i}`,
    direction: kind === "withdrawal" ? "debit" : "credit",
    status: "completed",
    kind,
    amount: String(200 + ((i * 457) % 5000)),
    title: kind === "topup" ? "GCash top-up" : kind === "withdrawal" ? "Withdrawal to GCash" : kind === "payout" ? "Payout for Deep clean 2BR condo" : kind === "refund" ? "Refund for cancelled job" : "Dispute resolution credit",
    created_at: daysAgo(i * 0.8),
    profile: person(`u${i}`, [...clients, "Mark Santos", "Maria Garcia"][i % 6]),
  };
});
const activity = Array.from({ length: 34 }, (_, i) => ({
  id: i,
  old_status: jobStatuses[(i + 2) % 6],
  new_status: jobStatuses[(i + 3) % 6],
  changed_at: new Date(Date.now() - i * 47 * 60_000).toISOString(),
  jobs: { title: ["Fix leaking kitchen sink", "Deep clean 2BR condo", "Install ceiling fan", "Gel manicure at home"][i % 4] },
  changed_by: { full_name: [...clients, "Mark Santos"][i % 5] },
}));
const auditActions = ["user.suspend", "user.reinstate", "verification.approve", "verification.reject", "dispute.resolve", "booking.cancel", "withdrawal.settle"];
const audit = Array.from({ length: 26 }, (_, i) => ({
  id: `a${i}`,
  actor_id: "admin-1",
  action: auditActions[i % auditActions.length],
  target_type: auditActions[i % auditActions.length].split(".")[0],
  target_id: `9f3c${i}a1e-77b2-4d0e-8c11-1234567890ab`,
  metadata: i % 3 === 0 ? { reason: "Repeated no-shows reported by three clients" } : {},
  created_at: daysAgo(i * 0.45, 0),
  actor: person("admin-1", i % 4 ? "Ana Cruz" : "Platform Owner"),
}));

function paged<T>(rows: T[], u: URL) {
  const offset = Number(u.searchParams.get("offset") ?? 0);
  const limit = Number(u.searchParams.get("limit") ?? 20);
  return rows.slice(offset, offset + limit);
}
const matches = (q: string | null, ...fields: (string | null | undefined)[]) =>
  !q || fields.some((f) => f?.toLowerCase().includes(q.toLowerCase()));

const routes: [RegExp, string, Handler][] = [
  [/^\/admin\/bookings$/, "GET", (u) => {
    const status = u.searchParams.get("status");
    const q = u.searchParams.get("search");
    const rows = bookings.filter((b) => (!status || b.status === status) && matches(q, b.id, b.client?.full_name, b.service_categories.name));
    return { bookings: paged(rows, u), total: rows.length };
  }],
  [/^\/admin\/bookings\/[^/]+$/, "GET", (u) => bookings.find((b) => b.id === u.pathname.split("/")[3])],
  [/^\/admin\/transactions$/, "GET", (u) => {
    const status = u.searchParams.get("status");
    const q = u.searchParams.get("search");
    const rows = transactions.filter((t) => (!status || t.status === status) && matches(q, t.id, t.client.full_name, t.provider.full_name));
    return { transactions: paged(rows, u), total: rows.length };
  }],
  [/^\/admin\/wallet-transactions$/, "GET", () => ({ transactions: wallet, total: wallet.length })],
  [/^\/admin\/activity$/, "GET", (u) => {
    const q = u.searchParams.get("search");
    const rows = activity.filter((a) => matches(q, a.jobs.title));
    return { items: paged(rows, u), total: rows.length };
  }],
  [/^\/admin\/audit$/, "GET", () => ({ actions: audit })],
  [/^\/admin\/categories$/, "GET", () => cats.map((name, i) => ({ id: i + 1, name, is_active: i !== 4 }))],
  [/^\/admin\/admins$/, "GET", () => [
    { id: "admin-1", email: "admin@example.com", full_name: "Ana Cruz", role: "admin", created_at: daysAgo(200) },
    { id: "admin-2", email: "owner@example.com", full_name: "Platform Owner", role: "admin", created_at: daysAgo(320) },
    { id: "admin-3", email: "former@example.com", full_name: "Former Admin", role: "admin", created_at: daysAgo(280), deactivated_at: daysAgo(40) },
  ]],
  [/^\/admin\/commission$/, "GET", () => ({ commission_rate: "0.10", updated_at: daysAgo(30) })],
  [/^\/admin\/withdrawals$/, "GET", (u) => {
    const rows = withdrawals.filter((w) => w.status === (u.searchParams.get("status") ?? "pending"));
    return { withdrawals: rows, total: rows.length };
  }],
  [/^\/admin\/withdrawals\/[^/]+\/(settle|reject)$/, "POST", (u) => {
    const [, , , id, action] = u.pathname.split("/");
    const row = withdrawals.find((w) => w.id === id)!;
    row.status = action === "settle" ? "completed" : "failed";
    return row;
  }],
  [/^\/admin\/skill-requests$/, "GET", (u) => skillRequests.filter((s) => !u.searchParams.get("status") || s.status === u.searchParams.get("status"))],
  [/^\/admin\/skill-requests\/[^/]+\/(approve|reject)$/, "POST", (u) => {
    const [, , , id, action] = u.pathname.split("/");
    const row = skillRequests.find((r) => r.id === id)!;
    row.status = action === "approve" ? "approved" : "rejected";
    return {};
  }],
  [/^\/admin\/jobs\/[^/]+\/conversation$/, "GET", () => ({ messages: conversation })],
];

export function installMockApi() {
  if (typeof window === "undefined" || (window as { __mockApi?: boolean }).__mockApi) return;
  (window as { __mockApi?: boolean }).__mockApi = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    // Only while on the preview route: a client-side hop to a real /admin/*
    // page in the same tab must reach the real API, not this sample data.
    if (raw.startsWith(API_URL) && window.location.pathname.startsWith("/dev/admin-preview")) {
      const url = new URL(raw);
      const method = (init?.method ?? "GET").toUpperCase();
      const route = routes.find(([re, m]) => m === method && re.test(url.pathname));
      await new Promise((r) => setTimeout(r, 350));
      if (route) return new Response(JSON.stringify(route[2](url, init)), { status: 200, headers: { "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ message: "Not mocked in preview" }), { status: 503 });
    }
    return realFetch(input, init);
  };
}
