#!/usr/bin/env bun

import { parseArgs, UsageError } from "./args";
import { authStatusJson, authStatusText, issueListJson, issueListText } from "./cli-output";
import { createClient } from "./client-factory";
import { loadUserConfig } from "./config";
import type { IssueScope } from "./domain";
import { assertWorkspace } from "./linear-client";
import { runTui } from "./tui";
import { VERSION } from "./version";

const HELP = `linearctl - Linear terminal UI

Usage:
  linearctl [--mock] [--workspace <slug>] [--team <key>]
  linearctl auth status [--mock] --workspace <slug> [--json]
  linearctl issue list [--mock] [--workspace <slug>] [--team <key>] [--mine] [--json]
  linearctl --help
  linearctl --version

Environment:
  LINEAR_API_KEY    Linear personal API key (required outside mock mode)
  XDG_CONFIG_HOME   Override the default config directory

Config:
  \${XDG_CONFIG_HOME:-~/.config}/linearctl/config.json

Options:
  --workspace <slug>  Verify the connected workspace urlKey
  --team <key>        Prefer this Team in Team, Cycle, and Project catalogs;
                      scope issue list to this team's issues
  --mine              issue list: narrow --team to your own assignments
                      (without --team the list is already yours)
  --json              Print machine-readable JSON (auth status, issue list)
  --mock              Use mock data only (no API key or network)
  -h, --help          Show help
  -V, --version       Show version
`;

function fail(message: string, includeHelpHint = false): never {
  process.stderr.write(`error: ${message}\n`);
  if (includeHelpHint) {
    process.stderr.write("Run linearctl --help for details.\n");
  }
  process.exit(1);
}

async function main(): Promise<void> {
  let command;
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
    fail("The TUI requires an interactive terminal. Use auth status in non-TTY environments.");
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

  if (command.kind === "auth-status") {
    process.stdout.write(
      command.json
        ? authStatusJson(status, command.connection.mode)
        : authStatusText(status, command.connection.mode),
    );
    return;
  }

  if (command.kind === "issue-list") {
    let scope: IssueScope = { kind: "assigned-to-me" };
    if (command.team !== undefined) {
      const teams = await client.getTeams();
      const team = teams.find(
        (candidate) => candidate.key.toLocaleLowerCase() === command.team?.toLocaleLowerCase(),
      );
      if (team === undefined) fail(`Team not found: ${command.team}`);
      scope = command.mine
        ? { kind: "assigned-to-me", teamId: team.id }
        : { kind: "team", teamId: team.id };
    }
    const page = await client.getIssues(scope);
    process.stdout.write(command.json ? issueListJson(page) : issueListText(page));
    return;
  }

  await runTui({
    client,
    workspace: status.workspace,
    mode: command.connection.mode,
    ...(command.defaultTeam === undefined ? {} : { defaultTeam: command.defaultTeam }),
  });
}

try {
  await main();
} catch (error) {
  fail(error instanceof Error ? error.message : "An unexpected error occurred.");
}
