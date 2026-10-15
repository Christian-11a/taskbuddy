import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { CaseTimeline } from "./CaseTimeline";
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
});
