import { describe, expect, it } from "vite-plus/test";

import { parseArgs } from "./args";

describe("parseArgs", () => {
  it("parses global help and version options", () => {
    expect(parseArgs(["--help"])).toEqual({ kind: "help" });
    expect(parseArgs(["--version"])).toEqual({ kind: "version" });
  });

  it("parses a TUI command with a workspace", () => {
    expect(parseArgs(["--workspace", "sample-workspace"])).toEqual({
      kind: "tui",
      connection: { mode: "real", workspace: "sample-workspace" },
    });
  });

  it("uses config defaults and lets CLI options override them", () => {
    expect(parseArgs([], { workspace: "sample-workspace", defaultTeam: "APP" })).toEqual({
      kind: "tui",
      connection: { mode: "real", workspace: "sample-workspace" },
      defaultTeam: "APP",
    });
    expect(
      parseArgs(["--workspace", "another", "--team", "plat"], {
        workspace: "sample-workspace",
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
      connection: { mode: "mock", workspace: "sample-workspace" },
    });
    expect(parseArgs(["--workspace", "sample-workspace", "--mock"])).toEqual({
      kind: "tui",
      connection: { mode: "mock", workspace: "sample-workspace" },
    });
  });

  it("requires a workspace for auth status", () => {
    expect(parseArgs(["auth", "status", "--workspace=sample-workspace"])).toEqual({
      kind: "auth-status",
      connection: { mode: "real", workspace: "sample-workspace" },
      json: false,
    });
    expect(parseArgs(["auth", "status", "--mock", "--workspace=sample-workspace"])).toEqual({
      kind: "auth-status",
      connection: { mode: "mock", workspace: "sample-workspace" },
      json: false,
    });
    expect(() => parseArgs(["auth", "status"])).toThrow("--workspace");
    expect(parseArgs(["auth", "status"], { workspace: "sample-workspace" })).toEqual({
      kind: "auth-status",
      connection: { mode: "real", workspace: "sample-workspace" },
      json: false,
    });
    expect(parseArgs(["auth", "status", "--workspace=sample-workspace", "--json"])).toEqual({
      kind: "auth-status",
      connection: { mode: "real", workspace: "sample-workspace" },
      json: true,
    });
  });

  it("parses issue list with team, mine, and json options", () => {
    expect(parseArgs(["issue", "list"])).toEqual({
      kind: "issue-list",
      connection: { mode: "real" },
      mine: false,
      json: false,
    });
    expect(parseArgs(["issue", "list", "--team", "app", "--mine", "--json"])).toEqual({
      kind: "issue-list",
      connection: { mode: "real" },
      team: "APP",
      mine: true,
      json: true,
    });
    expect(parseArgs(["issue", "list", "--mock"])).toEqual({
      kind: "issue-list",
      connection: { mode: "mock", workspace: "sample-workspace" },
      mine: false,
      json: false,
    });
    // The config defaultTeam is a TUI preference; issue list scopes only on explicit --team.
    expect(parseArgs(["issue", "list"], { defaultTeam: "APP" })).toEqual({
      kind: "issue-list",
      connection: { mode: "real" },
      mine: false,
      json: false,
    });
  });

  it("rejects --json and --mine outside non-interactive commands", () => {
    expect(() => parseArgs(["--json"])).toThrow("issue list");
    expect(() => parseArgs(["--mine"])).toThrow("issue list");
    expect(() => parseArgs(["auth", "status", "--workspace=w", "--mine"])).toThrow("issue list");
    expect(() => parseArgs(["--json=1"])).toThrow("does not accept a value");
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
