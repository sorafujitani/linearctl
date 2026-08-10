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

  it("parses issue list with team, mine, all, and json options", () => {
    expect(parseArgs(["issue", "list"])).toEqual({
      kind: "issue-list",
      connection: { mode: "real" },
      mine: false,
      all: false,
      json: false,
    });
    expect(parseArgs(["issue", "list", "--team", "app", "--mine", "--all", "--json"])).toEqual({
      kind: "issue-list",
      connection: { mode: "real" },
      team: "APP",
      mine: true,
      all: true,
      json: true,
    });
    expect(parseArgs(["issue", "list", "--mock"])).toEqual({
      kind: "issue-list",
      connection: { mode: "mock", workspace: "sample-workspace" },
      mine: false,
      all: false,
      json: false,
    });
    // The config defaultTeam is a TUI preference; issue list scopes only on explicit --team.
    expect(parseArgs(["issue", "list"], { defaultTeam: "APP" })).toEqual({
      kind: "issue-list",
      connection: { mode: "real" },
      mine: false,
      all: false,
      json: false,
    });
  });

  it("parses issue view with an identifier and view options", () => {
    expect(parseArgs(["issue", "view", "APP-101", "--comments", "--json"])).toEqual({
      kind: "issue-view",
      connection: { mode: "real" },
      identifier: "APP-101",
      comments: true,
      json: true,
    });
    expect(() => parseArgs(["issue", "view"])).toThrow("Usage:");
    expect(() => parseArgs(["issue", "view", "APP-101", "APP-102"])).toThrow("Usage:");
  });

  it("parses issue create with required workspace, team, and title", () => {
    expect(
      parseArgs([
        "issue",
        "create",
        "--workspace=w",
        "--team",
        "app",
        "--title",
        "New issue",
        "--priority",
        "high",
        "--label",
        "Bug,Design",
      ]),
    ).toEqual({
      kind: "issue-create",
      connection: { mode: "real", workspace: "w" },
      team: "APP",
      fields: { title: "New issue", priority: "high", label: "Bug,Design" },
      json: false,
    });
    expect(() => parseArgs(["issue", "create", "--team", "APP", "--title", "x"])).toThrow(
      "--workspace",
    );
    expect(() => parseArgs(["issue", "create", "--workspace=w", "--title", "x"])).toThrow("--team");
    expect(() => parseArgs(["issue", "create", "--workspace=w", "--team", "APP"])).toThrow(
      "--title",
    );
  });

  it("parses issue update with an identifier and at least one field", () => {
    expect(
      parseArgs(["issue", "update", "APP-101", "--workspace=w", "--state", "In Progress"]),
    ).toEqual({
      kind: "issue-update",
      connection: { mode: "real", workspace: "w" },
      identifier: "APP-101",
      fields: { state: "In Progress" },
      json: false,
    });
    // The config workspace satisfies the write-workspace requirement.
    expect(
      parseArgs(["issue", "update", "APP-101", "--state", "Done"], { workspace: "w" }),
    ).toMatchObject({ kind: "issue-update", connection: { mode: "real", workspace: "w" } });
    expect(() => parseArgs(["issue", "update", "APP-101", "--state", "Done"])).toThrow(
      "--workspace",
    );
    expect(() => parseArgs(["issue", "update", "APP-101", "--workspace=w"])).toThrow(
      "at least one field",
    );
    expect(() =>
      parseArgs(["issue", "update", "APP-101", "--workspace=w", "--title", " "]),
    ).toThrow("non-empty --title");
  });

  it("accepts values with a single leading dash and rejects one-dash options", () => {
    expect(
      parseArgs(["issue", "update", "APP-1", "--workspace=w", "--description", "- bullet one"]),
    ).toMatchObject({ fields: { description: "- bullet one" } });
    expect(() => parseArgs(["-Xtitle=hacked", "issue", "update", "APP-1"])).toThrow(
      "Unknown option: -Xtitle",
    );
    expect(() => parseArgs(["issue", "list", "--team", "--json"])).toThrow("requires a team key");
  });

  it("parses team, project, and cycle listings", () => {
    expect(parseArgs(["team", "list", "--json"])).toEqual({
      kind: "team-list",
      connection: { mode: "real" },
      json: true,
    });
    expect(parseArgs(["project", "list", "--team", "app"])).toEqual({
      kind: "project-list",
      connection: { mode: "real" },
      team: "APP",
      json: false,
    });
    expect(parseArgs(["cycle", "list", "--team", "app"])).toEqual({
      kind: "cycle-list",
      connection: { mode: "real" },
      team: "APP",
      json: false,
    });
    expect(() => parseArgs(["cycle", "list"])).toThrow("--team");
  });

  it("rejects options a command does not support", () => {
    expect(() => parseArgs(["--title", "x"])).toThrow("not supported");
    expect(() => parseArgs(["team", "list", "--team", "APP"])).toThrow("not supported");
    expect(() => parseArgs(["issue", "view", "APP-1", "--mine"])).toThrow("issue list");
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
