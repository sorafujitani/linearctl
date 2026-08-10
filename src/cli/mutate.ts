import {
  PRIORITY_LABELS,
  type Issue,
  type IssueChange,
  type IssueCreateInput,
  type Team,
} from "../core/domain";
import type { LinearClient } from "../core/linear-client";
import type { IssueFieldArgs } from "./args";

const NONE = "none";

function isNone(value: string): boolean {
  return value.trim().toLocaleLowerCase() === NONE;
}

function findByName<T>(
  candidates: readonly T[],
  name: (candidate: T) => string,
  raw: string,
  describe: string,
): T {
  const normalized = raw.trim().toLocaleLowerCase();
  const matches = candidates.filter(
    (candidate) => name(candidate).toLocaleLowerCase() === normalized,
  );
  const match = matches[0];
  if (match === undefined) {
    throw new Error(`${describe} not found: ${raw}. Available: ${listNames(candidates, name)}`);
  }
  if (matches.length > 1) {
    throw new Error(
      `${describe} is ambiguous: ${raw} matches ${matches.length} entries. Rename one in Linear or update through the TUI, which selects by ID.`,
    );
  }
  return match;
}

function listNames<T>(candidates: readonly T[], name: (candidate: T) => string): string {
  const names = candidates.map(name);
  if (names.length === 0) return "(none)";
  const shown = names.slice(0, 10);
  const more = names.length - shown.length;
  return more > 0 ? `${shown.join(", ")} … and ${more} more` : shown.join(", ");
}

/** Accepts 0-4, a Linear priority label, or "none" (no priority). */
export function parsePriority(raw: string): number {
  const trimmed = raw.trim();
  if (/^[0-4]$/.test(trimmed)) return Number(trimmed);
  if (isNone(trimmed)) return 0;
  const index = PRIORITY_LABELS.findIndex(
    (label) => label.toLocaleLowerCase() === trimmed.toLocaleLowerCase(),
  );
  if (index === -1) {
    throw new Error(
      `Invalid priority: ${raw}. Use 0-4 or one of: ${PRIORITY_LABELS.join(", ")}, none.`,
    );
  }
  return index;
}

async function resolveStateId(client: LinearClient, team: Team, raw: string): Promise<string> {
  const states = await client.getWorkflowStates(team.id);
  return findByName(states, (state) => state.name, raw, `State in team ${team.key}`).id;
}

async function resolveAssigneeId(
  client: LinearClient,
  team: Team,
  raw: string,
): Promise<string | null> {
  if (isNone(raw)) return null;
  const members = await client.getTeamMembers(team.id);
  return findByName(members, (member) => member.name, raw, `Member of team ${team.key}`).id;
}

async function resolveCycleId(
  client: LinearClient,
  team: Team,
  raw: string,
): Promise<string | null> {
  if (isNone(raw)) return null;
  const cycles = await client.getTeamCycles(team.id);
  if (raw.trim().toLocaleLowerCase() === "current") {
    const active = cycles.find((cycle) => cycle.isActive);
    if (active === undefined) throw new Error(`Team ${team.key} has no active cycle.`);
    return active.id;
  }
  const number = Number(raw.trim());
  if (!Number.isInteger(number)) {
    throw new Error(`Invalid cycle: ${raw}. Use a cycle number, "current", or "none".`);
  }
  const cycle = cycles.find((candidate) => candidate.number === number);
  if (cycle === undefined) {
    const available = cycles.map((candidate) => `#${candidate.number}`).join(", ") || "(none)";
    // The read is bounded to the 50 most recently updated cycles, so an old
    // cycle can exist upstream without appearing here.
    const bounded =
      cycles.length >= 50 ? " Only the 50 most recently updated cycles were searched." : "";
    throw new Error(
      `Cycle #${number} not found in team ${team.key}. Available: ${available}.${bounded}`,
    );
  }
  return cycle.id;
}

async function resolveProjectId(
  client: LinearClient,
  team: Team,
  raw: string,
): Promise<string | null> {
  if (isNone(raw)) return null;
  const page = await client.getActiveProjects(team.id);
  return findByName(
    page.projects,
    (project) => project.name,
    raw,
    `Active project of team ${team.key}`,
  ).id;
}

/** Comma-separated label names; only an explicit "none" clears every label. Enforces the owning-team boundary. */
async function resolveLabelIds(client: LinearClient, team: Team, raw: string): Promise<string[]> {
  if (isNone(raw)) return [];
  const names = raw
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
  if (names.length === 0) {
    throw new Error('--label requires label names, or "none" to clear every label.');
  }
  const labels = await client.getIssueLabels();
  const usable = labels.filter((label) => label.team === null || label.team.id === team.id);
  return names.map(
    (name) => findByName(usable, (label) => label.name, name, `Label for team ${team.key}`).id,
  );
}

export async function buildCreateInput(
  client: LinearClient,
  team: Team,
  fields: IssueFieldArgs,
): Promise<IssueCreateInput> {
  return {
    teamId: team.id,
    title: fields.title ?? "",
    description: fields.description ?? "",
    stateId: fields.state === undefined ? null : await resolveStateId(client, team, fields.state),
    assigneeId:
      fields.assignee === undefined ? null : await resolveAssigneeId(client, team, fields.assignee),
    priority: fields.priority === undefined ? 0 : parsePriority(fields.priority),
    cycleId: fields.cycle === undefined ? null : await resolveCycleId(client, team, fields.cycle),
    projectId:
      fields.project === undefined ? null : await resolveProjectId(client, team, fields.project),
    labelIds: fields.label === undefined ? [] : await resolveLabelIds(client, team, fields.label),
  };
}

/**
 * One bounded mutation per field keeps the TUI guarantee: an update never
 * sends or clears an unrelated relation.
 */
export async function buildIssueChanges(
  client: LinearClient,
  issue: Issue,
  fields: IssueFieldArgs,
): Promise<IssueChange[]> {
  const team = issue.team;
  const changes: IssueChange[] = [];
  // Send only the given field: writing back a value read moments earlier
  // would overwrite a concurrent edit of the other field.
  if (fields.title !== undefined && fields.description !== undefined) {
    changes.push({
      kind: "content",
      issueId: issue.id,
      title: fields.title,
      description: fields.description,
    });
  } else if (fields.title !== undefined) {
    changes.push({ kind: "title", issueId: issue.id, title: fields.title });
  } else if (fields.description !== undefined) {
    changes.push({ kind: "description", issueId: issue.id, description: fields.description });
  }
  if (fields.state !== undefined) {
    changes.push({
      kind: "status",
      issueId: issue.id,
      stateId: await resolveStateId(client, team, fields.state),
    });
  }
  if (fields.assignee !== undefined) {
    changes.push({
      kind: "assignee",
      issueId: issue.id,
      assigneeId: await resolveAssigneeId(client, team, fields.assignee),
    });
  }
  if (fields.priority !== undefined) {
    changes.push({ kind: "priority", issueId: issue.id, priority: parsePriority(fields.priority) });
  }
  if (fields.cycle !== undefined) {
    changes.push({
      kind: "cycle",
      issueId: issue.id,
      cycleId: await resolveCycleId(client, team, fields.cycle),
    });
  }
  if (fields.project !== undefined) {
    changes.push({
      kind: "project",
      issueId: issue.id,
      projectId: await resolveProjectId(client, team, fields.project),
    });
  }
  if (fields.label !== undefined) {
    if (!issue.labelsComplete) {
      throw new Error(
        `${issue.identifier} has more labels than one read returns; replacing them from the CLI could drop unseen labels.`,
      );
    }
    changes.push({
      kind: "labels",
      issueId: issue.id,
      labelIds: await resolveLabelIds(client, team, fields.label),
    });
  }
  return changes;
}
