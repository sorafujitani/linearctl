import { parseTeamKey, parseWorkspaceSlug, type UserConfig } from "./config";
import type { ClientMode } from "./client-factory";

export type TuiConnection =
  | { mode: "real"; workspace?: string }
  | { mode: "mock"; workspace: string };

export type AuthStatusConnection =
  | { mode: "real"; workspace: string }
  | { mode: "mock"; workspace: string };

export type Command =
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "auth-status"; connection: AuthStatusConnection; json: boolean }
  | { kind: "issue-list"; connection: TuiConnection; team?: string; mine: boolean; json: boolean }
  | { kind: "tui"; connection: TuiConnection; defaultTeam?: string };

export class UsageError extends Error {
  override name = "UsageError";
}

function extractOptions(args: readonly string[]): {
  workspace: string | undefined;
  team: string | undefined;
  mode: ClientMode;
  json: boolean;
  mine: boolean;
  rest: string[];
} {
  let workspace: string | undefined;
  let team: string | undefined;
  let mock = false;
  let json = false;
  let mine = false;
  const rest: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--workspace") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("-")) {
        throw new UsageError("--workspace requires a slug.");
      }
      if (workspace !== undefined) {
        throw new UsageError("--workspace may only be specified once.");
      }
      workspace = parseWorkspaceSlug(value);
      index += 1;
      continue;
    }
    if (argument?.startsWith("--workspace=")) {
      if (workspace !== undefined) {
        throw new UsageError("--workspace may only be specified once.");
      }
      workspace = parseWorkspaceSlug(argument.slice("--workspace=".length));
      continue;
    }
    if (argument === "--mock") {
      if (mock) {
        throw new UsageError("--mock may only be specified once.");
      }
      mock = true;
      continue;
    }
    if (argument === "--team") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("-")) {
        throw new UsageError("--team requires a team key.");
      }
      if (team !== undefined) throw new UsageError("--team may only be specified once.");
      team = parseTeamKey(value);
      index += 1;
      continue;
    }
    if (argument?.startsWith("--team=")) {
      if (team !== undefined) throw new UsageError("--team may only be specified once.");
      team = parseTeamKey(argument.slice("--team=".length));
      continue;
    }
    if (argument === "--json") {
      if (json) throw new UsageError("--json may only be specified once.");
      json = true;
      continue;
    }
    if (argument === "--mine") {
      if (mine) throw new UsageError("--mine may only be specified once.");
      mine = true;
      continue;
    }
    if (
      argument?.startsWith("--mock=") ||
      argument?.startsWith("--json=") ||
      argument?.startsWith("--mine=")
    ) {
      throw new UsageError(`${argument.split("=")[0]} does not accept a value.`);
    }
    if (argument !== undefined) {
      rest.push(argument);
    }
  }

  return { workspace, team, mode: mock ? "mock" : "real", json, mine, rest };
}

export function parseArgs(args: readonly string[], defaults: UserConfig = {}): Command {
  if (args.includes("--help") || args.includes("-h")) {
    return { kind: "help" };
  }
  if (args.includes("--version") || args.includes("-V")) {
    return { kind: "version" };
  }

  const options = extractOptions(args);
  const { mode, rest, json, mine } = options;
  const workspace = options.workspace ?? defaults.workspace;
  const defaultTeam = options.team ?? defaults.defaultTeam;
  const connection: TuiConnection =
    mode === "mock"
      ? { mode, workspace: options.workspace ?? "sample-workspace" }
      : workspace === undefined
        ? { mode }
        : { mode, workspace };
  if (rest.length === 0) {
    if (json) throw new UsageError("--json requires a non-interactive command such as issue list.");
    if (mine) throw new UsageError("--mine requires the issue list command.");
    return {
      kind: "tui",
      connection,
      ...(defaultTeam === undefined ? {} : { defaultTeam }),
    };
  }

  if (rest[0] === "auth" && rest[1] === "status" && rest.length === 2) {
    if (mine) throw new UsageError("--mine requires the issue list command.");
    if (workspace === undefined) {
      throw new UsageError("auth status requires --workspace <slug>.");
    }
    return { kind: "auth-status", connection: { mode, workspace }, json };
  }

  if (rest[0] === "issue" && rest[1] === "list" && rest.length === 2) {
    // --team scopes to that team's issues; --mine narrows to the viewer. With
    // neither, the list is the viewer's issues across every team.
    return {
      kind: "issue-list",
      connection,
      ...(options.team === undefined ? {} : { team: options.team }),
      mine,
      json,
    };
  }

  const unknown = rest.find((argument) => argument.startsWith("-"));
  if (unknown !== undefined) {
    throw new UsageError(`Unknown option: ${unknown}`);
  }
  throw new UsageError(`Unknown command: ${rest.join(" ")}`);
}
