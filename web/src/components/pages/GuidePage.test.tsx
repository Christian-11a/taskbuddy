import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GuidePage } from "./GuidePage";
import { GUIDE_TRACKS } from "./guideLessons";

const KEY = "taskbuddy-guide-progress";

describe("GuidePage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, "", "/guide");
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("has unique lesson ids across both tracks", () => {
    const ids = [...GUIDE_TRACKS.clients, ...GUIDE_TRACKS.providers].map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("renders the site header with Guide marked current", () => {
    render(<GuidePage />);
    const nav = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(within(nav).getByRole("link", { name: "Guide" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "FAQ" })).toHaveAttribute("href", "/#faq");
    expect(screen.getByRole("link", { name: /Get App/ })).toHaveAttribute("href", "/#download");
    expect(screen.getByRole("link", { name: "TaskBuddy home" })).toHaveAttribute("href", "/");
  });

  it("opens and closes the menu by toggle, Escape and link click", async () => {
    const user = userEvent.setup();
    render(<GuidePage />);
    const toggle = screen.getByRole("button", { name: "Menu" });
    const nav = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(nav).toHaveClass("is-open");
    await user.keyboard("{Escape}");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(nav).not.toHaveClass("is-open");
    await user.click(toggle);
    await user.click(within(nav).getByRole("link", { name: "FAQ" }));
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(nav).not.toHaveClass("is-open");
  });

  it("switches tracks by click and arrow keys", async () => {
    const user = userEvent.setup();
    render(<GuidePage />);
    const clients = screen.getByRole("tab", { name: "For clients" });
    const providers = screen.getByRole("tab", { name: "For providers" });
    expect(clients).toHaveAttribute("aria-selected", "true");
    expect(providers).toHaveAttribute("tabindex", "-1");

    await user.click(providers);
    expect(providers).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: /Get verified/ })).toBeInTheDocument();

    await user.click(clients);
    await user.keyboard("{ArrowRight}");
    expect(providers).toHaveAttribute("aria-selected", "true");
    expect(providers).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(clients).toHaveAttribute("aria-selected", "true");
  });

  it("selects the lesson from the hash and follows hashchange", async () => {
    window.history.replaceState(null, "", "/guide#provider-send-a-proposal");
    render(<GuidePage />);
    expect(await screen.findByRole("heading", { level: 2, name: "Send a proposal" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "For providers" })).toHaveAttribute("aria-selected", "true");

    window.history.replaceState(null, "", "/guide#post-a-job");
    fireEvent(window, new HashChangeEvent("hashchange"));
    expect(await screen.findByRole("heading", { level: 2, name: "Post a job" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "For clients" })).toHaveAttribute("aria-selected", "true");
  });

  it("updates the hash when a lesson is chosen", async () => {
    const user = userEvent.setup();
    render(<GuidePage />);
    await user.click(screen.getByRole("button", { name: /Post a job/ }));
    expect(window.location.hash).toBe("#post-a-job");
    await user.click(screen.getByRole("button", { name: "Next lesson" }));
    expect(window.location.hash).toBe("#compare-proposals-and-hire");
  });

  it("scrolls the player into view and focuses its heading when a lesson is tapped from the list", async () => {
    const user = userEvent.setup();
    const scroll = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { value: scroll, configurable: true, writable: true });
    try {
      render(<GuidePage />);
      const heading = screen.getByRole("heading", { level: 2, name: "Create your account" });
      const player = heading.closest("article") as HTMLElement;
      vi.spyOn(player, "getBoundingClientRect").mockReturnValue({ top: 1200 } as DOMRect);

      await user.click(screen.getByRole("button", { name: /Post a job/ }));

      expect(scroll).toHaveBeenCalledTimes(1);
      expect(scroll).toHaveBeenCalledWith({ block: "start", behavior: "smooth" });
      expect(screen.getByRole("heading", { level: 2, name: "Post a job" })).toHaveFocus();
    } finally {
      delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
    }
  });

  it("persists mark complete", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<GuidePage />);
    await user.click(screen.getByRole("button", { name: "Mark as complete" }));
    expect(JSON.parse(window.localStorage.getItem(KEY) ?? "[]")).toEqual(["create-your-account"]);
    unmount();
    render(<GuidePage />);
    expect(await screen.findByRole("button", { name: "Completed" })).toBeInTheDocument();
    expect(screen.getByText("1 of 5 complete")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reset progress" }));
    expect(screen.getByText("0 of 5 complete")).toBeInTheDocument();
  });

  it("still works when localStorage throws", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const user = userEvent.setup();
    render(<GuidePage />);
    await user.click(screen.getByRole("button", { name: "Mark as complete" }));
    expect(screen.getByRole("button", { name: "Completed" })).toBeInTheDocument();
    expect(screen.getByText("Video coming soon")).toBeInTheDocument();
  });
});
