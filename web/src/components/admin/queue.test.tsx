import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { neighborAfterRemoval, stepInList, useQueueKeys, type QueueKeyHandlers } from "./queue";

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
