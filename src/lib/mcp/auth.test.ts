import { beforeEach, describe, expect, it, vi } from "vitest";
import { isToolResult, requireCaller } from "./supabase";

type Ctx = Parameters<typeof requireCaller>[0];

function ctx(options: { authenticated: boolean; userId?: string }): Ctx {
  return {
    isAuthenticated: () => options.authenticated,
    getUserId: () => options.userId,
    getToken: () => (options.authenticated ? "test-token" : undefined),
  } as unknown as Ctx;
}

describe("requireCaller", () => {
  beforeEach(() => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  });

  it("rejects an unauthenticated caller", async () => {
    const result = await requireCaller(ctx({ authenticated: false }));
    expect(isToolResult(result) && result.isError).toBe(true);
  });

  it("resolves the user id from the verified token claims, without an auth round trip", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await requireCaller(ctx({ authenticated: true, userId: "user-1" }));
    expect(isToolResult(result)).toBe(false);
    if (!isToolResult(result)) expect(result.userId).toBe("user-1");
    // A network call here is what made concurrent reads fail with "Not authenticated".
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("rejects a verified token that carries no subject", async () => {
    const result = await requireCaller(ctx({ authenticated: true }));
    expect(isToolResult(result) && result.isError).toBe(true);
  });
});
