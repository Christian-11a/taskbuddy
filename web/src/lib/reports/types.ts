import type { BookingStatus } from "@/lib/domain";

/** One job, with the fields the reports page can read off the bookings list. */
export interface ReportBooking {
  id: string;
  postedAt: string;
  status: BookingStatus;
  /** 'open' while a complaint is open. Null when the list row did not say. */
  disputeState: "open" | "resolved" | null;
  categoryId: number | null;
  categoryName: string;
  clientName: string;
  providerId: string | null;
  providerName: string;
  /** Posted budget. The paid amount, when there is one, is on the escrow. */
  budget: number;
}

/** One escrow row. `to_jsonb(escrow)` already includes commission and the settlement timestamps. */
export interface ReportEscrow {
  id: string;
  jobId: string;
  amount: number;
  commission: number;
  status: "held" | "released" | "disputed" | "refunded" | "cancelled";
  heldAt: string;
  releasedAt: string | null;
  refundedAt: string | null;
  categoryName: string;
  clientName: string;
  providerId: string | null;
  providerName: string;
}

export interface ReportProviderOption {
  id: string;
  name: string;
}

export type ReportTab = "platform" | "provider";
export type RangePreset = "this" | "3" | "6" | "12" | "custom";
export type ReportStatus = "all" | "completed" | "cancelled" | "disputed";

/** What the URL stores. `from`/`to` are the custom pair; presets recompute the period. */
export interface ReportQuery {
  tab: ReportTab;
  preset: RangePreset;
  from: string;
  to: string;
  status: ReportStatus;
  /** "all" or a category id. */
  category: string;
  providerId: string;
}

export interface ReportPeriod {
  from: string;
  to: string;
}
