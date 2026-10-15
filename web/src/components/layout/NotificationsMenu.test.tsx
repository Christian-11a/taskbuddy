import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { QueueCounts, QueueId } from "@/lib/attention";
import { arrivalTitle, INBOX_KEY, serializeInbox, type InboxEntry } from "@/lib/inbox";

const mockState = vi.hoisted(() => ({
  queueCounts: { verifications: 0, disputes: 0, withdrawals: 0, "skill-requests": 0 } as QueueCounts,
  lastUpdated: null as number | null,
  isLoggedIn: true,
}));

vi.mock("@/context/AppContext", () => ({
  useApp: () => mockState,
}));

import { NotificationsMenu } from "./NotificationsMenu";

beforeAll(() => {
  // Radix popovers measure with these; jsdom has neither.
  Element.prototype.scrollIntoView = vi.fn();
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
});

const NOW = Date.UTC(2026, 9, 15, 2, 0, 0);
let seq = 0;
/** A stored inbox entry. Entries made earlier are newer. */
function entry(queue: QueueId, count: number, over: Partial<InboxEntry> = {}): InboxEntry {
  seq += 1;
  return { id: `n${seq}`, queue, title: arrivalTitle(queue, count), count, createdAt: NOW - seq * 1000, read: false, ...over };
}

function seed(entries: InboxEntry[]) {
  localStorage.setItem(INBOX_KEY, serializeInbox(entries));
}

const bell = () => screen.getByRole("button", { name: /^Notifications/ });
async function openInbox() {
  await userEvent.click(bell());
}

beforeEach(() => {
  localStorage.clear();
  seq = 0;
  mockState.queueCounts = { verifications: 0, disputes: 0, withdrawals: 0, "skill-requests": 0 };
  mockState.lastUpdated = null;
  mockState.isLoggedIn = true;
});

describe("NotificationsMenu badge", () => {
  it("shows the unread count on the bell and announces it politely", () => {
    seed([entry("disputes", 1), entry("withdrawals", 2, { read: true })]);
    render(<NotificationsMenu />);
    expect(screen.getByRole("button", { name: "Notifications (1 unread)" })).toBeInTheDocument();
    expect(within(bell()).getByText("1")).toBeInTheDocument();
    expect(screen.getByText("1 unread notification")).toHaveAttribute("aria-live", "polite");
  });

  it("hides the badge when nothing is unread", () => {
    seed([entry("disputes", 1, { read: true })]);
    render(<NotificationsMenu />);
    expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
    expect(within(bell()).queryByText(/\d/)).not.toBeInTheDocument();
  });

  it("caps the badge at 99+", () => {
    seed(Array.from({ length: 100 }, (_, i) => entry("disputes", 1, { id: `u${i}`, createdAt: NOW - i * 1000 })));
    render(<NotificationsMenu />);
    expect(within(bell()).getByText("99+")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Notifications (100 unread)" })).toBeInTheDocument();
  });

  it("does not count read entries, though they stay listed", async () => {
    seed([entry("disputes", 1, { read: true })]);
    render(<NotificationsMenu />);
    await openInbox();
    expect(screen.getByText("1 new dispute")).toBeInTheDocument();
    expect(screen.queryByText(/Unread:/)).not.toBeInTheDocument();
  });
});

describe("NotificationsMenu inbox", () => {
  it("opens the queue and marks the entry read when it is clicked", async () => {
    seed([entry("verifications", 3)]);
    mockState.queueCounts = { verifications: 3, disputes: 0, withdrawals: 0, "skill-requests": 0 };
    render(<NotificationsMenu />);
    await openInbox();
    const link = screen.getByRole("link", { name: /3 new provider verifications/ });
    expect(link).toHaveAttribute("href", "/admin/verifications");
    // jsdom cannot navigate; without a Next router the link would fall back to a real navigation.
    const stopNavigation = (e: Event) => e.preventDefault();
    document.addEventListener("click", stopNavigation, { capture: true, once: true });
    await userEvent.click(link);
    expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
  });

  it("marks everything read from the header, and disables that when nothing is unread", async () => {
    seed([entry("disputes", 1), entry("withdrawals", 2)]);
    render(<NotificationsMenu />);
    await openInbox();
    expect(screen.getByRole("button", { name: "Mark all as read" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Mark all as read" }));
    expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark all as read" })).toBeDisabled();
  });

  it("deletes one entry with its trash button, and leaves the others", async () => {
    seed([entry("disputes", 1), entry("withdrawals", 2)]);
    render(<NotificationsMenu />);
    await openInbox();
    await userEvent.click(screen.getByRole("button", { name: "Delete notification: 1 new dispute" }));
    expect(screen.queryByText("1 new dispute")).not.toBeInTheDocument();
    expect(screen.getByText("2 new withdrawal requests")).toBeInTheDocument();
  });

  it("selects several entries and deletes them in one step", async () => {
    seed([entry("disputes", 1), entry("withdrawals", 2), entry("skill-requests", 1)]);
    render(<NotificationsMenu />);
    await openInbox();
    await userEvent.click(screen.getByRole("button", { name: "Select" }));
    expect(screen.getByRole("button", { name: "Delete selected" })).toBeDisabled();

    await userEvent.click(screen.getByRole("checkbox", { name: "1 new dispute" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "2 new withdrawal requests" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete selected (2)" }));

    expect(screen.queryByText("1 new dispute")).not.toBeInTheDocument();
    expect(screen.queryByText("2 new withdrawal requests")).not.toBeInTheDocument();
    expect(screen.getByText("1 new service request")).toBeInTheDocument();
  });

  it("keeps Delete all disabled, with a hint, until every entry is read", async () => {
    seed([entry("disputes", 1)]);
    render(<NotificationsMenu />);
    await openInbox();
    expect(screen.getByRole("button", { name: "Delete all" })).toBeDisabled();
    expect(screen.getByText("Mark every notification as read to clear the inbox.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Mark all as read" }));
    expect(screen.getByRole("button", { name: "Delete all" })).toBeEnabled();
    expect(screen.queryByText(/Mark every notification as read/)).not.toBeInTheDocument();
  });

  it("asks for confirmation before Delete all clears the inbox", async () => {
    seed([entry("disputes", 1, { read: true }), entry("withdrawals", 2, { read: true })]);
    mockState.queueCounts = { verifications: 0, disputes: 1, withdrawals: 2, "skill-requests": 0 };
    render(<NotificationsMenu />);
    await openInbox();
    await userEvent.click(screen.getByRole("button", { name: "Delete all" }));

    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText("Delete all notifications?")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Notifications" })).toHaveFocus();

    await openInbox();
    await userEvent.click(screen.getByRole("button", { name: "Delete all" }));
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete all" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    await openInbox();
    expect(screen.queryByRole("link", { name: /new dispute/ })).not.toBeInTheDocument();
  });

  it("clears an entry on its own once its queue has nothing left", async () => {
    seed([entry("verifications", 2)]);
    mockState.lastUpdated = 1;
    mockState.queueCounts = { verifications: 0, disputes: 0, withdrawals: 0, "skill-requests": 0 };
    render(<NotificationsMenu />);
    await openInbox();
    expect(screen.queryByText(/new provider verification/)).not.toBeInTheDocument();
    expect(screen.getByText("All caught up!")).toBeInTheDocument();
  });

  it("keeps an entry while its queue count is unknown", async () => {
    seed([entry("withdrawals", 1)]);
    mockState.lastUpdated = 1;
    mockState.queueCounts = { verifications: 0, disputes: 0, withdrawals: null, "skill-requests": 0 };
    render(<NotificationsMenu />);
    await openInbox();
    expect(screen.getByText("1 new withdrawal request")).toBeInTheDocument();
  });
});

describe("NotificationsMenu pending work", () => {
  it("shows the same numbers as the sidebar: a count, 100+ for long lists, and unknown when a queue failed", async () => {
    mockState.queueCounts = { verifications: 3, disputes: 0, withdrawals: 120, "skill-requests": null };
    render(<NotificationsMenu />);
    await openInbox();
    expect(screen.getByText("Pending work")).toBeInTheDocument();
    expect(within(screen.getByRole("link", { name: /^Verifications/ })).getByText("3")).toBeInTheDocument();
    expect(within(screen.getByRole("link", { name: /^Disputes/ })).getByText("0")).toBeInTheDocument();
    expect(within(screen.getByRole("link", { name: /^Withdrawals/ })).getByText("100+")).toBeInTheDocument();
    const skill = screen.getByRole("link", { name: /^Service requests/ });
    expect(within(skill).getByText("Couldn't check")).toBeInTheDocument();
    expect(skill).toHaveAttribute("href", "/admin/skill-requests");
  });

  it("says there are no notifications yet when the inbox is empty but work is waiting", async () => {
    mockState.queueCounts = { verifications: 2, disputes: 0, withdrawals: 0, "skill-requests": 0 };
    render(<NotificationsMenu />);
    await openInbox();
    expect(screen.getByText("No notifications yet")).toBeInTheDocument();
    expect(screen.queryByText("All caught up!")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete all" })).not.toBeInTheDocument();
  });

  it("says all caught up only when every queue loaded and nothing is waiting", async () => {
    render(<NotificationsMenu />);
    await openInbox();
    expect(screen.getByText("All caught up!")).toBeInTheDocument();
  });

  it("does not claim all caught up when a queue failed to load", async () => {
    mockState.queueCounts = { verifications: 0, disputes: 0, withdrawals: 0, "skill-requests": null };
    render(<NotificationsMenu />);
    await openInbox();
    expect(screen.queryByText("All caught up!")).not.toBeInTheDocument();
    expect(screen.getByText("No notifications yet")).toBeInTheDocument();
  });
});
