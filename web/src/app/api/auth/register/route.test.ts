import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

describe("provider registration proxy", () => {
  it("forwards an active category ID above the original five", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ session: null }), { status: 201 })) as typeof fetch;
    const body = {
      role: "provider",
      category_id: 6,
      consented_terms: true,
      consented_privacy: true,
      consented_data_collection: true,
      consented_biometric: true,
    };
    const request = new NextRequest("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { host: "localhost:3000", origin: "http://localhost:3000" },
      body: JSON.stringify(body),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ needsEmailConfirmation: true });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/auth/register"),
      expect.objectContaining({ body: JSON.stringify(body) }),
    );
  });
});
