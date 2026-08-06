import { describe, expect, it } from "vite-plus/test";

import { parseArgs } from "./args";

describe("parseArgs", () => {
  it("parses global help and version options", () => {
    expect(parseArgs(["--help"])).toEqual({ kind: "help" });
    expect(parseArgs(["--version"])).toEqual({ kind: "version" });
  });

  it("parses a TUI command with a workspace", () => {
    expect(parseArgs(["--workspace", "fs0414"])).toEqual({
      kind: "tui",
      connection: { mode: "real", workspace: "fs0414" },
    });
  });

  it("uses config defaults and lets CLI options override them", () => {
    expect(parseArgs([], { workspace: "fs0414", defaultTeam: "APP" })).toEqual({
      kind: "tui",
      connection: { mode: "real", workspace: "fs0414" },
      defaultTeam: "APP",
    });
    expect(
      parseArgs(["--workspace", "another", "--team", "plat"], {
        workspace: "fs0414",
        defaultTeam: "APP",
      }),
    ).toEqual({
      kind: "tui",
      connection: { mode: "real", workspace: "another" },
      defaultTeam: "PLAT",
    });
  });

  it("normalizes the mock TUI to a safe fixed workspace", () => {
    expect(parseArgs(["--mock"])).toEqual({
      kind: "tui",
      connection: { mode: "mock", workspace: "fs0414" },
    });
    expect(parseArgs(["--workspace", "fs0414", "--mock"])).toEqual({
      kind: "tui",
      connection: { mode: "mock", workspace: "fs0414" },
    });
  });

  it("requires a workspace for auth status", () => {
    expect(parseArgs(["auth", "status", "--workspace=fs0414"])).toEqual({
      kind: "auth-status",
      connection: { mode: "real", workspace: "fs0414" },
    });
    expect(parseArgs(["auth", "status", "--mock", "--workspace=fs0414"])).toEqual({
      kind: "auth-status",
      connection: { mode: "mock", workspace: "fs0414" },
    });
    expect(() => parseArgs(["auth", "status"])).toThrow("--workspace");
    expect(parseArgs(["auth", "status"], { workspace: "fs0414" })).toEqual({
      kind: "auth-status",
      connection: { mode: "real", workspace: "fs0414" },
    });
  });

  it("rejects unknown options that contain an API key", () => {
    expect(() => parseArgs(["--api-key", "secret"])).toThrow("--api-key");
  });

  it("rejects duplicate mock options and mock values", () => {
    expect(() => parseArgs(["--mock", "--mock"])).toThrow("only be specified once");
    expect(() => parseArgs(["--mock=true"])).toThrow("does not accept a value");
  });

  it("rejects missing and duplicate team options", () => {
    expect(() => parseArgs(["--team"])).toThrow("requires a team key");
    expect(() => parseArgs(["--team", "APP", "--team=PLAT"])).toThrow("only be specified once");
  });

  it("rejects unknown options", () => {
    expect(() => parseArgs(["--unknown"])).toThrow("Unknown option");
  });
});
