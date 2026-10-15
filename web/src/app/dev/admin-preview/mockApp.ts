// Sample data for the dev-only Admin Console preview (/dev/admin-preview).
// Shapes match AppContext's display rows; names and amounts are illustrative.
import type { AppState } from "@/context/AppContext";
import type { DisputeRow, UserRow, VerificationRow } from "@/lib/adapters";
import type { CaseEntry } from "@/lib/domain";
import { arrivalTitle, type InboxEntry } from "@/lib/inbox";
import { SAMPLE_CASE_PARTIES } from "./mockApi";

const noop = () => {};
const asyncNoop = async () => {};

const months = ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"];
const revenue = [18200, 21400, 26800, 24100, 29900, 33600, 31800, 38400, 42600, 47100, 52300, 58900];
const bookingsPerMonth = [22, 27, 33, 30, 36, 41, 39, 46, 52, 57, 63, 71];

function user(i: number, name: string, email: string, provider: boolean, status: "Active" | "Suspended" | "Pending", city: string, category: string, jobs: number, rating: number | null, createdAt: string): UserRow {
  const initials = name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  return {
    id: `u${i}`, initials, name, email,
    role: provider ? "Provider" : "Client", rolePlain: provider ? "Provider" : "Client", isProvider: provider,
    status, statusClass: status === "Active" ? "badge-completed" : status === "Suspended" ? "badge-cancelled" : "badge-pending",
    joined: new Date(createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    createdAt, activity: jobs > 0 ? `${jobs} jobs` : "No jobs yet",
    phone: "+63 917 555 01" + String(10 + i).slice(-2), city, category: provider ? category : "—",
    jobsCompleted: jobs, rating: rating ? `${rating.toFixed(1)} rating` : "Not yet rated", ratingValue: rating,
    verification: !provider ? "Not submitted" : status === "Pending" ? "Pending review" : "Verified", verificationClass: "",
    suspendedUntil: "—", suspensionReason: status === "Suspended" ? "Repeated no-shows" : "—",
  } as UserRow;
}

const users: UserRow[] = [
  user(1, "Ana Reyes", "ana.reyes@example.com", false, "Active", "Lipa City", "", 6, null, "2026-09-03T08:00:00Z"),
  user(2, "Mark Santos", "mark.santos@example.com", true, "Active", "Lipa City", "Plumbing", 39, 4.9, "2026-02-11T08:00:00Z"),
  user(3, "Juan Dela Cruz", "juan.dc@example.com", true, "Active", "Lipa City", "Handyman", 21, 4.6, "2026-03-19T08:00:00Z"),
  user(4, "Rico Bautista", "rico.b@example.com", true, "Suspended", "Lipa City", "Plumbing", 27, 4.1, "2026-04-02T08:00:00Z"),
  user(5, "Liza Mercado", "liza.m@example.com", true, "Pending", "Lipa City", "Cleaning", 0, null, "2026-09-21T08:00:00Z"),
  user(6, "Carlo Villanueva", "carlo.v@example.com", false, "Active", "Lipa City", "", 3, null, "2026-09-14T08:00:00Z"),
  user(7, "Maria Garcia", "maria.g@example.com", true, "Active", "Lipa City", "Manicure", 33, 4.8, "2026-01-22T08:00:00Z"),
  user(8, "Jessa Ramos", "jessa.r@example.com", false, "Active", "Lipa City", "", 11, null, "2026-06-08T08:00:00Z"),
];

const verifications: VerificationRow[] = [
  { id: "v1", initials: "LM", name: "Liza Mercado", email: "liza.m@example.com", date: "Sep 21, 2026", status: "pending", documentType: "PhilSys (National ID)", documents: [{ label: "Government ID", url: "/promo/taskbuddy-mascot.webp" }, { label: "Selfie", url: "/promo/taskbuddy-mascot.webp" }] },
  { id: "v2", initials: "DT", name: "Daniel Torres", email: "daniel.t@example.com", date: "Sep 25, 2026", status: "pending", documentType: "Driver's License", documents: [{ label: "Government ID", url: "/promo/taskbuddy-mascot.webp" }] },
  { id: "v3", initials: "PN", name: "Paolo Navarro", email: "paolo.n@example.com", date: "Sep 27, 2026", status: "pending", documentType: "UMID", documents: [{ label: "Government ID", url: "/promo/taskbuddy-mascot.webp" }, { label: "Selfie", url: "/promo/taskbuddy-mascot.webp" }] },
  { id: "v4", initials: "MS", name: "Mark Santos", email: "mark.santos@example.com", date: "Feb 12, 2026", status: "approved", documentType: "PhilSys (National ID)", documents: [] },
  { id: "v5", initials: "CR", name: "Carmen Reyes", email: "carmen.r@example.com", date: "Oct 13, 2026", status: "pending", documentType: "Not specified", documents: [] },
] as VerificationRow[];

// Verification method per row: v5 is checked by Stripe Identity, so it has no uploaded documents.
for (const v of verifications) v.method = v.id === "v5" ? "stripe_identity" : "manual";

// Case times are relative to now, so deadlines look right whenever the preview is opened.
const HOUR = 3_600_000;
const hoursFromNow = (h: number) => new Date(Date.now() + h * HOUR).toISOString();
let entrySeq = 0;
function entry(kind: string, body: string, hoursAgo: number, author: { id: string; full_name: string; role: string } | null, extra: Partial<CaseEntry> = {}): CaseEntry {
  entrySeq += 1;
  return {
    id: `e${entrySeq}`, kind, body, created_at: hoursFromNow(-hoursAgo), author,
    message: null, attachment_url: null, ...extra,
  };
}
const CLIENT = { id: "u1", full_name: "Ana Reyes", role: "client" };
const PROVIDER = { id: "u2", full_name: "Mark Santos", role: "provider" };
const ADMIN = { id: "admin-1", full_name: "Ana Cruz", role: "admin" };

const disputes: DisputeRow[] = [
  { id: "d1", jobId: "j1042", jobTitle: "Fix leaking kitchen sink", service: "Plumbing", clientName: "Ana Reyes", providerName: "Rico Bautista", amount: "₱1,450.00", reason: "Work not completed", details: "The leak came back the same evening and the provider stopped replying.", status: "Open", statusClass: "badge-pending", resolution: null, resolutionNote: null, paymentSettled: false, createdAt: "Sep 26, 2026", resolvedAt: null, isOpen: true, cancellationState: null, cancellationDeadline: null },
  { id: "d2", jobId: "j0988", jobTitle: "Deep clean 2BR condo", service: "Cleaning", clientName: "Jessa Ramos", providerName: "Liza Mercado", amount: "₱2,000.00", reason: "Quality issue", details: "Bathroom was skipped.", status: "Resolved", statusClass: "badge-completed", resolution: "Partial refund", resolutionNote: "Provider agreed to a 50% refund.", paymentSettled: true, createdAt: "Sep 12, 2026", resolvedAt: "Sep 14, 2026", isOpen: false, cancellationState: null, cancellationDeadline: null },
  // (a) Open complaint with the client's statement; a photo is attached to it.
  {
    id: "d3", jobId: "j1057", jobTitle: "Aircon cleaning", service: "Cleaning", clientName: SAMPLE_CASE_PARTIES.clientName, providerName: SAMPLE_CASE_PARTIES.providerName, amount: "₱850.00",
    reason: "Quality issue", details: "The unit still smells after the cleaning.", status: "Open", statusClass: "badge-pending", resolution: null, resolutionNote: null,
    paymentSettled: false, createdAt: "Oct 14, 2026", resolvedAt: null, isOpen: true, cancellationState: null, cancellationDeadline: null, hasPayment: true,
    clientId: SAMPLE_CASE_PARTIES.clientId, providerId: SAMPLE_CASE_PARTIES.providerId,
    entries: [
      entry("statement", "The unit still smells after the cleaning. I sent a photo of the filter.", 5, { id: SAMPLE_CASE_PARTIES.clientId, full_name: SAMPLE_CASE_PARTIES.clientName, role: "client" }, { attachment_url: "/promo/taskbuddy-mascot.webp" }),
    ],
  },
  // (b) Open appeal: statement, then the admin's decision, then the provider's appeal.
  {
    id: "d4", jobId: "j1049", jobTitle: "Install ceiling fan", service: "Handyman", clientName: "Carlo Villanueva", providerName: "Juan Dela Cruz", amount: "₱1,200.00",
    reason: "Work not completed", details: "The fan wobbles and one screw is missing.", status: "Open", statusClass: "badge-pending", resolution: null, resolutionNote: null,
    paymentSettled: false, createdAt: "Oct 10, 2026", resolvedAt: null, isOpen: true, cancellationState: null, cancellationDeadline: null, hasPayment: true,
    entries: [
      entry("statement", "The fan wobbles and a screw is missing from the bracket.", 60, CLIENT),
      entry("resolution", "Partial refund of 30% for the missing parts.", 30, ADMIN),
      entry("appeal", "I returned the same day and tightened every screw. I would like this reviewed.", 4, PROVIDER),
    ],
  },
  // (c) Cancellation review, pending, deadline 5 hours ahead.
  {
    id: "d5", jobId: "j1061", jobTitle: "Water heater repair", service: "Plumbing", clientName: "Ana Reyes", providerName: "Rico Bautista", amount: "₱1,800.00",
    reason: "Late cancellation", details: null, status: "Open", statusClass: "badge-pending", resolution: null, resolutionNote: null,
    paymentSettled: false, createdAt: "Oct 14, 2026", resolvedAt: null, isOpen: true, cancellationState: "pending", cancellationDeadline: hoursFromNow(5), hasPayment: true,
    entries: [
      entry("cancellation_response", "I cancelled because a parts delivery did not arrive.", 2, PROVIDER),
    ],
  },
  // (d) Cancellation review, pending, deadline 3 hours in the past (overdue).
  {
    id: "d6", jobId: "j1063", jobTitle: "Move-out cleaning", service: "Cleaning", clientName: "Maria Garcia", providerName: "Liza Mercado", amount: "₱2,400.00",
    reason: "Late cancellation", details: null, status: "Open", statusClass: "badge-pending", resolution: null, resolutionNote: null,
    paymentSettled: false, createdAt: "Oct 13, 2026", resolvedAt: null, isOpen: true, cancellationState: "pending", cancellationDeadline: hoursFromNow(-3), hasPayment: true,
    entries: [],
  },
  // (e) Open complaint awaiting a party: the admin's last entry asks for clarification.
  {
    id: "d7", jobId: "j1066", jobTitle: "Deep clean 3BR house", service: "Cleaning", clientName: "Jessa Ramos", providerName: "Maria Garcia", amount: "₱3,100.00",
    reason: "Quality issue", details: "The kitchen tiles were not mopped.", status: "Open", statusClass: "badge-pending", resolution: null, resolutionNote: null,
    paymentSettled: false, createdAt: "Oct 12, 2026", resolvedAt: null, isOpen: true, cancellationState: null, cancellationDeadline: null, hasPayment: true,
    entries: [
      entry("statement", "The kitchen tiles were not mopped and the bins were not emptied.", 50, CLIENT),
      entry("clarification", "Could you share a photo of the kitchen floor and say what time the job ended?", 6, ADMIN),
    ],
  },
  // (f) Complaint without a payment (no escrow was ever held).
  {
    id: "d8", jobId: "j1070", jobTitle: "Pedicure at home", service: "Manicure", clientName: "Carlo Villanueva", providerName: "Maria Garcia", amount: "₱0.00",
    reason: "No-show", details: "The provider did not arrive and did not message.", status: "Open", statusClass: "badge-pending", resolution: null, resolutionNote: null,
    paymentSettled: false, createdAt: "Oct 14, 2026", resolvedAt: null, isOpen: true, cancellationState: null, cancellationDeadline: null, hasPayment: false,
    entries: [
      entry("statement", "I waited an hour and nobody came. The booking was never paid.", 8, CLIENT, {
        message: { id: "m1", body: "Are you still coming? I am at the gate.", attachment_path: null },
      }),
    ],
  },
  // (g) Resolved case with a decision and the payment released.
  {
    id: "d9", jobId: "j1019", jobTitle: "Garage door service", service: "Handyman", clientName: "Ana Reyes", providerName: "Juan Dela Cruz", amount: "₱950.00",
    reason: "Work not completed", details: "The door still gets stuck.", status: "Resolved", statusClass: "badge-completed", resolution: "Released to provider", resolutionNote: "Photos show the job was finished.", paymentSettled: true,
    createdAt: "Oct 3, 2026", resolvedAt: "Oct 5, 2026", isOpen: false, cancellationState: null, cancellationDeadline: null, hasPayment: true,
    entries: [
      entry("statement", "The door still gets stuck when it rains.", 300, CLIENT),
      entry("resolution", "Photos show the door was adjusted and tested on site. Payment released.", 240, ADMIN),
    ],
  },
  // (h) Open case with a cancellation state this build does not know.
  {
    id: "d10", jobId: "j1074", jobTitle: "Gutter cleaning", service: "Handyman", clientName: "Jessa Ramos", providerName: "Juan Dela Cruz", amount: "₱1,100.00",
    reason: "Late cancellation", details: null, status: "Open", statusClass: "badge-pending", resolution: null, resolutionNote: null,
    paymentSettled: false, createdAt: "Oct 14, 2026", resolvedAt: null, isOpen: true, cancellationState: "escalated", cancellationDeadline: hoursFromNow(2), hasPayment: true,
    entries: [],
  },
];

/** Sample notification-inbox entries: two unread, two already read. Times are relative to now. */
export function sampleInboxEntries(now: number = Date.now()): InboxEntry[] {
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  return [
    { id: "sample-v", queue: "verifications", title: arrivalTitle("verifications", 3), count: 3, createdAt: now - 4 * MIN, read: false },
    { id: "sample-w", queue: "withdrawals", title: arrivalTitle("withdrawals", 2), count: 2, createdAt: now - 25 * MIN, read: false },
    { id: "sample-d", queue: "disputes", title: arrivalTitle("disputes", 1), count: 1, createdAt: now - 3 * HOUR, read: true },
    { id: "sample-s", queue: "skill-requests", title: arrivalTitle("skill-requests", 1), count: 1, createdAt: now - 6 * HOUR, read: true },
  ];
}

export const MOCK_APP: AppState = {
  isLoggedIn: true,
  sessionRestored: true,
  adminProfile: { id: "admin-1", name: "Ana Cruz", email: "admin@example.com" },
  login: async () => ({ ok: false, reason: "credentials" }),
  logout: noop,
  updateDisplayName: async () => true,
  changePassword: async () => true,
  loading: false,
  loadError: null,
  retryLoad: noop,
  refreshData: asyncNoop,
  refreshCounts: asyncNoop,
  refreshUsers: asyncNoop,
  ensureUsers: noop,
  usersLoading: false,
  lastUpdated: Date.now() - 8000,
  refreshing: false,
  refreshFailed: false,
  analyticsUnavailable: false,
  analyticsInBrowser: false,
  verifications,
  users,
  transactions: [],
  disputes,
  bookings: [],
  dashboardStats: {
    totalUsers: 1284, activeProviders: 212, totalBookings: 517, pendingVerifications: 3,
    totalRevenue: 425000, monthlyRevenue: 58900, completionRate: 87, avgRating: 4.7,
    totalCommission: 42500, monthlyCommission: 5890, pendingWithdrawals: 2,
  },
  revenueSeries: months.map((month, i) => ({ month, value: revenue[i] })),
  bookingsSeries: months.map((month, i) => ({ month, value: bookingsPerMonth[i] })),
  bookingsByCategory: [
    { label: "Cleaning", value: 34 }, { label: "Plumbing", value: 26 }, { label: "Handyman", value: 21 },
    { label: "Manicure", value: 11 }, { label: "Pedicure", value: 8 },
  ],
  recentActivity: [
    { id: 1, time: "2m ago", text: "Mark Santos accepted a booking: Fix leaking kitchen sink", type: "tx" },
    { id: 2, time: "9m ago", text: "₱1,450.00 released to Maria Garcia", type: "tx" },
    { id: 3, time: "24m ago", text: "Carlo Villanueva joined as a client", type: "user" },
    { id: 4, time: "41m ago", text: "Dispute opened on job #1042", type: "alert" },
    { id: 5, time: "1h ago", text: "Liza Mercado submitted verification documents", type: "user" },
    { id: 6, time: "2h ago", text: "₱2,000.00 held in escrow for Deep clean 2BR condo", type: "tx" },
    { id: 7, time: "3h ago", text: "Juan Dela Cruz completed Install ceiling fan", type: "tx" },
  ],
  topProviders: [
    { name: "Mark Santos", jobs: 39, rating: 4.9 },
    { name: "Maria Garcia", jobs: 33, rating: 4.8 },
    { name: "Rico Bautista", jobs: 27, rating: 4.1 },
    { name: "Juan Dela Cruz", jobs: 21, rating: 4.6 },
    { name: "Liza Mercado", jobs: 12, rating: 4.5 },
  ],
  queueCounts: {
    verifications: verifications.filter((v) => v.status === "pending").length,
    disputes: disputes.filter((d) => d.isOpen).length,
    withdrawals: 2,
    "skill-requests": 2,
  },
  approveVerification: asyncNoop,
  rejectVerification: asyncNoop,
  setUserStatus: async () => ({}),
  bulkSetUserStatus: async (ids) => ({ succeeded: ids.length, failed: 0, errors: [] }),
  sendPasswordReset: async () => true,
  cancelBooking: asyncNoop,
  resolveDispute: asyncNoop,
  darkMode: false,
  setDarkMode: noop,
  sidebarCollapsed: false,
  setSidebarCollapsed: noop,
  settings: {
    activityBadge: true, arrivalAlerts: true, anonymizeExports: true, platformName: "TaskBuddy",
  },
  updateSettings: noop,
  maintenanceMode: false,
  maintenanceMessage: null,
  setMaintenanceMode: async () => true,
};
