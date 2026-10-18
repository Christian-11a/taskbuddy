import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BookingsPage } from "./BookingsPage";
import { ToastProvider } from "@/components/ui/Toast";
import { useApp } from "@/context/AppContext";
import * as services from "@/lib/services";
import { ApiError } from "@/lib/api/client";
import type { AdminBookingDetail } from "@/lib/domain";

vi.mock("@/context/AppContext", () => ({
  useApp: vi.fn(),
}));

vi.mock("@/lib/services", () => ({
  searchBookings: vi.fn(),
  getBookingDetail: vi.fn(),
}));

const mockedUseApp = vi.mocked(useApp);
const mockedSearchBookings = vi.mocked(services.searchBookings);
const mockedGetBookingDetail = vi.mocked(services.getBookingDetail);

function renderBookings() {
  return render(
    <ToastProvider>
      <BookingsPage />
    </ToastProvider>,
  );
}

function counts(overrides: Record<string, number> = {}) {
  return {
    open: 0,
    recommending: 0,
    assigned: 0,
    confirmed: 0,
    in_progress: 0,
    completed: 0,
    cancelled: 0,
    expired: 0,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("BookingsPage status counts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseApp.mockReturnValue({
      cancelBooking: vi.fn(),
      refreshCounts: vi.fn().mockResolvedValue(undefined),
      lastUpdated: null,
    } as unknown as ReturnType<typeof useApp>);
  });

  it("shows status counts from the current searched booking response", async () => {
    mockedSearchBookings.mockImplementation(async ({ search }) => ({
      items: [],
      total: search ? 3 : 12,
      statusCounts: search ? counts({ open: 2, completed: 1 }) : counts({ open: 8, completed: 4 }),
    }));
    const user = userEvent.setup();
    renderBookings();

    expect(await screen.findByRole("option", { name: "All statuses (12)" })).toBeInTheDocument();
    await user.type(screen.getByRole("searchbox", { name: "Search bookings" }), "Ava");

    expect(await screen.findByRole("option", { name: "All statuses (3)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Open (2)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Completed (1)" })).toBeInTheDocument();
    expect(mockedSearchBookings).toHaveBeenLastCalledWith({ search: "Ava", status: undefined, page: 1, pageSize: 12 });
  });

  it("does not keep showing previous-query status counts while a new search is debouncing", async () => {
    mockedSearchBookings.mockResolvedValue({ items: [], total: 12, statusCounts: counts({ open: 8, completed: 4 }) });
    const user = userEvent.setup();
    renderBookings();

    expect(await screen.findByRole("option", { name: "All statuses (12)" })).toBeInTheDocument();
    await user.type(screen.getByRole("searchbox", { name: "Search bookings" }), "Ava");

    expect(screen.queryByRole("option", { name: "All statuses (12)" })).not.toBeInTheDocument();
  });

  it("ignores an older search response that resolves after the latest response", async () => {
    type SearchResult = Awaited<ReturnType<typeof services.searchBookings>>;
    const stale = deferred<SearchResult>();
    const current = deferred<SearchResult>();
    mockedSearchBookings.mockReturnValueOnce(stale.promise).mockReturnValueOnce(current.promise);
    const user = userEvent.setup();
    renderBookings();

    await user.type(screen.getByRole("searchbox", { name: "Search bookings" }), "current");
    await waitFor(() => expect(mockedSearchBookings).toHaveBeenCalledTimes(2));

    await act(async () => {
      current.resolve({ items: [], total: 1, statusCounts: counts({ open: 1 }) });
    });
    expect(await screen.findByRole("option", { name: "All statuses (1)" })).toBeInTheDocument();

    await act(async () => {
      stale.resolve({ items: [], total: 90, statusCounts: counts({ open: 89, completed: 1 }) });
    });
    expect(screen.getByRole("option", { name: "All statuses (1)" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "All statuses (90)" })).not.toBeInTheDocument();
  });
});

describe("BookingsPage payment line", () => {
  const booking = {
    id: "b-1234567890",
    customerName: "Ava Cruz",
    providerName: "Rico Lim",
    service: "Aircon cleaning",
    status: "completed" as const,
    scheduledDate: "2026-10-10T08:00:00Z",
    amount: 1200,
  };

  function bookingDetail(overrides: Partial<AdminBookingDetail> = {}): AdminBookingDetail {
    return {
      description: "Clean two units",
      address: "Quezon City",
      scheduledAt: null,
      photoUrls: [],
      escrowStatus: "IN_ESCROW",
      escrowAmount: 1200,
      completedAt: "2026-10-15T02:00:00Z",
      status: "completed",
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
    mockedUseApp.mockReturnValue({
      cancelBooking: vi.fn(),
      lastUpdated: null,
    } as unknown as ReturnType<typeof useApp>);
    mockedSearchBookings.mockResolvedValue({ items: [booking], total: 1, statusCounts: counts({ completed: 1 }) });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a completed job's payment as released once escrow is released", async () => {
    mockedGetBookingDetail.mockResolvedValue(bookingDetail({ escrowStatus: "COMPLETED" }));
    const user = userEvent.setup();
    renderBookings();

    await user.click(await screen.findByText("Ava Cruz"));

    expect(await screen.findByText("Released")).toBeInTheDocument();
    expect(screen.queryByText("Held")).not.toBeInTheDocument();
    expect(mockedGetBookingDetail).toHaveBeenCalledWith("b-1234567890");
  });

  it("shows a completed job's payment as held while its complaint is open", async () => {
    mockedSearchBookings.mockResolvedValue({ items: [{ ...booking, displayStatus: "disputed" }], total: 1, statusCounts: counts({ completed: 1 }) });
    mockedGetBookingDetail.mockResolvedValue(bookingDetail({ escrowStatus: "DISPUTED", displayStatus: "disputed" }));
    const user = userEvent.setup();
    renderBookings();

    await user.click(await screen.findByText("Ava Cruz"));

    expect(await screen.findByText("Held while the complaint is open")).toBeInTheDocument();
    expect(screen.queryByText("Released")).not.toBeInTheDocument();
  });

  it("shows a completed job's held payment as release in progress when no complaint is open", async () => {
    mockedGetBookingDetail.mockResolvedValue(bookingDetail({ escrowStatus: "IN_ESCROW", displayStatus: "completed" }));
    const user = userEvent.setup();
    renderBookings();

    await user.click(await screen.findByText("Ava Cruz"));

    expect(await screen.findByText("Held")).toBeInTheDocument();
    expect(screen.getByText("Release in progress")).toBeInTheDocument();
    expect(screen.queryByText("Held while the complaint is open")).not.toBeInTheDocument();
  });

  it("shows a completed job whose escrow is DISPUTED without an open complaint as release in progress", async () => {
    mockedGetBookingDetail.mockResolvedValue(bookingDetail({ escrowStatus: "DISPUTED", displayStatus: "completed" }));
    const user = userEvent.setup();
    renderBookings();

    await user.click(await screen.findByText("Ava Cruz"));

    expect(await screen.findByText("Release in progress")).toBeInTheDocument();
    expect(screen.queryByText("Held while the complaint is open")).not.toBeInTheDocument();
  });

  it("shows no payment line for a booking that is not completed", async () => {
    mockedSearchBookings.mockResolvedValue({
      items: [{ ...booking, status: "in_progress" }],
      total: 1,
      statusCounts: counts({ in_progress: 1 }),
    });
    mockedGetBookingDetail.mockResolvedValue(bookingDetail({ status: "in_progress", completedAt: null, escrowStatus: "IN_ESCROW" }));
    const user = userEvent.setup();
    renderBookings();

    await user.click(await screen.findByText("Ava Cruz"));

    expect(await screen.findByText("Clean two units")).toBeInTheDocument();
    expect(screen.queryByText("Released")).not.toBeInTheDocument();
    expect(screen.queryByText("Held")).not.toBeInTheDocument();
  });
});

describe("BookingsPage disputed status", () => {
  const booking = {
    id: "b-1234567890",
    customerName: "Ava Cruz",
    providerName: "Rico Lim",
    service: "Aircon cleaning",
    status: "in_progress" as const,
    scheduledDate: "2026-10-10T08:00:00Z",
    amount: 1200,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseApp.mockReturnValue({
      cancelBooking: vi.fn(),
      refreshCounts: vi.fn().mockResolvedValue(undefined),
      lastUpdated: null,
    } as unknown as ReturnType<typeof useApp>);
  });

  it("shows a Disputed badge in place of the status while the complaint is open", async () => {
    mockedSearchBookings.mockResolvedValue({
      items: [{ ...booking, displayStatus: "disputed" }],
      total: 1,
      statusCounts: counts({ in_progress: 1 }),
    });
    renderBookings();

    expect(await screen.findByText("Ava Cruz")).toBeInTheDocument();
    const table = within(screen.getByRole("region", { name: "Bookings table" }));
    expect(table.getByText("Disputed")).toBeInTheDocument();
    expect(table.queryByText("In Progress")).not.toBeInTheDocument();
  });

  it("keeps the real status badge when no complaint is open", async () => {
    mockedSearchBookings.mockResolvedValue({
      items: [{ ...booking, displayStatus: "in_progress" }],
      total: 1,
      statusCounts: counts({ in_progress: 1 }),
    });
    renderBookings();

    const table = within(await screen.findByRole("region", { name: "Bookings table" }));
    expect(await table.findByText("In Progress")).toBeInTheDocument();
    expect(table.queryByText("Disputed")).not.toBeInTheDocument();
  });

  it("filters on status=disputed and counts the selected Disputed option with the list total", async () => {
    mockedSearchBookings.mockResolvedValue({ items: [], total: 0, statusCounts: counts({ completed: 2 }) });
    const user = userEvent.setup();
    renderBookings();
    await screen.findByRole("option", { name: "Disputed" });

    mockedSearchBookings.mockResolvedValue({ items: [{ ...booking, displayStatus: "disputed" }], total: 1, statusCounts: counts({ completed: 2 }) });
    await user.selectOptions(screen.getByRole("combobox", { name: "Filter bookings by status" }), "Disputed");

    expect(mockedSearchBookings).toHaveBeenLastCalledWith({ search: "", status: "disputed", page: 1, pageSize: 12 });
    expect(await screen.findByRole("option", { name: "Disputed (1)" })).toBeInTheDocument();
  });
});

describe("BookingsPage load failures", () => {
  const booking = {
    id: "b-1234567890",
    customerName: "Ava Cruz",
    providerName: "Rico Lim",
    service: "Aircon cleaning",
    status: "open" as const,
    scheduledDate: "2026-10-10T08:00:00Z",
    amount: 1200,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockedSearchBookings.mockReset();
    mockedUseApp.mockReturnValue({
      cancelBooking: vi.fn(),
      refreshCounts: vi.fn().mockResolvedValue(undefined),
      lastUpdated: null,
    } as unknown as ReturnType<typeof useApp>);
  });

  it("shows an error state, not 'No bookings yet.', when the first load fails", async () => {
    mockedSearchBookings.mockRejectedValue(new Error("down"));
    renderBookings();

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load bookings.");
    expect(screen.queryByText("No bookings yet.")).not.toBeInTheDocument();
  });

  it("keeps the last good rows and offers Retry when a refresh fails", async () => {
    mockedSearchBookings.mockResolvedValueOnce({ items: [booking], total: 1, statusCounts: counts({ open: 1 }) });
    const user = userEvent.setup();
    renderBookings();
    expect(await screen.findByText("Ava Cruz")).toBeInTheDocument();

    mockedSearchBookings.mockRejectedValueOnce(new Error("down"));
    await user.selectOptions(screen.getByRole("combobox", { name: "Filter bookings by status" }), "Open");

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't refresh bookings.");
    expect(screen.getByText("Ava Cruz")).toBeInTheDocument();
    expect(screen.queryByText("No bookings match this search or filter.")).not.toBeInTheDocument();

    mockedSearchBookings.mockResolvedValueOnce({ items: [booking], total: 1, statusCounts: counts({ open: 1 }) });
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(mockedSearchBookings).toHaveBeenLastCalledWith({ search: "", status: "open", page: 1, pageSize: 12 });
  });
});

describe("BookingsPage cancel confirmation", () => {
  it("says what happens to held payment before a booking is cancelled", async () => {
    mockedUseApp.mockReturnValue({
      cancelBooking: vi.fn(),
      refreshCounts: vi.fn().mockResolvedValue(undefined),
      lastUpdated: null,
    } as unknown as ReturnType<typeof useApp>);
    mockedSearchBookings.mockResolvedValue({
      items: [{ id: "b-1234567890", customerName: "Ava Cruz", providerName: "Rico Lim", service: "Aircon cleaning", status: "open", scheduledDate: "2026-10-10T08:00:00Z", amount: 1200 }],
      total: 1,
      statusCounts: counts({ open: 1 }),
    });
    const user = userEvent.setup();
    renderBookings();

    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(await screen.findByText(/not refunded automatically/)).toBeInTheDocument();
    expect(screen.getByText(/frozen in a cancellation review/)).toBeInTheDocument();
    expect(screen.getByText(/A booking with no payment is simply closed/)).toBeInTheDocument();
  });
});

describe("BookingsPage search input", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseApp.mockReturnValue({
      cancelBooking: vi.fn(),
      refreshCounts: vi.fn().mockResolvedValue(undefined),
      lastUpdated: null,
    } as unknown as ReturnType<typeof useApp>);
    mockedSearchBookings.mockResolvedValue({ items: [], total: 0, statusCounts: counts() });
  });

  it("caps the search box at 100 characters and shows the API's 400 message under it", async () => {
    const user = userEvent.setup();
    renderBookings();
    const search = await screen.findByLabelText("Search bookings");
    expect(search).toHaveAttribute("maxLength", "100");

    mockedSearchBookings.mockRejectedValueOnce(new ApiError(400, "Search is too long."));
    await user.type(search, "x");

    expect(await screen.findByText("Search is too long.")).toHaveAttribute("role", "alert");
    expect(search).toHaveAccessibleDescription("Search is too long.");
    expect(screen.queryByText(/may be stale/)).not.toBeInTheDocument();
  });
});
