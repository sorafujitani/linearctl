import { parseArgs, UsageError, type Command } from "./args";
import { buildCreateInput, buildIssueChanges } from "./mutate";
import {
  authStatusJson,
  authStatusText,
  cycleListJson,
  cycleListText,
  issueCreatedText,
  issueListJson,
  issueListText,
  issueUpdatedText,
  issueViewJson,
  issueViewText,
  projectListJson,
  projectListText,
  teamListJson,
  teamListText,
  updatedIssueJson,
} from "./output";
import { createClient } from "../core/client-factory";
import { loadUserConfig } from "../core/config";
import type { IssueScope, Team, UpdatedIssue } from "../core/domain";
import { assertWorkspace, type LinearClient } from "../core/linear-client";
import { runTui } from "../tui/tui";
import { VERSION } from "../core/version";

const HELP = `linearctl - Linear terminal UI and CLI

Usage:
  linearctl [--mock] [--workspace <slug>] [--team <key>]
  linearctl auth status --workspace <slug> [--json]
  linearctl issue list [--team <key>] [--mine] [--all] [--json]
  linearctl issue view <identifier> [--comments] [--json]
  linearctl issue create --workspace <slug> --team <key> --title <text> [field options]
  linearctl issue update <identifier> --workspace <slug> [field options]
  linearctl team list [--json]
  linearctl project list [--team <key>] [--json]
  linearctl cycle list --team <key> [--json]
  linearctl --help
  linearctl --version

Environment:
  LINEAR_API_KEY    Linear personal API key (required outside mock mode)
  XDG_CONFIG_HOME   Override the default config directory

Config:
  \${XDG_CONFIG_HOME:-~/.config}/linearctl/config.json

Options:
  --workspace <slug>  Verify the connected workspace urlKey; required for
                      issue create and issue update (a config workspace counts)
  --team <key>        Prefer this Team in Team, Cycle, and Project catalogs;
                      scope issue/project/cycle listings and issue create
  --mine              issue list: narrow --team to your own assignments
                      (without --team the list is already yours)
  --all               issue list: include completed and canceled issues
  --comments          issue view: include the comment thread
  --json              Print machine-readable JSON (non-interactive commands)
  --mock              Use mock data only (no API key or network)
  -h, --help          Show help
  -V, --version       Show version

Issue field options (issue create / issue update):
  --title <text>        Issue title
  --description <text>  Issue description (Markdown)
  --state <name>        Workflow state name within the issue's team
  --assignee <name>     Team member name, or "none" to unassign
  --priority <value>    0-4, Urgent/High/Medium/Low, or "none"
  --label <names>       Comma-separated label names (replaces all labels),
                        or "none" to clear
  --cycle <number>      Cycle number, "current", or "none"
  --project <name>      Active project name, or "none"
`;

function fail(message: string, includeHelpHint = false): never {
  process.stderr.write(`error: ${message}\n`);
  if (includeHelpHint) {
    process.stderr.write("Run linearctl --help for details.\n");
  }
  process.exit(1);
}

async function resolveTeam(client: LinearClient, key: string): Promise<Team> {
  const teams = await client.getTeams();
  const team = teams.find(
    (candidate) => candidate.key.toLocaleLowerCase() === key.toLocaleLowerCase(),
  );
  if (team === undefined) fail(`Team not found: ${key}`);
  return team;
}

async function applyIssueChanges(
  client: LinearClient,
  command: Extract<Command, { kind: "issue-update" }>,
): Promise<void> {
  const issue = await client.getIssue(command.identifier);
  const changes = await buildIssueChanges(client, issue, command.fields);
  let updated: UpdatedIssue | undefined;
  const applied: string[] = [];
  for (const change of changes) {
    try {
      updated = await client.updateIssue(change);
    } catch (error) {
      // Fields apply one bounded mutation at a time, so a mid-sequence
      // failure leaves earlier fields changed; say so before failing.
      if (applied.length > 0) {
        process.stderr.write(
          `Applied before the failure: ${applied.join(", ")}. Failed at: ${change.kind}.\n`,
        );
      }
      throw error;
    }
    applied.push(change.kind);
  }
  if (updated === undefined) fail("No changes were applied.");
  process.stdout.write(
    command.json
      ? updatedIssueJson(issue.identifier, updated)
      : issueUpdatedText(issue.identifier, updated),
  );
}

async function main(): Promise<void> {
  let command: Command;
  try {
    const args = Bun.argv.slice(2);
    const skipConfig = args.some((argument) =>
      ["--help", "-h", "--version", "-V"].includes(argument),
    );
    const config = skipConfig ? {} : await loadUserConfig(process.env);
    command = parseArgs(args, config);
  } catch (error) {
    if (error instanceof UsageError || error instanceof Error) {
      fail(error.message, true);
    }
    fail("Could not parse the command line.", true);
  }

  if (command.kind === "help") {
    process.stdout.write(HELP);
    return;
  }
  if (command.kind === "version") {
    process.stdout.write(`linearctl ${VERSION}\n`);
    return;
  }
  if (command.kind === "tui" && (!process.stdin.isTTY || !process.stdout.isTTY)) {
    fail("The TUI requires an interactive terminal. Use the non-interactive commands instead.");
  }

  const client = createClient(command.connection.mode, process.env);
  let status;
  try {
    status = await client.getAuthStatus();
    assertWorkspace(command.connection.workspace, status.workspace);
  } catch (error) {
    const fallback =
      command.connection.mode === "mock"
        ? "Mock workspace verification failed."
        : "Linear connection verification failed.";
    fail(error instanceof Error ? error.message : fallback);
  }

  switch (command.kind) {
    case "auth-status": {
      process.stdout.write(
        command.json
          ? authStatusJson(status, command.connection.mode)
          : authStatusText(status, command.connection.mode),
      );
      return;
    }
    case "issue-list": {
      let scope: IssueScope = { kind: "assigned-to-me" };
      if (command.team !== undefined) {
        const team = await resolveTeam(client, command.team);
        scope = command.mine
          ? { kind: "assigned-to-me", teamId: team.id }
          : { kind: "team", teamId: team.id };
      }
      const page = await client.getIssues(scope, { includeDone: command.all });
      process.stdout.write(command.json ? issueListJson(page) : issueListText(page));
      return;
    }
    case "issue-view": {
      const issue = await client.getIssue(command.identifier);
      const comments = command.comments ? await client.getIssueComments(issue.id) : undefined;
      process.stdout.write(
        command.json ? issueViewJson(issue, comments) : issueViewText(issue, comments),
      );
      return;
    }
    case "issue-create": {
      const team = await resolveTeam(client, command.team);
      const input = await buildCreateInput(client, team, command.fields);
      const issue = await client.createIssue(input);
      process.stdout.write(command.json ? issueViewJson(issue) : issueCreatedText(issue));
      return;
    }
    case "issue-update": {
      await applyIssueChanges(client, command);
      return;
    }
    case "team-list": {
      const teams = await client.getTeams();
      process.stdout.write(command.json ? teamListJson(teams) : teamListText(teams));
      return;
    }
    case "project-list": {
      const teamId =
        command.team === undefined ? undefined : (await resolveTeam(client, command.team)).id;
      const page = await client.getActiveProjects(teamId);
      process.stdout.write(command.json ? projectListJson(page) : projectListText(page));
      return;
    }
    case "cycle-list": {
      const team = await resolveTeam(client, command.team);
      const cycles = await client.getTeamCycles(team.id);
      process.stdout.write(command.json ? cycleListJson(cycles) : cycleListText(cycles));
      return;
    }
    case "tui": {
      await runTui({
        client,
        workspace: status.workspace,
        mode: command.connection.mode,
        ...(command.defaultTeam === undefined ? {} : { defaultTeam: command.defaultTeam }),
      });
      return;
    }
  }
}

export async function runCli(): Promise<void> {
  try {
    await main();
  } catch (error) {
    fail(error instanceof Error ? error.message : "An unexpected error occurred.");
  }
}
