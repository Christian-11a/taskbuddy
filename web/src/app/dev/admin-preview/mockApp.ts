// Sample data for the dev-only Admin Console preview (/dev/admin-preview).
// Shapes match AppContext's display rows; names and amounts are illustrative.
import type { AppState } from "@/context/AppContext";
import type { DisputeRow, UserRow, VerificationRow } from "@/lib/adapters";

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
] as VerificationRow[];

const disputes: DisputeRow[] = [
  { id: "d1", jobId: "j1042", jobTitle: "Fix leaking kitchen sink", service: "Plumbing", clientName: "Ana Reyes", providerName: "Rico Bautista", amount: "₱1,450.00", reason: "Work not completed", details: "The leak came back the same evening and the provider stopped replying.", status: "Open", statusClass: "badge-pending", resolution: null, resolutionNote: null, createdAt: "Sep 26, 2026", resolvedAt: null, isOpen: true },
  { id: "d2", jobId: "j0988", jobTitle: "Deep clean 2BR condo", service: "Cleaning", clientName: "Jessa Ramos", providerName: "Liza Mercado", amount: "₱2,000.00", reason: "Quality issue", details: "Bathroom was skipped.", status: "Resolved", statusClass: "badge-completed", resolution: "Partial refund", resolutionNote: "Provider agreed to a 50% refund.", createdAt: "Sep 12, 2026", resolvedAt: "Sep 14, 2026", isOpen: false },
];

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
  refreshUsers: asyncNoop,
  lastUpdated: Date.now() - 8000,
  refreshing: false,
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
    emailAlerts: true, disputeNotify: true, dailySummary: false, newUserNotify: false, activityBadge: true,
    autoPurge: false, anonymizeExports: true, auditLog: true, platformName: "TaskBuddy", supportEmail: "support@example.com",
  },
  updateSettings: noop,
  maintenanceMode: false,
  maintenanceMessage: null,
  setMaintenanceMode: async () => true,
};
