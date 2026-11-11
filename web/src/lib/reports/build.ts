import { inRange, monthsInRange } from "./query";
import type { ReportBooking, ReportEscrow, ReportProviderOption, ReportStatus } from "./types";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface ReportFilters {
  from: string;
  to: string;
  status: ReportStatus;
  categoryId: number | null;
  categoryName: string | null;
  providerId: string | null;
}

export interface MoneyTotals {
  grossReleased: number;
  commission: number;
  providerPayouts: number;
  refunds: number;
}

export interface BreakdownRow extends MoneyTotals {
  label: string;
  bookings: number;
}

export interface PlatformReport {
  bookings: number;
  completed: number;
  cancelled: number;
  disputed: number;
  money: MoneyTotals;
  byCategory: BreakdownRow[];
  byMonth: BreakdownRow[];
}

export interface ProviderJobRow {
  id: string;
  date: string;
  client: string;
  service: string;
  amount: number;
  fee: number;
  status: string;
}

export interface ProviderReport {
  providerName: string;
  jobs: number;
  completed: number;
  cancelled: number;
  disputed: number;
  grossEarned: number;
  platformFee: number;
  netReceived: number;
  /**
   * Always null. The users list only has a lifetime cached rating, and no
   * review list is loaded, so a rating for this period cannot be computed.
   */
  averageRating: null;
  jobRows: ProviderJobRow[];
  byMonth: BreakdownRow[];
}

export const RATING_UNAVAILABLE = "Not available";

export function matchesStatus(booking: ReportBooking, status: ReportStatus): boolean {
  if (status === "all") return true;
  if (status === "disputed") return booking.disputeState === "open";
  if (status === "cancelled") return booking.status === "cancelled";
  return booking.status === "completed" && booking.disputeState !== "open";
}

function matchesCategory(booking: ReportBooking, filters: ReportFilters): boolean {
  if (filters.categoryId == null) return true;
  if (booking.categoryId != null) return booking.categoryId === filters.categoryId;
  return filters.categoryName != null && booking.categoryName === filters.categoryName;
}

function scopedBookings(bookings: readonly ReportBooking[], filters: ReportFilters): ReportBooking[] {
  return bookings.filter((booking) => {
    if (!matchesStatus(booking, filters.status)) return false;
    if (!matchesCategory(booking, filters)) return false;
    if (filters.providerId && booking.providerId !== filters.providerId) return false;
    return true;
  });
}

function isRefund(status: ReportEscrow["status"]): boolean {
  return status === "refunded" || status === "cancelled";
}

function emptyMoney(): MoneyTotals {
  return { grossReleased: 0, commission: 0, providerPayouts: 0, refunds: 0 };
}

function addMoney(row: MoneyTotals, escrow: ReportEscrow, from: string, to: string): void {
  if (escrow.status === "released" && inRange(escrow.releasedAt || escrow.heldAt, from, to)) {
    const commission = round2(escrow.commission);
    const gross = round2(escrow.amount);
    row.grossReleased = round2(row.grossReleased + gross);
    row.commission = round2(row.commission + commission);
    row.providerPayouts = round2(row.providerPayouts + Math.max(0, round2(gross - commission)));
  }
  if (isRefund(escrow.status) && inRange(escrow.refundedAt || escrow.heldAt, from, to)) {
    row.refunds = round2(row.refunds + round2(escrow.amount));
  }
}

function escrowForJob(escrows: readonly ReportEscrow[], jobId: string): ReportEscrow | undefined {
  const rows = escrows.filter((escrow) => escrow.jobId === jobId);
  return rows.find((escrow) => escrow.status === "released") ?? rows[0];
}

export function jobStatusLabel(booking: ReportBooking): string {
  if (booking.disputeState === "open") return "Disputed";
  return booking.status.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** The month a settlement belongs to, or null when this escrow adds nothing in the period. */
function settlementMonth(escrow: ReportEscrow, from: string, to: string): string | null {
  if (escrow.status === "released" && inRange(escrow.releasedAt || escrow.heldAt, from, to)) {
    return (escrow.releasedAt || escrow.heldAt).slice(0, 7);
  }
  if (isRefund(escrow.status) && inRange(escrow.refundedAt || escrow.heldAt, from, to)) {
    return (escrow.refundedAt || escrow.heldAt).slice(0, 7);
  }
  return null;
}

function breakdown(
  periodBookings: readonly ReportBooking[],
  escrows: readonly ReportEscrow[],
  from: string,
  to: string,
  keyOfBooking: (booking: ReportBooking) => string,
  keyOfEscrow: (escrow: ReportEscrow) => string | null,
  labels: readonly string[],
): BreakdownRow[] {
  const rows = new Map<string, BreakdownRow>();
  const ensure = (label: string) => {
    const existing = rows.get(label);
    if (existing) return existing;
    const created: BreakdownRow = { label, bookings: 0, ...emptyMoney() };
    rows.set(label, created);
    return created;
  };
  for (const label of labels) ensure(label);
  for (const booking of periodBookings) {
    const row = ensure(keyOfBooking(booking));
    row.bookings += 1;
  }
  for (const escrow of escrows) {
    const key = keyOfEscrow(escrow);
    if (!key) continue;
    addMoney(ensure(key), escrow, from, to);
  }
  return [...rows.values()];
}

function counts(bookings: readonly ReportBooking[]) {
  return {
    bookings: bookings.length,
    completed: bookings.filter((booking) => booking.status === "completed").length,
    cancelled: bookings.filter((booking) => booking.status === "cancelled").length,
    disputed: bookings.filter((booking) => booking.disputeState === "open").length,
  };
}

interface Prepared {
  periodBookings: ReportBooking[];
  escrows: ReportEscrow[];
  money: MoneyTotals;
}

function prepare(bookings: readonly ReportBooking[], escrows: readonly ReportEscrow[], filters: ReportFilters): Prepared {
  const scoped = scopedBookings(bookings, filters);
  const ids = new Set(scoped.map((booking) => booking.id));
  const periodBookings = scoped
    .filter((booking) => inRange(booking.postedAt, filters.from, filters.to))
    .sort((a, b) => b.postedAt.localeCompare(a.postedAt) || a.id.localeCompare(b.id));
  const matched = escrows.filter((escrow) => ids.has(escrow.jobId) && (!filters.providerId || escrow.providerId === filters.providerId));
  const money = emptyMoney();
  for (const escrow of matched) addMoney(money, escrow, filters.from, filters.to);
  return { periodBookings, escrows: matched, money };
}

export function buildPlatformReport(
  bookings: readonly ReportBooking[],
  escrows: readonly ReportEscrow[],
  filters: ReportFilters,
): PlatformReport {
  const { periodBookings, escrows: matched, money } = prepare(bookings, escrows, { ...filters, providerId: null });
  const categoryLabels = [...new Set(periodBookings.map((booking) => booking.categoryName))].sort((a, b) => a.localeCompare(b));
  return {
    ...counts(periodBookings),
    money,
    byCategory: breakdown(
      periodBookings,
      matched,
      filters.from,
      filters.to,
      (booking) => booking.categoryName,
      (escrow) => (settlementMonth(escrow, filters.from, filters.to) ? escrow.categoryName : null),
      categoryLabels,
    ).sort((a, b) => b.bookings - a.bookings || a.label.localeCompare(b.label)),
    byMonth: breakdown(
      periodBookings,
      matched,
      filters.from,
      filters.to,
      (booking) => booking.postedAt.slice(0, 7),
      (escrow) => settlementMonth(escrow, filters.from, filters.to),
      monthsInRange(filters.from, filters.to),
    ),
  };
}

export function buildProviderReport(
  bookings: readonly ReportBooking[],
  escrows: readonly ReportEscrow[],
  filters: ReportFilters,
  provider: ReportProviderOption | null,
): ProviderReport {
  if (!filters.providerId) {
    return {
      providerName: "",
      jobs: 0,
      completed: 0,
      cancelled: 0,
      disputed: 0,
      grossEarned: 0,
      platformFee: 0,
      netReceived: 0,
      averageRating: null,
      jobRows: [],
      byMonth: monthsInRange(filters.from, filters.to).map((label) => ({
        label,
        bookings: 0,
        grossReleased: 0,
        commission: 0,
        providerPayouts: 0,
        refunds: 0,
      })),
    };
  }
  const prepared = prepare(bookings, escrows, filters);
  const { periodBookings, money } = prepared;
  const byMonth = breakdown(
    periodBookings,
    prepared.escrows,
    filters.from,
    filters.to,
    (booking) => booking.postedAt.slice(0, 7),
    (escrow) => settlementMonth(escrow, filters.from, filters.to),
    monthsInRange(filters.from, filters.to),
  );
  const counted = counts(periodBookings);
  return {
    providerName: provider?.name ?? "",
    jobs: counted.bookings,
    completed: counted.completed,
    cancelled: counted.cancelled,
    disputed: counted.disputed,
    grossEarned: money.grossReleased,
    platformFee: money.commission,
    netReceived: money.providerPayouts,
    averageRating: null,
    jobRows: periodBookings.map((booking) => {
      const escrow = escrowForJob(escrows, booking.id);
      return {
        id: booking.id,
        date: booking.postedAt,
        client: booking.clientName,
        service: booking.categoryName,
        amount: round2(escrow ? escrow.amount : booking.budget),
        fee: round2(escrow ? escrow.commission : 0),
        status: jobStatusLabel(booking),
      };
    }),
    byMonth,
  };
}
