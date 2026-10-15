import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { CaseTimeline, CLARIFICATION_PREFIX, parseClarificationAddress } from "./CaseTimeline";
import type { CaseEntry } from "@/lib/domain";

function entry(over: Partial<CaseEntry> & { id: string; kind: string }): CaseEntry {
  return {
    body: "",
    created_at: "2026-10-13T10:00:00Z",
    author: null,
    message: null,
    attachment_url: null,
    ...over,
  };
}

const names = { clientName: "Ana", providerName: "Rico" };

describe("CaseTimeline", () => {
  it("labels each kind and the person behind it, oldest first", () => {
    render(
      <CaseTimeline
        {...names}
        entries={[
          entry({
            id: "2",
            kind: "appeal",
            body: "I disagree",
            created_at: "2026-10-14T10:00:00Z",
            author: { id: "p", full_name: "Rico", role: "provider" },
          }),
          entry({
            id: "1",
            kind: "statement",
            body: "Not finished",
            created_at: "2026-10-13T10:00:00Z",
            author: { id: "c", full_name: "Ana", role: "client" },
          }),
        ]}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Statement");
    expect(items[0]).toHaveTextContent("Ana");
    expect(items[0]).toHaveTextContent("Not finished");
    expect(items[1]).toHaveTextContent("Appeal");
    expect(items[1]).toHaveTextContent("Rico");
    expect(screen.getByRole("list", { name: "Case timeline" }).tagName).toBe("OL");
  });

  it("sorts entries oldest first even when they arrive out of order", () => {
    render(
      <CaseTimeline
        {...names}
        entries={[
          entry({ id: "late", kind: "resolution", body: "Late", created_at: "2026-10-15T09:00:00Z" }),
          entry({ id: "early", kind: "statement", body: "Early", created_at: "2026-10-12T09:00:00Z" }),
          entry({ id: "mid", kind: "clarification", body: "Mid", created_at: "2026-10-13T09:00:00Z" }),
        ]}
      />,
    );
    const bodies = screen.getAllByRole("listitem").map((li) => within(li).getByText(/Early|Mid|Late/).textContent);
    expect(bodies).toEqual(["Early", "Mid", "Late"]);
  });

  it("shows a system entry without a person name", () => {
    render(
      <CaseTimeline
        {...names}
        entries={[entry({ id: "s", kind: "system", body: "Payment released" })]}
      />,
    );
    const item = screen.getByRole("listitem");
    expect(item).toHaveTextContent("System");
    expect(item).toHaveTextContent("Payment released");
    expect(item).not.toHaveTextContent("Ana");
    expect(item).not.toHaveTextContent("Rico");
  });

  it("links photo evidence in a new tab and quotes job chat evidence", () => {
    render(
      <CaseTimeline
        {...names}
        entries={[
          entry({
            id: "e",
            kind: "statement",
            body: "Tiles are cracked",
            author: { id: "c", full_name: "Ana", role: "client" },
            message: { id: "m", body: "Tiles will be fixed Monday", attachment_path: null },
            attachment_url: "https://cdn.example.test/photo.jpg",
          }),
        ]}
      />,
    );
    const link = screen.getByRole("link", { name: /View photo evidence/ });
    expect(link).toHaveAttribute("href", "https://cdn.example.test/photo.jpg");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
    expect(screen.getByText(/Tiles will be fixed Monday/).closest("blockquote")).not.toBeNull();
  });

  it("puts the full timestamp in a title attribute", () => {
    render(
      <CaseTimeline
        {...names}
        entries={[entry({ id: "t", kind: "statement", body: "x", created_at: "2026-10-13T10:00:00Z" })]}
      />,
    );
    const time = screen.getByRole("listitem").querySelector("time");
    expect(time).not.toBeNull();
    expect(time).toHaveAttribute("dateTime", "2026-10-13T10:00:00Z");
    expect(time?.getAttribute("title")).toBe(new Date("2026-10-13T10:00:00Z").toLocaleString());
  });

  it("falls back to the capitalised raw kind for a kind it does not know", () => {
    render(<CaseTimeline {...names} entries={[entry({ id: "x", kind: "escalated", body: "Passed on" })]} />);
    expect(screen.getByRole("listitem")).toHaveTextContent("Escalated");
  });

  it("says so when there is no activity", () => {
    render(<CaseTimeline {...names} entries={[]} />);
    expect(screen.getByText("No case activity yet.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("says what is missing when the caller gives an empty-state text", () => {
    render(<CaseTimeline {...names} entries={[]} emptyText="No statements yet. Ask a party for one." />);
    expect(screen.getByText("No statements yet. Ask a party for one.")).toBeInTheDocument();
    expect(screen.queryByText("No case activity yet.")).not.toBeInTheDocument();
  });
});

describe("clarification addressing", () => {
  const admin = { id: "a", full_name: "Admin Jo", role: "admin" };

  it("shows who a clarification is addressed to, without the raw prefix", () => {
    render(
      <CaseTimeline
        {...names}
        entries={[
          entry({ id: "c1", kind: "clarification", body: "To the client: Please share a photo of the finished work", author: admin }),
        ]}
      />,
    );
    const item = screen.getByRole("listitem");
    expect(within(item).getByText("To the client")).toBeInTheDocument();
    expect(item).toHaveTextContent("Please share a photo of the finished work");
    expect(item).not.toHaveTextContent("To the client: Please");
  });

  it("shows 'To both parties' and 'To the provider' for the other two prefixes", () => {
    render(
      <CaseTimeline
        {...names}
        entries={[
          entry({ id: "b", kind: "clarification", body: "To both parties: Confirm the completion date", created_at: "2026-10-13T10:00:00Z", author: admin }),
          entry({ id: "p", kind: "clarification", body: "To the provider: Send the agreement chat", created_at: "2026-10-14T10:00:00Z", author: admin }),
        ]}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(within(items[0]).getByText("To both parties")).toBeInTheDocument();
    expect(within(items[1]).getByText("To the provider")).toBeInTheDocument();
  });

  it("shows no addressing for a clarification without a prefix, and none for a statement", () => {
    render(
      <CaseTimeline
        {...names}
        entries={[
          entry({ id: "old", kind: "clarification", body: "Explain the missing task.", created_at: "2026-10-13T10:00:00Z", author: admin }),
          entry({ id: "st", kind: "statement", body: "To the client: nothing to add", created_at: "2026-10-14T10:00:00Z", author: { id: "c", full_name: "Ana", role: "client" } }),
        ]}
      />,
    );
    const [legacy, statement] = screen.getAllByRole("listitem");
    expect(within(legacy).queryByText(/^To /)).not.toBeInTheDocument();
    expect(legacy).toHaveTextContent("Explain the missing task.");
    expect(statement).toHaveTextContent("To the client: nothing to add");
  });
});

describe("party lanes", () => {
  it("puts client entries in the start lane and provider entries in the end lane", () => {
    render(
      <CaseTimeline
        {...names}
        entries={[
          entry({ id: "c", kind: "statement", body: "Not finished", created_at: "2026-10-12T10:00:00Z", author: { id: "c1", full_name: "Ana", role: "client" } }),
          entry({ id: "p", kind: "appeal", body: "It is finished", created_at: "2026-10-13T10:00:00Z", author: { id: "p1", full_name: "Rico", role: "provider" } }),
          entry({ id: "a", kind: "clarification", body: "To both parties: Thanks", created_at: "2026-10-14T10:00:00Z", author: { id: "x", full_name: "Admin Jo", role: "admin" } }),
        ]}
      />,
    );
    const [client, provider, admin] = screen.getAllByRole("listitem");
    expect(client).toHaveAttribute("data-party", "client");
    expect(client).toHaveAttribute("data-lane", "start");
    expect(provider).toHaveAttribute("data-party", "provider");
    expect(provider).toHaveAttribute("data-lane", "end");
    expect(admin).toHaveAttribute("data-lane", "full");
  });
});

describe("parseClarificationAddress", () => {
  it("reads each prefix the case form writes", () => {
    expect(parseClarificationAddress("To the client: Share a photo")).toEqual({ audience: "client", text: "Share a photo" });
    expect(parseClarificationAddress("To the provider: Share a photo")).toEqual({ audience: "provider", text: "Share a photo" });
    expect(parseClarificationAddress("To both parties: Share a photo")).toEqual({ audience: "both", text: "Share a photo" });
  });

  it("returns the text unchanged when there is no prefix", () => {
    expect(parseClarificationAddress("Share a photo")).toEqual({ audience: null, text: "Share a photo" });
  });

  it("writes the same prefixes it reads", () => {
    for (const audience of ["client", "provider", "both"] as const) {
      expect(parseClarificationAddress(`${CLARIFICATION_PREFIX[audience]}Hello`)).toEqual({ audience, text: "Hello" });
    }
  });
});
