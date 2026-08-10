import type { IssuePage } from "./domain";
import type { AuthStatus } from "./linear-client";
import type { ClientMode } from "./client-factory";

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

export function issueListJson(page: IssuePage): string {
  const issues = page.issues.map((issue) => ({
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
  }));
  return `${JSON.stringify({ issues, hasMore: page.hasMore }, null, 2)}\n`;
}
