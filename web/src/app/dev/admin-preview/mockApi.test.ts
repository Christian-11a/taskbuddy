import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_URL } from "@/lib/api/client";
import { installMockApi, SAMPLE_CASE_PARTIES } from "./mockApi";
import { MOCK_APP } from "./mockApp";

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

describe("admin preview job conversations", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/dev/admin-preview/disputes");
    window.fetch = vi.fn() as typeof fetch;
    (window as { __mockApi?: boolean }).__mockApi = false;
    installMockApi();
  });

  afterEach(() => {
    window.fetch = originalFetch;
    window.history.replaceState({}, "", originalPath);
    delete (window as { __mockApi?: boolean }).__mockApi;
  });

  const conversation = async (jobId: string) => {
    const response = await window.fetch(`${API_URL}/admin/jobs/${jobId}/conversation`);
    return (await response.json()) as { messages: Array<Record<string, unknown>> };
  };

  it("gives every message a sender id that is one of the sample case's parties, with the matching name", async () => {
    const { messages } = await conversation("j1057");
    const { clientId, clientName, providerId, providerName } = SAMPLE_CASE_PARTIES;
    expect(messages.length).toBeGreaterThan(0);
    for (const message of messages) {
      expect(["client", "provider"]).toContain(message.sender_id === clientId ? "client" : message.sender_id === providerId ? "provider" : "other");
      expect(message.sender_name).toBe(message.sender_id === clientId ? clientName : providerName);
    }
  });

  it("includes a photo the chat viewer can show offline", async () => {
    const { messages } = await conversation("j1057");
    const photo = messages.find((message) => typeof message.attachment_url === "string" && message.attachment_url);
    expect(photo).toBeDefined();
    expect(String(photo?.attachment_url)).toMatch(/^data:image\/svg\+xml[;,]/);
  });

  it("uses the same party ids on the sample dispute case, so the chat roles resolve from ids", () => {
    const sampleCase = MOCK_APP.disputes.find((d) => d.jobId === "j1057");
    expect(sampleCase?.clientId).toBe(SAMPLE_CASE_PARTIES.clientId);
    expect(sampleCase?.providerId).toBe(SAMPLE_CASE_PARTIES.providerId);
    expect(sampleCase?.clientName).toBe(SAMPLE_CASE_PARTIES.clientName);
    expect(sampleCase?.providerName).toBe(SAMPLE_CASE_PARTIES.providerName);
  });
});
