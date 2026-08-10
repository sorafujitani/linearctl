import {
  priorityLabel,
  type Cycle,
  type Issue,
  type IssueCommentPage,
  type IssuePage,
  type ProjectPage,
  type Team,
  type UpdatedIssue,
} from "../core/domain";
import type { AuthStatus } from "../core/linear-client";
import type { ClientMode } from "../core/client-factory";

export function authStatusText(status: AuthStatus, mode: ClientMode): string {
  return (
    [
      mode === "mock"
        ? "Authentication: MOCK (synthetic data, no API key or network)"
        : "Authentication: OK",
      `User: ${status.viewer.name} <${status.viewer.email}>`,
      `workspace: ${status.workspace.name} (${status.workspace.urlKey})`,
    ].join("\n") + "\n"
  );
}

export function authStatusJson(status: AuthStatus, mode: ClientMode): string {
  return `${JSON.stringify({ mode, viewer: status.viewer, workspace: status.workspace }, null, 2)}\n`;
}

export function issueListText(page: IssuePage): string {
  if (page.issues.length === 0) return "No issues in this view.\n";
  const width = Math.max(...page.issues.map((issue) => issue.identifier.length));
  const lines = page.issues.map((issue) => {
    const assignee = issue.assignee === null ? "" : `  (${issue.assignee.name})`;
    return `${issue.identifier.padEnd(width)}  [${issue.state.name}] ${issue.title}${assignee}`;
  });
  if (page.hasMore) {
    lines.push(`…more issues exist on the server (showing the first ${page.issues.length}).`);
  }
  return `${lines.join("\n")}\n`;
}

function issueJsonShape(issue: Issue): Record<string, unknown> {
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    description: issue.description,
    state: issue.state.name,
    stateType: issue.state.type,
    assignee: issue.assignee?.name ?? null,
    priority: issue.priority,
    priorityLabel: issue.priorityLabel,
    estimate: issue.estimate,
    team: issue.team.key,
    cycle: issue.cycle?.name ?? null,
    project: issue.project?.name ?? null,
    labels: issue.labels.map((label) => label.name),
    url: issue.url,
    updatedAt: issue.updatedAt,
  };
}

export function issueListJson(page: IssuePage): string {
  return `${JSON.stringify({ issues: page.issues.map(issueJsonShape), hasMore: page.hasMore }, null, 2)}\n`;
}

function cycleName(issue: Issue): string {
  if (issue.cycle === null) return "-";
  return issue.cycle.name ?? `Cycle ${issue.cycle.number}`;
}

export function issueViewText(issue: Issue, comments?: IssueCommentPage): string {
  const lines = [
    `${issue.identifier}  ${issue.title}`,
    `Team: ${issue.team.name} (${issue.team.key})`,
    `State: ${issue.state.name}`,
    `Priority: ${issue.priorityLabel}`,
    `Assignee: ${issue.assignee?.name ?? "-"}`,
    `Estimate: ${issue.estimate ?? "-"}`,
    `Cycle: ${cycleName(issue)}`,
    `Project: ${issue.project?.name ?? "-"}`,
    `Labels: ${issue.labels.length === 0 ? "-" : issue.labels.map((label) => label.name).join(", ")}`,
    `URL: ${issue.url}`,
    `Updated: ${issue.updatedAt}`,
  ];
  if (issue.description !== null && issue.description.trim().length > 0) {
    lines.push("", issue.description.trimEnd());
  }
  if (comments !== undefined) {
    lines.push("", "Comments:");
    if (comments.comments.length === 0) {
      lines.push("(no comments)");
    }
    for (const comment of comments.comments) {
      lines.push(
        `--- ${comment.author ?? "(bot)"} at ${comment.createdAt}`,
        comment.body.trimEnd(),
      );
    }
    if (comments.hasMore) {
      lines.push("…older comments exist on the server.");
    }
  }
  return `${lines.join("\n")}\n`;
}

export function issueViewJson(issue: Issue, comments?: IssueCommentPage): string {
  const shape = issueJsonShape(issue);
  if (comments !== undefined) {
    shape["comments"] = comments.comments;
    shape["hasMoreComments"] = comments.hasMore;
  }
  return `${JSON.stringify(shape, null, 2)}\n`;
}

export function teamListText(teams: readonly Team[]): string {
  if (teams.length === 0) return "No teams found.\n";
  const width = Math.max(...teams.map((team) => team.key.length));
  return `${teams.map((team) => `${team.key.padEnd(width)}  ${team.name}`).join("\n")}\n`;
}

export function teamListJson(teams: readonly Team[]): string {
  return `${JSON.stringify({ teams }, null, 2)}\n`;
}

export function projectListText(page: ProjectPage): string {
  if (page.projects.length === 0) return "No active projects.\n";
  const lines = page.projects.map((project) => {
    const teams = project.teams.map((team) => team.key).join(",");
    const lead = project.lead === null ? "" : `  (lead: ${project.lead.name})`;
    return `${project.name}  [${project.status.name}] ${Math.round(project.progress * 100)}%  teams: ${teams}${lead}`;
  });
  if (page.hasMore) {
    lines.push(`…more projects exist on the server (showing the first ${page.projects.length}).`);
  }
  return `${lines.join("\n")}\n`;
}

export function projectListJson(page: ProjectPage): string {
  const projects = page.projects.map((project) => ({
    id: project.id,
    name: project.name,
    description: project.description,
    status: project.status.name,
    statusType: project.status.type,
    progress: project.progress,
    health: project.health,
    startDate: project.startDate,
    targetDate: project.targetDate,
    lead: project.lead?.name ?? null,
    teams: project.teams.map((team) => team.key),
    url: project.url,
  }));
  return `${JSON.stringify({ projects, hasMore: page.hasMore }, null, 2)}\n`;
}

export function cycleListText(cycles: readonly Cycle[]): string {
  if (cycles.length === 0) return "No cycles found for this team.\n";
  const lines = cycles.map((cycle) => {
    const name = cycle.name ?? `Cycle ${cycle.number}`;
    const active = cycle.isActive ? "  (active)" : "";
    const window = `${cycle.startsAt.slice(0, 10)} → ${cycle.endsAt.slice(0, 10)}`;
    return `#${cycle.number}  ${name}  ${window}  ${Math.round(cycle.progress * 100)}%${active}`;
  });
  return `${lines.join("\n")}\n`;
}

export function cycleListJson(cycles: readonly Cycle[]): string {
  return `${JSON.stringify({ cycles }, null, 2)}\n`;
}

export function issueCreatedText(issue: Issue): string {
  return `Created ${issue.identifier}: ${issue.title}\n${issue.url}\n`;
}

export function issueUpdatedText(identifier: string, updated: UpdatedIssue): string {
  const labels =
    updated.labels.length === 0 ? "-" : updated.labels.map((label) => label.name).join(", ");
  const cycle =
    updated.cycle === null ? "-" : (updated.cycle.name ?? `Cycle ${updated.cycle.number}`);
  return (
    [
      `Updated ${identifier}: ${updated.title}`,
      `State: ${updated.state.name}`,
      `Assignee: ${updated.assignee?.name ?? "-"}`,
      `Priority: ${priorityLabel(updated.priority)}`,
      `Cycle: ${cycle}`,
      `Project: ${updated.project?.name ?? "-"}`,
      `Labels: ${labels}`,
    ].join("\n") + "\n"
  );
}

export function updatedIssueJson(identifier: string, updated: UpdatedIssue): string {
  return `${JSON.stringify(
    {
      identifier,
      title: updated.title,
      description: updated.description,
      state: updated.state.name,
      assignee: updated.assignee?.name ?? null,
      priority: updated.priority,
      priorityLabel: priorityLabel(updated.priority),
      cycle: updated.cycle?.name ?? null,
      project: updated.project?.name ?? null,
      labels: updated.labels.map((label) => label.name),
      updatedAt: updated.updatedAt,
    },
    null,
    2,
  )}\n`;
}
