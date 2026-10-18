import { describe, expect, it } from "vitest";
import type { QueueCounts } from "./attention";
import {
  INBOX_KEY,
  MAX_ENTRIES,
  MERGE_WINDOW_MS,
  addArrivals,
  applyReading,
  arrivalTitle,
  autoResolve,
  canDeleteAll,
  deleteAll,
  deleteEntry,
  deleteMany,
  loadInbox,
  markAllRead,
  markRead,
  parseInbox,
  saveInbox,
  serializeInbox,
  unreadCount,
  type InboxEntry,
} from "./inbox";

const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 15, 2, 0, 0);

const counts = (over: Partial<QueueCounts> = {}): QueueCounts => ({
  verifications: 0, disputes: 0, withdrawals: 0, "skill-requests": 0, ...over,
});

const entry = (over: Partial<InboxEntry> = {}): InboxEntry => ({
  id: "e1",
  queue: "verifications",
  title: "1 new provider verification",
  count: 1,
  createdAt: T0,
  read: false,
  ...over,
});

/** Ids handed out in order, so tests can name the entries they create. */
const ids = (...names: string[]) => {
  let i = 0;
  return () => names[i++] ?? `gen-${i}`;
};

describe("arrivalTitle", () => {
  it("names the queue in the words an admin uses, singular and plural", () => {
    expect(arrivalTitle("verifications", 3)).toBe("3 new provider verifications");
    expect(arrivalTitle("verifications", 1)).toBe("1 new provider verification");
    expect(arrivalTitle("disputes", 1)).toBe("1 new dispute");
    expect(arrivalTitle("disputes", 4)).toBe("4 new disputes");
    expect(arrivalTitle("withdrawals", 2)).toBe("2 new failed payouts");
    expect(arrivalTitle("skill-requests", 1)).toBe("1 new service request");
  });
});

describe("addArrivals", () => {
  it("adds one unread entry per queue that arrived, carrying the arrival count", () => {
    const out = addArrivals(
      [],
      [{ queue: "verifications", count: 3 }, { queue: "withdrawals", count: 1 }],
      T0,
      ids("a", "b"),
    );
    expect(out).toHaveLength(2);
    expect(out).toContainEqual({ id: "a", queue: "verifications", title: "3 new provider verifications", count: 3, createdAt: T0, read: false });
    expect(out).toContainEqual({ id: "b", queue: "withdrawals", title: "1 new failed payout", count: 1, createdAt: T0, read: false });
  });

  it("keeps the newest entry first", () => {
    const older = entry({ id: "old", queue: "disputes", title: "1 new dispute", createdAt: T0 - 30 * MIN });
    const out = addArrivals([older], [{ queue: "verifications", count: 1 }], T0, ids("new"));
    expect(out.map((e) => e.id)).toEqual(["new", "old"]);
  });

  it("merges a repeat arrival of the same queue inside the merge window into one entry", () => {
    const first = addArrivals([], [{ queue: "verifications", count: 2 }], T0, ids("x"));
    const second = addArrivals(first, [{ queue: "verifications", count: 3 }], T0 + 4 * MIN, ids("y"));
    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({ id: "x", count: 5, title: "5 new provider verifications", createdAt: T0, read: false });
  });

  it("marks a merged entry unread again, so the new arrival is seen", () => {
    const read = [entry({ id: "x", count: 2, title: "2 new provider verifications", read: true })];
    const out = addArrivals(read, [{ queue: "verifications", count: 1 }], T0 + MERGE_WINDOW_MS - 1, ids("y"));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "x", count: 3, read: false });
  });

  it("starts a new entry once the merge window has passed", () => {
    const first = addArrivals([], [{ queue: "verifications", count: 2 }], T0, ids("x"));
    const later = addArrivals(first, [{ queue: "verifications", count: 1 }], T0 + MERGE_WINDOW_MS, ids("y"));
    expect(later.map((e) => e.id)).toEqual(["y", "x"]);
    expect(later[1]).toMatchObject({ count: 2, read: false });
  });

  it("never merges across different queues", () => {
    const first = addArrivals([], [{ queue: "verifications", count: 1 }], T0, ids("x"));
    const out = addArrivals(first, [{ queue: "disputes", count: 1 }], T0 + MIN, ids("y"));
    expect(out).toHaveLength(2);
  });

  it("ignores zero or negative arrivals", () => {
    const entries: InboxEntry[] = [];
    expect(addArrivals(entries, [{ queue: "disputes", count: 0 }], T0, ids("a"))).toBe(entries);
    expect(addArrivals(entries, [{ queue: "disputes", count: -2 }], T0, ids("a"))).toBe(entries);
  });

  it("returns the same array when there is nothing to add", () => {
    const entries = [entry()];
    expect(addArrivals(entries, [], T0, ids("a"))).toBe(entries);
  });

  it("caps the list at MAX_ENTRIES, dropping the oldest", () => {
    const existing = Array.from({ length: MAX_ENTRIES }, (_, i) =>
      entry({ id: `old${i}`, queue: "disputes", title: "1 new dispute", createdAt: T0 - (i + 1) * 10 * MIN }),
    );
    const out = addArrivals(existing, [{ queue: "verifications", count: 1 }], T0, ids("new"));
    expect(out).toHaveLength(MAX_ENTRIES);
    expect(out[0].id).toBe("new");
    expect(out.at(-1)?.id).toBe(`old${MAX_ENTRIES - 2}`);
    expect(out.some((e) => e.id === `old${MAX_ENTRIES - 1}`)).toBe(false);
  });
});

describe("read state", () => {
  const two = [entry({ id: "a" }), entry({ id: "b", queue: "disputes", title: "1 new dispute" })];

  it("markRead flips one entry and leaves the rest alone", () => {
    const out = markRead(two, "a");
    expect(out.find((e) => e.id === "a")?.read).toBe(true);
    expect(out.find((e) => e.id === "b")?.read).toBe(false);
  });

  it("markRead returns the same array for an unknown or already-read id", () => {
    expect(markRead(two, "nope")).toBe(two);
    const done = markRead(two, "a");
    expect(markRead(done, "a")).toBe(done);
  });

  it("markAllRead marks everything and returns the same array when nothing is unread", () => {
    const out = markAllRead(two);
    expect(out.every((e) => e.read)).toBe(true);
    expect(markAllRead(out)).toBe(out);
  });

  it("unreadCount counts only unread entries", () => {
    expect(unreadCount(two)).toBe(2);
    expect(unreadCount(markRead(two, "a"))).toBe(1);
    expect(unreadCount([])).toBe(0);
  });
});

describe("delete", () => {
  const three = [entry({ id: "a" }), entry({ id: "b", queue: "disputes", title: "1 new dispute" }), entry({ id: "c", queue: "withdrawals", title: "1 new failed payout" })];

  it("deleteEntry removes one entry; an unknown id changes nothing", () => {
    expect(deleteEntry(three, "b").map((e) => e.id)).toEqual(["a", "c"]);
    expect(deleteEntry(three, "zzz")).toBe(three);
  });

  it("deleteMany removes every listed id and ignores unknown ones", () => {
    expect(deleteMany(three, ["a", "c", "zzz"]).map((e) => e.id)).toEqual(["b"]);
    expect(deleteMany(three, [])).toBe(three);
  });

  it("canDeleteAll is true only once every entry is read", () => {
    expect(canDeleteAll(three)).toBe(false);
    expect(canDeleteAll(markAllRead(three))).toBe(true);
  });

  it("deleteAll clears the inbox only when every entry is read", () => {
    expect(deleteAll(markAllRead(three))).toEqual([]);
    // Safety: an unread entry must never be wiped by a bulk action.
    expect(deleteAll(three)).toBe(three);
    const partly = markRead(three, "a");
    expect(deleteAll(partly)).toBe(partly);
  });
});

describe("autoResolve", () => {
  it("removes entries for a queue whose live count has dropped to 0", () => {
    const entries = [
      entry({ id: "v", queue: "verifications" }),
      entry({ id: "d", queue: "disputes", title: "1 new dispute", read: true }),
    ];
    const out = autoResolve(entries, counts({ verifications: 0, disputes: 2 }));
    expect(out.map((e) => e.id)).toEqual(["d"]);
  });

  it("keeps entries for a queue that still has work, and for a queue whose count is unknown", () => {
    const entries = [
      entry({ id: "v", queue: "verifications" }),
      entry({ id: "w", queue: "withdrawals", title: "1 new failed payout" }),
    ];
    const out = autoResolve(entries, counts({ verifications: 4, withdrawals: null }));
    expect(out).toEqual(entries);
  });

  it("returns the same array when nothing is removed", () => {
    const entries = [entry()];
    expect(autoResolve(entries, counts({ verifications: 1 }))).toBe(entries);
  });
});

describe("applyReading", () => {
  it("never adds entries from the first reading, but still clears handled work", () => {
    const entries = [entry({ id: "v", queue: "verifications" }), entry({ id: "d", queue: "disputes", title: "1 new dispute" })];
    const out = applyReading(entries, null, counts({ verifications: 0, disputes: 5 }), T0, ids("n"));
    expect(out.map((e) => e.id)).toEqual(["d"]);
  });

  it("adds the rise as an arrival and leaves other queues alone", () => {
    const out = applyReading([], counts({ verifications: 1 }), counts({ verifications: 3, withdrawals: 1 }), T0, ids("a", "b"));
    expect(out.map((e) => [e.queue, e.count])).toEqual(expect.arrayContaining([["verifications", 2], ["withdrawals", 1]]));
    expect(out).toHaveLength(2);
  });

  it("never adds from an unknown count on either side", () => {
    expect(applyReading([], counts({ withdrawals: null }), counts({ withdrawals: 4 }), T0, ids("a"))).toEqual([]);
    expect(applyReading([], counts({ withdrawals: 4 }), counts({ withdrawals: null }), T0, ids("a"))).toEqual([]);
  });

  it("keeps existing entries when a queue goes unknown", () => {
    const entries = [entry({ id: "w", queue: "withdrawals", title: "1 new failed payout" })];
    const out = applyReading(entries, counts({ withdrawals: 1 }), counts({ withdrawals: null }), T0, ids("a"));
    expect(out).toBe(entries);
  });
});

describe("parseInbox / serializeInbox", () => {
  it("returns an empty list for missing, corrupt or non-array data", () => {
    expect(parseInbox(null)).toEqual([]);
    expect(parseInbox("{not json")).toEqual([]);
    expect(parseInbox(JSON.stringify({ entries: [] }))).toEqual([]);
  });

  it("drops entries that do not match the shape, and keeps the valid ones", () => {
    const raw = JSON.stringify([
      entry({ id: "ok" }),
      { ...entry(), id: "" },
      { ...entry(), id: "bad-queue", queue: "payments" },
      { ...entry(), id: "zero", count: 0 },
      { ...entry(), id: "fraction", count: 1.5 },
      { ...entry(), id: "no-time", createdAt: "yesterday" },
      { ...entry(), id: "no-read", read: "yes" },
      "junk",
      null,
    ]);
    expect(parseInbox(raw).map((e) => e.id)).toEqual(["ok"]);
  });

  it("rebuilds each title from its queue and count rather than trusting the stored text", () => {
    const raw = JSON.stringify([{ ...entry({ id: "t", count: 2 }), title: "tampered" }]);
    expect(parseInbox(raw)[0].title).toBe("2 new provider verifications");
  });

  it("drops duplicate ids and caps the list, newest first", () => {
    const many = Array.from({ length: MAX_ENTRIES + 5 }, (_, i) => entry({ id: `e${i}`, createdAt: T0 - i * MIN }));
    const parsed = parseInbox(JSON.stringify([...many, many[0]]));
    expect(parsed).toHaveLength(MAX_ENTRIES);
    expect(parsed[0].id).toBe("e0");
    expect(new Set(parsed.map((e) => e.id)).size).toBe(parsed.length);
  });

  it("round-trips through serializeInbox", () => {
    const entries = [entry({ id: "a", count: 3, title: "3 new provider verifications" }), entry({ id: "b", queue: "skill-requests", title: "1 new service request", read: true })];
    expect(parseInbox(serializeInbox(entries))).toEqual(entries);
  });
});

describe("loadInbox / saveInbox", () => {
  const fakeStorage = () => {
    const store = new Map<string, string>();
    return {
      store,
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    };
  };

  it("loads what was saved under the inbox key", () => {
    const storage = fakeStorage();
    const entries = [entry({ id: "a" })];
    saveInbox(entries, storage);
    expect(storage.store.has(INBOX_KEY)).toBe(true);
    expect(loadInbox(storage)).toEqual(entries);
  });

  it("falls back to an empty inbox when storage cannot be read", () => {
    const broken = {
      getItem: () => { throw new Error("denied"); },
      setItem: () => { throw new Error("denied"); },
    };
    expect(loadInbox(broken)).toEqual([]);
  });

  it("does not throw when storage cannot be written", () => {
    const broken = { getItem: () => null, setItem: () => { throw new Error("quota"); } };
    expect(() => saveInbox([entry()], broken)).not.toThrow();
  });
});
