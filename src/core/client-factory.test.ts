import { describe, expect, it, vi } from "vite-plus/test";

import { createClient } from "./client-factory";
import { LinearGraphqlClient } from "./linear-client";
import { MockLinearClient } from "./mock-client";

describe("createClient", () => {
  it("creates a mock client without an API key or fetch call", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("mock mode must not fetch");
    });
    vi.stubGlobal("fetch", fetcher);
    try {
      const client = createClient("mock", {});
      expect(client).toBeInstanceOf(MockLinearClient);
      await client.getAuthStatus();
      await client.getIssues({ kind: "assigned-to-me" });
      expect(fetcher).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("requires an API key for the real client", () => {
    expect(() => createClient("real", {})).toThrow("LINEAR_API_KEY");
    expect(createClient("real", { LINEAR_API_KEY: "test-key-not-real" })).toBeInstanceOf(
      LinearGraphqlClient,
    );
  });
});
