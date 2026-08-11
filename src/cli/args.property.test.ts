import fc from "fast-check";
import { expect, it } from "vite-plus/test";

import { parseArgs, UsageError, type Command } from "./args";
import type { UserConfig } from "../core/config";

const runs = { numRuns: 300 };

const COMMAND_KINDS = [
  "help",
  "version",
  "auth-status",
  "issue-list",
  "issue-view",
  "issue-create",
  "issue-update",
  "team-list",
  "project-list",
  "cycle-list",
  "tui",
];

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
];
const FLAG_KEYS = ["mock", "json", "mine", "all", "comments"];

const VALUE_POOL: Record<string, readonly string[]> = {
  workspace: ["acme", "Acme-1", "w0"],
  team: ["eng", "ENG_2", "x1"],
  title: ["Fix login", "T"],
  description: ["body text", "-bullet"],
  state: ["Todo", "In Progress"],
  assignee: ["sora", "me"],
  priority: ["2", "-1"],
  label: ["Bug"],
  cycle: ["24"],
  project: ["Launch"],
};

const ISSUE_FIELDS = [
  "title",
  "description",
  "state",
  "assignee",
  "priority",
  "label",
  "cycle",
  "project",
] as const;

interface CommandShape {
  readonly positionals: readonly string[];
  /** Option keys the command accepts on top of the required ones. */
  readonly values: readonly string[];
  readonly flags: readonly string[];
  readonly required: readonly string[];
  readonly hasJson: boolean;
}

const COMMANDS: readonly CommandShape[] = [
  { positionals: [], values: ["workspace", "team"], flags: ["mock"], required: [], hasJson: false },
  {
    positionals: ["auth", "status"],
    values: [],
    flags: ["mock", "json"],
    required: ["workspace"],
    hasJson: true,
  },
  {
    positionals: ["issue", "list"],
    values: ["workspace", "team"],
    flags: ["mock", "json", "mine", "all"],
    required: [],
    hasJson: true,
  },
  {
    positionals: ["issue", "view", "ENG-1"],
    values: ["workspace"],
    flags: ["mock", "json", "comments"],
    required: [],
    hasJson: true,
  },
  {
    positionals: ["issue", "create"],
    values: ISSUE_FIELDS.filter((field) => field !== "title"),
    flags: ["mock", "json"],
    required: ["workspace", "team", "title"],
    hasJson: true,
  },
  {
    positionals: ["issue", "update", "ENG-1"],
    values: ISSUE_FIELDS.filter((field) => field !== "title"),
    flags: ["mock", "json"],
    required: ["workspace", "title"],
    hasJson: true,
  },
  {
    positionals: ["team", "list"],
    values: ["workspace"],
    flags: ["mock", "json"],
    required: [],
    hasJson: true,
  },
  {
    positionals: ["project", "list"],
    values: ["workspace", "team"],
    flags: ["mock", "json"],
    required: [],
    hasJson: true,
  },
  {
    positionals: ["cycle", "list"],
    values: ["workspace"],
    flags: ["mock", "json"],
    required: ["team"],
    hasJson: true,
  },
];

function valueGroup(key: string, pick: number): string[] {
  const pool = VALUE_POOL[key] ?? ["x"];
  return [`--${key}`, pool[pick % pool.length] ?? "x"];
}

interface Invocation {
  readonly shape: CommandShape;
  readonly groups: readonly string[][];
  readonly order: readonly number[];
  readonly valueKeys: readonly string[];
  readonly flagKeys: readonly string[];
}

const invocationArb: fc.Arbitrary<Invocation> = fc.constantFrom(...COMMANDS).chain((shape) =>
  fc
    .record({
      optionals: fc.subarray([...shape.values]),
      flags: fc.subarray([...shape.flags]),
      picks: fc.array(fc.nat({ max: 5 }), { minLength: 12, maxLength: 12 }),
      order: fc.array(fc.nat({ max: 999 }), { minLength: 24, maxLength: 24 }),
    })
    .map(({ optionals, flags, picks, order }): Invocation => {
      const valueKeys = [...shape.required, ...optionals];
      return {
        shape,
        valueKeys,
        flagKeys: flags,
        groups: [
          ...valueKeys.map((key, index) => valueGroup(key, picks[index] ?? 0)),
          ...flags.map((flag) => [`--${flag}`]),
        ],
        order,
      };
    }),
);

function permuted(invocation: Invocation): string[][] {
  return invocation.groups
    .map((group, index) => ({ group, key: invocation.order[index] ?? 0 }))
    .sort((left, right) => left.key - right.key)
    .map((entry) => entry.group);
}

function argsOf(invocation: Invocation, groups = invocation.groups): string[] {
  return [...invocation.shape.positionals, ...groups.flat()];
}

const configArb: fc.Arbitrary<UserConfig> = fc.record(
  { workspace: fc.constantFrom("cfg-space", "other"), defaultTeam: fc.constantFrom("cfg", "tm2") },
  { requiredKeys: [] },
);

const JUNK_TOKENS = [
  "--",
  "-",
  "-x",
  "--=v",
  "--nope",
  "--json=1",
  "--workspace=",
  "--workspace=!!",
  "ENG-1",
  "acme",
  "",
  "あ",
];

/** Mutations of real invocations: a flat token soup almost never reaches a command branch. */
const junkArgsArb = fc
  .tuple(
    invocationArb,
    fc.constantFrom("drop", "duplicate", "insert", "swap", "truncate"),
    fc.nat({ max: 99 }),
    fc.constantFrom(...JUNK_TOKENS),
  )
  .map(([invocation, mutation, pick, junk]) => {
    const args = argsOf(invocation);
    if (args.length === 0) return [junk];
    const at = pick % args.length;
    switch (mutation) {
      case "drop":
        return [...args.slice(0, at), ...args.slice(at + 1)];
      case "duplicate":
        return [...args.slice(0, at), args[at] ?? "", ...args.slice(at)];
      case "insert":
        return [...args.slice(0, at), junk, ...args.slice(at)];
      case "swap":
        return [...args.slice(0, at), ...args.slice(at + 1), args[at] ?? ""];
      default:
        return args.slice(0, at);
    }
  });

const tokenSoupArb = fc.array(
  fc.constantFrom(
    ...JUNK_TOKENS,
    ...VALUE_KEYS.map((key) => `--${key}`),
    ...FLAG_KEYS.map((flag) => `--${flag}`),
    "auth",
    "status",
    "issue",
    "list",
    "view",
    "create",
    "update",
    "team",
    "project",
    "cycle",
  ),
  { maxLength: 8 },
);

const anyArgsArb = fc.oneof(
  { weight: 3, arbitrary: junkArgsArb },
  { weight: 2, arbitrary: tokenSoupArb },
);

function parsed(args: readonly string[], config: UserConfig = {}): Command | Error {
  try {
    return parseArgs(args, config);
  } catch (error) {
    return error instanceof Error ? error : new Error(`non-error throw: ${String(error)}`);
  }
}

it("answers any argument list with a command or a readable error", () => {
  fc.assert(
    fc.property(anyArgsArb, configArb, (args, config) => {
      const result = parsed(args, config);
      if (result instanceof Error) {
        expect(result.message.length).toBeGreaterThan(0);
        expect(result.message).not.toContain("non-error throw");
        expect(result instanceof TypeError || result instanceof RangeError).toBe(false);
        return;
      }
      expect(COMMAND_KINDS).toContain(result.kind);
    }),
    runs,
  );
});

it("parses deterministically", () => {
  fc.assert(
    fc.property(anyArgsArb, configArb, (args, config) => {
      expect(parsed(args, config)).toEqual(parsed(args, config));
    }),
    runs,
  );
});

it("accepts every well-formed invocation", () => {
  fc.assert(
    fc.property(invocationArb, (invocation) => {
      const result = parsed(argsOf(invocation));
      expect(result).not.toBeInstanceOf(Error);
    }),
    runs,
  );
});

it("ignores the order options are given in", () => {
  fc.assert(
    fc.property(invocationArb, (invocation) => {
      expect(parsed(argsOf(invocation, permuted(invocation)))).toEqual(parsed(argsOf(invocation)));
    }),
    runs,
  );
});

it("accepts options before the subcommand as well as after", () => {
  fc.assert(
    fc.property(invocationArb, (invocation) => {
      const leading = [...invocation.groups.flat(), ...invocation.shape.positionals];
      expect(parsed(leading)).toEqual(parsed(argsOf(invocation)));
    }),
    runs,
  );
});

it("treats --key=value and --key value as the same option", () => {
  fc.assert(
    fc.property(invocationArb, (invocation) => {
      const joined = invocation.groups.map((group) =>
        group.length === 2 ? [`${group[0] ?? ""}=${group[1] ?? ""}`] : group,
      );
      expect(parsed(argsOf(invocation, joined))).toEqual(parsed(argsOf(invocation)));
    }),
    runs,
  );
});

it("rejects any option given twice", () => {
  fc.assert(
    fc.property(invocationArb, fc.nat({ max: 20 }), (invocation, pick) => {
      if (invocation.groups.length === 0) return;
      const duplicate = invocation.groups[pick % invocation.groups.length] ?? [];
      const result = parsed(argsOf(invocation, [...invocation.groups, duplicate]));
      expect(result).toBeInstanceOf(UsageError);
      expect((result as Error).message).toContain("only be specified once");
    }),
    runs,
  );
});

it("rejects an option the command does not accept", () => {
  fc.assert(
    fc.property(invocationArb, fc.nat({ max: 99 }), fc.boolean(), (invocation, pick, asFlag) => {
      const accepted = [...invocation.shape.required, ...invocation.shape.values];
      const unsupported = asFlag
        ? FLAG_KEYS.filter((flag) => !invocation.shape.flags.includes(flag))
        : VALUE_KEYS.filter((key) => !accepted.includes(key));
      if (unsupported.length === 0) return;
      const key = unsupported[pick % unsupported.length] ?? "";
      const extra = asFlag ? [`--${key}`] : valueGroup(key, pick);
      const result = parsed(argsOf(invocation, [...invocation.groups, extra]));
      expect(result).toBeInstanceOf(UsageError);
      expect((result as Error).message).toContain(`--${key}`);
    }),
    runs,
  );
});

it("lets --help win over everything else", () => {
  fc.assert(
    fc.property(anyArgsArb, fc.nat({ max: 8 }), fc.boolean(), (args, at, short) => {
      const flag = short ? "-h" : "--help";
      const index = at % (args.length + 1);
      const withHelp = [...args.slice(0, index), flag, ...args.slice(index)];
      expect(parsed(withHelp)).toEqual({ kind: "help" });
    }),
    runs,
  );
});

it("lets --version win over every command but help", () => {
  fc.assert(
    fc.property(anyArgsArb, fc.nat({ max: 8 }), fc.boolean(), (args, at, short) => {
      if (args.includes("--help") || args.includes("-h")) return;
      const flag = short ? "-V" : "--version";
      const index = at % (args.length + 1);
      const withVersion = [...args.slice(0, index), flag, ...args.slice(index)];
      expect(parsed(withVersion)).toEqual({ kind: "version" });
    }),
    runs,
  );
});

it("always gives mock mode a workspace to talk to", () => {
  fc.assert(
    fc.property(anyArgsArb, configArb, (args, config) => {
      const result = parsed(args, config);
      if (result instanceof Error) return;
      if (!("connection" in result) || result.connection.mode !== "mock") return;
      expect(result.connection.workspace.length).toBeGreaterThan(0);
    }),
    runs,
  );
});

it("prefers an explicit --workspace over the configured one", () => {
  fc.assert(
    fc.property(invocationArb, configArb, (invocation, config) => {
      const withWorkspace = invocation.valueKeys.includes("workspace")
        ? invocation.groups
        : [...invocation.groups, ["--workspace", "explicit-ws"]];
      const result = parsed(argsOf(invocation, withWorkspace), config);
      if (result instanceof Error) return;
      if (!("connection" in result)) return;
      const expected =
        withWorkspace.find((group) => group[0] === "--workspace")?.[1] ?? "explicit-ws";
      expect(result.connection.workspace).toBe(expected);
    }),
    runs,
  );
});

it("reports --json exactly as it was given", () => {
  fc.assert(
    fc.property(invocationArb, (invocation) => {
      const result = parsed(argsOf(invocation));
      if (result instanceof Error) return;
      if (!("json" in result)) {
        expect(invocation.shape.hasJson).toBe(false);
        return;
      }
      expect(result.json).toBe(invocation.flagKeys.includes("json"));
    }),
    runs,
  );
});

it("uppercases every accepted team key", () => {
  fc.assert(
    fc.property(invocationArb, (invocation) => {
      const result = parsed(argsOf(invocation));
      if (result instanceof Error) return;
      if (!("team" in result) || result.team === undefined) return;
      expect(result.team).toBe(result.team.toUpperCase());
    }),
    runs,
  );
});

it("refuses to write without a target workspace", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(
        ["issue", "create", "--team", "eng", "--title", "T"],
        ["issue", "update", "ENG-1", "--title", "T"],
      ),
      fc.boolean(),
      (invocation, json) => {
        const result = parsed([...invocation, ...(json ? ["--json"] : [])]);
        expect(result).toBeInstanceOf(UsageError);
        expect((result as Error).message).toContain("--workspace");
      },
    ),
    runs,
  );
});
