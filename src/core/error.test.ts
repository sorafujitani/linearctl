import { describe, expect, it } from "vite-plus/test";

import { errorMessage } from "./error";

describe("errorMessage", () => {
  it("uses the Error message when one exists", () => {
    expect(errorMessage(new Error("workspace mismatch"))).toBe("workspace mismatch");
  });

  it("falls back for non-Error throws", () => {
    expect(errorMessage("nope")).toBe("An unexpected error occurred.");
    expect(errorMessage(null, "Could not connect.")).toBe("Could not connect.");
  });
});
