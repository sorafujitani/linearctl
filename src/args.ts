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
  | { kind: "auth-status"; connection: AuthStatusConnection }
  | { kind: "tui"; connection: TuiConnection; defaultTeam?: string };

export class UsageError extends Error {
  override name = "UsageError";
}

function extractOptions(args: readonly string[]): {
  workspace: string | undefined;
  team: string | undefined;
  mode: ClientMode;
  rest: string[];
} {
  let workspace: string | undefined;
  let team: string | undefined;
  let mock = false;
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
    if (argument?.startsWith("--mock=")) {
      throw new UsageError("--mock does not accept a value.");
    }
    if (argument !== undefined) {
      rest.push(argument);
    }
  }

  return { workspace, team, mode: mock ? "mock" : "real", rest };
}

export function parseArgs(args: readonly string[], defaults: UserConfig = {}): Command {
  if (args.includes("--help") || args.includes("-h")) {
    return { kind: "help" };
  }
  if (args.includes("--version") || args.includes("-V")) {
    return { kind: "version" };
  }

  const options = extractOptions(args);
  const { mode, rest } = options;
  const workspace = options.workspace ?? defaults.workspace;
  const defaultTeam = options.team ?? defaults.defaultTeam;
  if (rest.length === 0) {
    if (mode === "mock") {
      return {
        kind: "tui",
        connection: { mode, workspace: options.workspace ?? "fs0414" },
        ...(defaultTeam === undefined ? {} : { defaultTeam }),
      };
    }
    return {
      kind: "tui",
      connection: workspace === undefined ? { mode } : { mode, workspace },
      ...(defaultTeam === undefined ? {} : { defaultTeam }),
    };
  }

  if (rest[0] === "auth" && rest[1] === "status" && rest.length === 2) {
    if (workspace === undefined) {
      throw new UsageError("auth status requires --workspace <slug>.");
    }
    return { kind: "auth-status", connection: { mode, workspace } };
  }

  const unknown = rest.find((argument) => argument.startsWith("-"));
  if (unknown !== undefined) {
    throw new UsageError(`Unknown option: ${unknown}`);
  }
  throw new UsageError(`Unknown command: ${rest.join(" ")}`);
}
