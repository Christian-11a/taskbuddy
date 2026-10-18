import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SkillRequestsPage } from "./SkillRequestsPage";
import { ToastProvider } from "@/components/ui/Toast";
import { useApp } from "@/context/AppContext";
import * as services from "@/lib/services";
import { ApiError } from "@/lib/api/client";

vi.mock("@/context/AppContext", () => ({
  useApp: vi.fn(),
}));

vi.mock("@/lib/services", () => ({
  getSkillRequests: vi.fn(),
  approveSkillRequest: vi.fn(),
  rejectSkillRequest: vi.fn(),
}));

const mockedUseApp = vi.mocked(useApp);
const mockedGetSkillRequests = vi.mocked(services.getSkillRequests);

function renderPage() {
  return render(
    <ToastProvider>
      <SkillRequestsPage />
    </ToastProvider>,
  );
}

describe("SkillRequestsPage search input", () => {
  // useIsWide reads matchMedia on every render; jsdom does not provide it.
  beforeAll(() => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseApp.mockReturnValue({ refreshCounts: vi.fn().mockResolvedValue(undefined) } as unknown as ReturnType<typeof useApp>);
    mockedGetSkillRequests.mockResolvedValue({ items: [], total: 0 });
  });

  it("caps the search box at 100 characters and shows the API's 400 message under it", async () => {
    const user = userEvent.setup();
    renderPage();
    const search = await screen.findByLabelText("Search service requests");
    expect(search).toHaveAttribute("maxLength", "100");

    mockedGetSkillRequests.mockRejectedValueOnce(new ApiError(400, "Search is too long."));
    await user.type(search, "x");

    expect(await screen.findByText("Search is too long.")).toHaveAttribute("role", "alert");
    expect(search).toHaveAccessibleDescription("Search is too long.");
    expect(screen.queryByText("Couldn't load service requests")).not.toBeInTheDocument();
  });
});
