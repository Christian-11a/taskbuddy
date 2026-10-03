import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_URL } from "@/lib/api/client";
import { installMockApi } from "./mockApi";

const originalFetch = window.fetch;
const originalPath = window.location.pathname;

describe("admin preview service requests", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/dev/admin-preview/skill-requests");
    window.fetch = vi.fn() as typeof fetch;
    (window as { __mockApi?: boolean }).__mockApi = false;
    installMockApi();
  });

  afterEach(() => {
    window.fetch = originalFetch;
    window.history.replaceState({}, "", originalPath);
    delete (window as { __mockApi?: boolean }).__mockApi;
  });

  const request = async (query: string) => {
    const response = await window.fetch(`${API_URL}/admin/skill-requests?${query}`);
    return response.json();
  };

  it("filters by status and provider or service before paging", async () => {
    await expect(request("status=pending&search=Juan&limit=1&offset=0")).resolves.toMatchObject({
      items: [{ id: "s1" }],
      total: 1,
    });
    await expect(request("status=pending&search=Pedicure&limit=1&offset=0")).resolves.toMatchObject({
      items: [{ id: "s2" }],
      total: 1,
    });
    await expect(request("status=pending&search=missing&limit=1&offset=0")).resolves.toEqual({
      items: [],
      total: 0,
    });
    await expect(request("status=pending&search=&limit=1&offset=1")).resolves.toMatchObject({
      items: [{ id: "s2" }],
      total: 2,
    });
  });
});
