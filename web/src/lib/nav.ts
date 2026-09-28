import {
  AlertTriangle, BarChart3, CalendarDays, CreditCard, History, LayoutDashboard, ScrollText,
  Settings, ShieldCheck, SlidersHorizontal, Users, WalletCards, Wrench,
  type LucideIcon,
} from "lucide-react";
import type { Page } from "@/lib/domain";

export type NavGroupId = "overview" | "operations" | "records" | "system";

export interface NavItem {
  id: Page;
  label: string;
  group: NavGroupId;
  icon: LucideIcon;
  /** One line, shown under the page title and in the command palette. */
  description: string;
  /** Extra words the command palette should match. */
  keywords?: string[];
}

/** Same grouping as the previous sidebar; Overview has no visible heading. */
export const NAV_GROUPS: { id: NavGroupId; label: string | null }[] = [
  { id: "overview", label: null },
  { id: "operations", label: "Operations" },
  { id: "records", label: "Records" },
  { id: "system", label: "System" },
];

/**
 * The single source for every admin destination: the sidebar, the header's
 * title and breadcrumb, and the command palette all read from here, so a
 * page can never be reachable from one and missing from another.
 */
export const ADMIN_NAV: NavItem[] = [
  { id: "dashboard", label: "Dashboard", group: "overview", icon: LayoutDashboard, description: "Today at TaskBuddy", keywords: ["overview", "home"] },
  { id: "verifications", label: "Verifications", group: "operations", icon: ShieldCheck, description: "Review provider IDs and face scans", keywords: ["kyc", "id", "approve"] },
  { id: "bookings", label: "Bookings", group: "operations", icon: CalendarDays, description: "Every service booking on the platform", keywords: ["jobs"] },
  { id: "disputes", label: "Disputes", group: "operations", icon: AlertTriangle, description: "Resolve payment disputes", keywords: ["escrow", "complaint"] },
  { id: "transactions", label: "Transactions", group: "operations", icon: CreditCard, description: "Escrow payments and wallet activity", keywords: ["payments", "escrow", "wallet", "credit"] },
  { id: "withdrawals", label: "Withdrawals", group: "operations", icon: WalletCards, description: "Pay out provider withdrawal requests", keywords: ["payout", "gcash", "bank"] },
  { id: "skill-requests", label: "Service Requests", group: "operations", icon: Wrench, description: "Approve providers' new service categories", keywords: ["skills", "category"] },
  { id: "users", label: "Users", group: "operations", icon: Users, description: "Client and provider accounts", keywords: ["suspend", "accounts", "providers", "clients", "homeowners"] },
  { id: "activity-log", label: "Activity", group: "records", icon: History, description: "Marketplace activity by job", keywords: ["log", "events"] },
  { id: "audit-log", label: "Audit Log", group: "records", icon: ScrollText, description: "Every admin action, recorded", keywords: ["audit", "history"] },
  { id: "reports", label: "Reports", group: "records", icon: BarChart3, description: "Platform performance and analytics", keywords: ["analytics", "revenue", "charts"] },
  { id: "platform", label: "Platform", group: "system", icon: SlidersHorizontal, description: "Commission, categories, admins, announcements", keywords: ["commission", "broadcast", "admins"] },
  { id: "settings", label: "Settings", group: "system", icon: Settings, description: "Your account and console preferences", keywords: ["password", "preferences", "maintenance"] },
];

const BY_ID = new Map(ADMIN_NAV.map((item) => [item.id, item]));

export function pageMeta(page: Page): NavItem {
  const item = BY_ID.get(page);
  if (!item) throw new Error(`Unknown admin page: ${page}`);
  return item;
}
