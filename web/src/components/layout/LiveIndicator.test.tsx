import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LiveIndicator } from "./LiveIndicator";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useApp } from "@/context/AppContext";

vi.mock("@/context/AppContext", () => ({
  useApp: vi.fn(),
}));

const mockedUseApp = vi.mocked(useApp);

function setApp(overrides: Partial<{ loadError: string | null; refreshFailed: boolean; lastUpdated: number | null }>) {
  mockedUseApp.mockReturnValue({
    lastUpdated: Date.now() - 8000,
    refreshing: false,
    refreshData: vi.fn(),
    loadError: null,
    refreshFailed: false,
    ...overrides,
  } as unknown as ReturnType<typeof useApp>);
}

function renderIndicator() {
  return render(
    <TooltipProvider>
      <LiveIndicator />
    </TooltipProvider>,
  );
}

describe("LiveIndicator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows Live while the console is refreshing normally", () => {
    setApp({});
    renderIndicator();
    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(screen.queryByText(/Update failed/)).not.toBeInTheDocument();
  });

  it("shows an amber 'Update failed — retry' when the last background refresh failed", () => {
    setApp({ refreshFailed: true });
    renderIndicator();

    const label = screen.getByText("Update failed — retry");
    expect(label).toBeInTheDocument();
    expect(screen.queryByText("Live")).not.toBeInTheDocument();
    expect(label.className).toContain("text-warn");
    expect(screen.getByRole("button", { name: /Update failed — retry/ })).toBeInTheDocument();
  });

  it("keeps the red Offline state when the initial load failed", () => {
    setApp({ loadError: "Could not reach the backend.", refreshFailed: true });
    renderIndicator();
    expect(screen.getByText("Offline")).toBeInTheDocument();
    expect(screen.queryByText("Update failed — retry")).not.toBeInTheDocument();
  });
});
