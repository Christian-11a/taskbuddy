import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { neighborAfterRemoval, QueueShell, stepInList, useIsWide, useQueueKeys, type QueueKeyHandlers } from "./queue";

describe("stepInList", () => {
  const ids = ["a", "b", "c"];
  it("moves and clamps at both ends", () => {
    expect(stepInList(ids, "a", 1)).toBe("b");
    expect(stepInList(ids, "c", 1)).toBe("c");
    expect(stepInList(ids, "a", -1)).toBe("a");
  });
  it("starts at the first (J) or last (K) item with no selection", () => {
    expect(stepInList(ids, null, 1)).toBe("a");
    expect(stepInList(ids, null, -1)).toBe("c");
    expect(stepInList([], null, 1)).toBeNull();
  });
});

describe("neighborAfterRemoval", () => {
  it("prefers the next item, then the previous", () => {
    expect(neighborAfterRemoval(["a", "b", "c"], "b")).toBe("c");
    expect(neighborAfterRemoval(["a", "b", "c"], "c")).toBe("b");
    expect(neighborAfterRemoval(["a"], "a")).toBeNull();
  });
});

function Harness(props: QueueKeyHandlers) {
  useQueueKeys(props);
  return <input aria-label="note" />;
}

describe("useQueueKeys", () => {
  it("maps J/K/A/R/Escape", () => {
    const onSelect = vi.fn();
    const onApprove = vi.fn();
    const onReject = vi.fn();
    render(<Harness ids={["a", "b"]} selectedId="a" onSelect={onSelect} onApprove={onApprove} onReject={onReject} />);
    fireEvent.keyDown(document, { key: "j" });
    expect(onSelect).toHaveBeenLastCalledWith("b");
    fireEvent.keyDown(document, { key: "k" });
    expect(onSelect).toHaveBeenLastCalledWith("a");
    fireEvent.keyDown(document, { key: "a" });
    expect(onApprove).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: "r" });
    expect(onReject).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it("ignores keys typed into a field or with modifiers", () => {
    const onApprove = vi.fn();
    const { getByLabelText } = render(<Harness ids={["a"]} selectedId="a" onSelect={vi.fn()} onApprove={onApprove} />);
    fireEvent.keyDown(getByLabelText("note"), { key: "a" });
    fireEvent.keyDown(document, { key: "a", ctrlKey: true });
    expect(onApprove).not.toHaveBeenCalled();
  });
});

describe("useIsWide", () => {
  function WideProbe() {
    return <span data-testid="wide">{String(useIsWide())}</span>;
  }

  it("subscribes once and keeps the subscription across re-renders", () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener, removeEventListener })));
    try {
      const { rerender, unmount } = render(<WideProbe />);
      rerender(<WideProbe />);
      rerender(<WideProbe />);
      expect(addEventListener).toHaveBeenCalledTimes(1);
      expect(removeEventListener).toHaveBeenCalledTimes(0);
      unmount();
      expect(removeEventListener).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("QueueShell list collapse", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  function ShellHarness({
    storageKey,
    showDetailOnNarrow = false,
    selectedId = "a",
    onSelect = vi.fn(),
  }: {
    storageKey?: string;
    showDetailOnNarrow?: boolean;
    selectedId?: string;
    onSelect?: (id: string | null) => void;
  }) {
    const ids = ["a", "b", "c"];
    useQueueKeys({ ids, selectedId, onSelect });
    return (
      <QueueShell
        storageKey={storageKey}
        railCount={ids.length}
        railLabel="cases"
        showDetailOnNarrow={showDetailOnNarrow}
        onBack={vi.fn()}
        toolbar={<span>Toolbar</span>}
        list={<ul aria-label="Cases">{ids.map((id) => <li key={id}><button data-queue-item={id}>{id}</button></li>)}</ul>}
        detail={<p>Detail for {selectedId}</p>}
      />
    );
  }

  it("starts expanded, with a labelled toggle that says what it controls", () => {
    render(<ShellHarness />);
    const collapse = screen.getByRole("button", { name: "Collapse list" });
    expect(collapse).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByRole("button", { name: "Expand list" })).not.toBeInTheDocument();
    expect(document.getElementById(collapse.getAttribute("aria-controls") ?? "")).toHaveClass("flex");
  });

  it("collapses to a rail showing the item count, and expands back", async () => {
    const user = userEvent.setup();
    render(<ShellHarness />);
    await user.click(screen.getByRole("button", { name: "Collapse list" }));

    const expand = screen.getByRole("button", { name: "Expand list" });
    expect(expand).toHaveAttribute("aria-expanded", "false");
    expect(expand).toHaveAttribute("aria-controls");
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("cases")).toBeInTheDocument();
    expect(screen.getByText("Detail for a")).toBeInTheDocument();

    await user.click(expand);
    expect(screen.getByRole("button", { name: "Collapse list" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByRole("button", { name: "Expand list" })).not.toBeInTheDocument();
  });

  it("moves focus to the control that is still on screen after a toggle", async () => {
    const user = userEvent.setup();
    render(<ShellHarness />);
    await user.click(screen.getByRole("button", { name: "Collapse list" }));
    expect(screen.getByRole("button", { name: "Expand list" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Expand list" }));
    expect(screen.getByRole("button", { name: "Collapse list" })).toHaveFocus();
  });

  it("remembers the collapsed state for its own page key", async () => {
    const user = userEvent.setup();
    const first = render(<ShellHarness storageKey="test.disputes" />);
    await user.click(screen.getByRole("button", { name: "Collapse list" }));
    expect(window.localStorage.getItem("test.disputes")).toBe("1");
    first.unmount();

    render(<ShellHarness storageKey="test.disputes" />);
    expect(screen.getByRole("button", { name: "Expand list" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Expand list" }));
    expect(window.localStorage.getItem("test.disputes")).toBe("0");
  });

  it("keeps each page's choice under its own key", () => {
    window.localStorage.setItem("test.disputes", "1");
    render(<ShellHarness storageKey="test.withdrawals" />);
    expect(screen.queryByRole("button", { name: "Expand list" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse list" })).toHaveAttribute("aria-expanded", "true");
  });

  it("still toggles when storage is blocked", async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    render(<ShellHarness storageKey="test.blocked" />);
    await user.click(screen.getByRole("button", { name: "Collapse list" }));
    expect(screen.getByRole("button", { name: "Expand list" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Expand list" }));
    expect(screen.getByRole("button", { name: "Collapse list" })).toBeInTheDocument();
  });

  it("writes nothing when no storage key is given", async () => {
    const user = userEvent.setup();
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    render(<ShellHarness />);
    await user.click(screen.getByRole("button", { name: "Collapse list" }));
    expect(setItem).not.toHaveBeenCalled();
  });

  it("leaves the list visible on narrow screens while collapsed on wide ones", () => {
    window.localStorage.setItem("test.narrow", "1");
    render(<ShellHarness storageKey="test.narrow" />);
    const list = document.querySelector("[aria-label='Cases']")!.closest("section")!;
    expect(list).toHaveClass("flex", "lg:hidden");
    expect(list).not.toHaveClass("hidden");
    expect(screen.getByRole("button", { name: "Expand list" }).parentElement).toHaveClass("hidden", "lg:flex");
  });

  it("keeps the detail-first narrow flow: the list stays hidden there while a case is open", () => {
    window.localStorage.setItem("test.narrowDetail", "1");
    render(<ShellHarness storageKey="test.narrowDetail" showDetailOnNarrow />);
    const list = document.querySelector("[aria-label='Cases']")!.closest("section")!;
    expect(list).toHaveClass("hidden");
    expect(list).not.toHaveClass("lg:flex");
  });

  it("keeps J and K moving the selection while the list is collapsed", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ShellHarness storageKey="test.keys" onSelect={onSelect} />);
    await user.click(screen.getByRole("button", { name: "Collapse list" }));
    fireEvent.keyDown(document, { key: "j" });
    expect(onSelect).toHaveBeenLastCalledWith("b");
    fireEvent.keyDown(document, { key: "k" });
    expect(onSelect).toHaveBeenLastCalledWith("a");
  });
});
