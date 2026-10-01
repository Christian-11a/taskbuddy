import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BookingsPage } from "./BookingsPage";
import { ToastProvider } from "@/components/ui/Toast";
import { useApp } from "@/context/AppContext";
import * as services from "@/lib/services";

vi.mock("@/context/AppContext", () => ({
  useApp: vi.fn(),
}));

vi.mock("@/lib/services", () => ({
  searchBookings: vi.fn(),
  getBookingDetail: vi.fn(),
}));

const mockedUseApp = vi.mocked(useApp);
const mockedSearchBookings = vi.mocked(services.searchBookings);

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
