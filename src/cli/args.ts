import type { ClientMode } from "../core/client-factory";
import { parseTeamKey, parseWorkspaceSlug, type UserConfig } from "../core/config";

export type TuiConnection =
  | { mode: "real"; workspace?: string }
  | { mode: "mock"; workspace: string };

export type AuthStatusConnection =
  | { mode: "real"; workspace: string }
  | { mode: "mock"; workspace: string };

/** Raw issue field options; name-to-ID resolution happens against the client. */
export interface IssueFieldArgs {
  title?: string;
  description?: string;
  state?: string;
  assignee?: string;
  priority?: string;
  label?: string;
  cycle?: string;
  project?: string;
}

export type Command =
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "auth-status"; connection: AuthStatusConnection; json: boolean }
  | {
      kind: "issue-list";
      connection: TuiConnection;
      team?: string;
      mine: boolean;
      all: boolean;
      json: boolean;
    }
  | {
      kind: "issue-view";
      connection: TuiConnection;
      identifier: string;
      comments: boolean;
      json: boolean;
    }
  | {
      kind: "issue-create";
      connection: TuiConnection;
      team: string;
      fields: IssueFieldArgs;
      json: boolean;
    }
  | {
      kind: "issue-update";
      connection: TuiConnection;
      identifier: string;
      fields: IssueFieldArgs;
      json: boolean;
    }
  | { kind: "team-list"; connection: TuiConnection; json: boolean }
  | { kind: "project-list"; connection: TuiConnection; team?: string; json: boolean }
  | { kind: "cycle-list"; connection: TuiConnection; team: string; json: boolean }
  | { kind: "tui"; connection: TuiConnection; defaultTeam?: string };

export class UsageError extends Error {
  override name = "UsageError";
}

const VALUE_KEYS = [
  "workspace",
  "team",
  "title",
  "description",
  "state",
  "assignee",
  "priority",
  "label",
  "cycle",
  "project",
] as const;
const FLAG_KEYS = ["mock", "json", "mine", "all", "comments"] as const;

type ValueKey = (typeof VALUE_KEYS)[number];
type FlagKey = (typeof FLAG_KEYS)[number];

const VALUE_PARSERS: Partial<Record<ValueKey, (raw: string) => string>> = {
  workspace: parseWorkspaceSlug,
  team: parseTeamKey,
};

const VALUE_REQUIREMENTS: Partial<Record<ValueKey, string>> = {
  workspace: "--workspace requires a slug.",
  team: "--team requires a team key.",
};

interface Options {
  values: Partial<Record<ValueKey, string>>;
  flags: Record<FlagKey, boolean>;
  rest: string[];
}

function isValueKey(name: string): name is ValueKey {
  return (VALUE_KEYS as readonly string[]).includes(name);
}

function isFlagKey(name: string): name is FlagKey {
  return (FLAG_KEYS as readonly string[]).includes(name);
}

function parseValue(key: ValueKey, raw: string): string {
  const parser = VALUE_PARSERS[key];
  return parser === undefined ? raw : parser(raw);
}

function extractOptions(args: readonly string[]): Options {
  const values: Partial<Record<ValueKey, string>> = {};
  const flags: Record<FlagKey, boolean> = {
    mock: false,
    json: false,
    mine: false,
    all: false,
    comments: false,
  };
  const rest: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === undefined) continue;
    if (!argument.startsWith("-")) {
      rest.push(argument);
      continue;
    }
    if (!argument.startsWith("--")) {
      throw new UsageError(`Unknown option: ${argument.split("=")[0]}`);
    }
    const equals = argument.indexOf("=");
    const name = equals === -1 ? argument.slice(2) : argument.slice(2, equals);
    if (isValueKey(name)) {
      if (values[name] !== undefined) {
        throw new UsageError(`--${name} may only be specified once.`);
      }
      if (equals !== -1) {
        values[name] = parseValue(name, argument.slice(equals + 1));
        continue;
      }
      const value = args[index + 1];
      // A single leading dash is a legal value (negative numbers, Markdown
      // bullets); only another long option means the value is missing.
      if (value === undefined || value.startsWith("--")) {
        throw new UsageError(VALUE_REQUIREMENTS[name] ?? `--${name} requires a value.`);
      }
      values[name] = parseValue(name, value);
      index += 1;
      continue;
    }
    if (isFlagKey(name)) {
      if (equals !== -1) {
        throw new UsageError(`--${name} does not accept a value.`);
      }
      if (flags[name]) {
        throw new UsageError(`--${name} may only be specified once.`);
      }
      flags[name] = true;
      continue;
    }
    throw new UsageError(`Unknown option: ${argument.split("=")[0]}`);
  }

  return { values, flags, rest };
}

const ISSUE_FIELD_KEYS = [
  "title",
  "description",
  "state",
  "assignee",
  "priority",
  "label",
  "cycle",
  "project",
] as const satisfies readonly ValueKey[];

interface CommandSpec {
  name: string;
  values: readonly ValueKey[];
  flags: readonly FlagKey[];
}

const COMMAND_SPECS = {
  tui: { name: "the TUI", values: ["workspace", "team"], flags: ["mock"] },
  "auth status": { name: "auth status", values: ["workspace"], flags: ["mock", "json"] },
  "issue list": {
    name: "issue list",
    values: ["workspace", "team"],
    flags: ["mock", "json", "mine", "all"],
  },
  "issue view": {
    name: "issue view",
    values: ["workspace"],
    flags: ["mock", "json", "comments"],
  },
  "issue create": {
    name: "issue create",
    values: ["workspace", "team", ...ISSUE_FIELD_KEYS],
    flags: ["mock", "json"],
  },
  "issue update": {
    name: "issue update",
    values: ["workspace", ...ISSUE_FIELD_KEYS],
    flags: ["mock", "json"],
  },
  "team list": { name: "team list", values: ["workspace"], flags: ["mock", "json"] },
  "project list": {
    name: "project list",
    values: ["workspace", "team"],
    flags: ["mock", "json"],
  },
  "cycle list": {
    name: "cycle list",
    values: ["workspace", "team"],
    flags: ["mock", "json"],
  },
} as const satisfies Record<string, CommandSpec>;

function assertSupported(options: Options, spec: CommandSpec): void {
  for (const key of VALUE_KEYS) {
    if (options.values[key] !== undefined && !spec.values.includes(key)) {
      throw new UsageError(`--${key} is not supported by ${spec.name}.`);
    }
  }
  for (const key of FLAG_KEYS) {
    if (!options.flags[key] || spec.flags.includes(key)) continue;
    if (key === "mine") {
      throw new UsageError("--mine requires the issue list command.");
    }
    if (key === "json") {
      throw new UsageError("--json requires a non-interactive command such as issue list.");
    }
    throw new UsageError(`--${key} is not supported by ${spec.name}.`);
  }
}

function issueFields(options: Options): IssueFieldArgs {
  const fields: IssueFieldArgs = {};
  for (const key of ISSUE_FIELD_KEYS) {
    const value = options.values[key];
    if (value !== undefined) fields[key] = value;
  }
  return fields;
}

/** Writes must state their target workspace explicitly (option or config); mock always has one. */
function requireWriteWorkspace(connection: TuiConnection, commandName: string): void {
  if (connection.workspace === undefined) {
    throw new UsageError(
      `${commandName} requires --workspace <slug> (or a config workspace) so writes cannot land in an unintended workspace.`,
    );
  }
}

function requirePositional(rest: readonly string[], usage: string): string {
  const positional = rest[2];
  if (positional === undefined || rest.length !== 3) {
    throw new UsageError(`Usage: ${usage}`);
  }
  return positional;
}

export function parseArgs(args: readonly string[], defaults: UserConfig = {}): Command {
  if (args.includes("--help") || args.includes("-h")) {
    return { kind: "help" };
  }
  if (args.includes("--version") || args.includes("-V")) {
    return { kind: "version" };
  }

  const options = extractOptions(args);
  const { flags, rest } = options;
  const mode: ClientMode = flags.mock ? "mock" : "real";
  const workspace = options.values.workspace ?? defaults.workspace;
  const connection: TuiConnection =
    mode === "mock"
      ? { mode, workspace: options.values.workspace ?? "sample-workspace" }
      : workspace === undefined
        ? { mode }
        : { mode, workspace };

  if (rest.length === 0) {
    const spec = COMMAND_SPECS["tui"];
    assertSupported(options, spec);
    const defaultTeam = options.values.team ?? defaults.defaultTeam;
    return {
      kind: "tui",
      connection,
      ...(defaultTeam === undefined ? {} : { defaultTeam }),
    };
  }

  const commandKey = `${rest[0]} ${rest[1]}`;

  if (commandKey === "auth status") {
    assertSupported(options, COMMAND_SPECS["auth status"]);
    if (rest.length !== 2) throw new UsageError(`Unknown command: ${rest.join(" ")}`);
    if (workspace === undefined) {
      throw new UsageError("auth status requires --workspace <slug>.");
    }
    return { kind: "auth-status", connection: { mode, workspace }, json: flags.json };
  }

  if (commandKey === "issue list") {
    assertSupported(options, COMMAND_SPECS["issue list"]);
    if (rest.length !== 2) throw new UsageError(`Unknown command: ${rest.join(" ")}`);
    // --team scopes to that team's issues; --mine narrows to the viewer. With
    // neither, the list is the viewer's issues across every team. The config
    // defaultTeam is a TUI preference and never scopes non-interactive reads.
    return {
      kind: "issue-list",
      connection,
      ...(options.values.team === undefined ? {} : { team: options.values.team }),
      mine: flags.mine,
      all: flags.all,
      json: flags.json,
    };
  }

  if (commandKey === "issue view") {
    assertSupported(options, COMMAND_SPECS["issue view"]);
    const identifier = requirePositional(rest, "linearctl issue view <identifier>");
    return {
      kind: "issue-view",
      connection,
      identifier,
      comments: flags.comments,
      json: flags.json,
    };
  }

  if (commandKey === "issue create") {
    assertSupported(options, COMMAND_SPECS["issue create"]);
    if (rest.length !== 2) throw new UsageError(`Unknown command: ${rest.join(" ")}`);
    requireWriteWorkspace(connection, "issue create");
    const team = options.values.team;
    if (team === undefined) throw new UsageError("issue create requires --team <key>.");
    const fields = issueFields(options);
    if (fields.title === undefined || fields.title.trim().length === 0) {
      throw new UsageError("issue create requires --title <text>.");
    }
    return { kind: "issue-create", connection, team, fields, json: flags.json };
  }

  if (commandKey === "issue update") {
    assertSupported(options, COMMAND_SPECS["issue update"]);
    requireWriteWorkspace(connection, "issue update");
    const identifier = requirePositional(
      rest,
      "linearctl issue update <identifier> --<field> <value>",
    );
    const fields = issueFields(options);
    if (Object.keys(fields).length === 0) {
      throw new UsageError(
        "issue update requires at least one field option (--title, --description, --state, --assignee, --priority, --label, --cycle, --project).",
      );
    }
    if (fields.title !== undefined && fields.title.trim().length === 0) {
      throw new UsageError("issue update requires a non-empty --title.");
    }
    return { kind: "issue-update", connection, identifier, fields, json: flags.json };
  }

  if (commandKey === "team list") {
    assertSupported(options, COMMAND_SPECS["team list"]);
    if (rest.length !== 2) throw new UsageError(`Unknown command: ${rest.join(" ")}`);
    return { kind: "team-list", connection, json: flags.json };
  }

  if (commandKey === "project list") {
    assertSupported(options, COMMAND_SPECS["project list"]);
    if (rest.length !== 2) throw new UsageError(`Unknown command: ${rest.join(" ")}`);
    return {
      kind: "project-list",
      connection,
      ...(options.values.team === undefined ? {} : { team: options.values.team }),
      json: flags.json,
    };
  }

  if (commandKey === "cycle list") {
    assertSupported(options, COMMAND_SPECS["cycle list"]);
    if (rest.length !== 2) throw new UsageError(`Unknown command: ${rest.join(" ")}`);
    const team = options.values.team;
    if (team === undefined) throw new UsageError("cycle list requires --team <key>.");
    return { kind: "cycle-list", connection, team, json: flags.json };
  }

  throw new UsageError(`Unknown command: ${rest.join(" ")}`);
}
