import { fg, StyledText } from "@opentui/core";
import stringWidth from "string-width";

import { scopedProjects, visibleIssues, visibleProjects, type AppState } from "./app-state";
import type { Issue, IssueCommentPage, IssueScope, Project } from "../core/domain";
import { groupIssueList } from "./issue-list";
import { unreachable } from "../core/unreachable";

export const COLORS = {
  accent: "#7AA2F7",
  border: "#414868",
  dim: "#737DA0",
  error: "#F7768E",
  hint: "#7DCFFF",
  success: "#9ECE6A",
  text: "#C0CAF5",
  warning: "#E0AF68",
};

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function truncateToWidth(value: string, width: number): string {
  const available = Math.max(0, Math.floor(width));
  if (stringWidth(value) <= available) return value;
  const ellipsis = "…";
  const ellipsisWidth = stringWidth(ellipsis);
  if (available < ellipsisWidth) return "";
  let result = "";
  let resultWidth = 0;
  for (const { segment } of graphemeSegmenter.segment(value)) {
    const segmentWidth = stringWidth(segment);
    if (resultWidth + segmentWidth + ellipsisWidth > available) break;
    result += segment;
    resultWidth += segmentWidth;
  }
  return `${result}${ellipsis}`;
}

export function formatDate(value: string | null): string {
  if (value === null) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function commentsText(issue: Issue, page: IssueCommentPage): string {
  const header = `${issue.identifier}  ${issue.title}`;
  if (page.comments.length === 0) return `${header}\n\nNo comments on this issue.`;
  const body = page.comments
    .map(
      (comment) =>
        `${comment.author ?? "(bot)"} · ${formatDate(comment.createdAt)}\n${comment.body}`,
    )
    .join("\n\n---\n\n");
  const more = page.hasMore ? "\n\n…older comments exist on the server." : "";
  return `${header}\n\n${body}${more}`;
}

export function formatProgress(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function panelWidths(terminalWidth: number): { list: number; detail: number } {
  const available = Math.max(Math.floor(terminalWidth) - 1, 2);
  const list = Math.max(1, Math.floor(available * 0.42));
  return { list, detail: Math.max(1, available - list) };
}

export function scopeTitle(scope: IssueScope, state: AppState): string {
  switch (scope.kind) {
    case "assigned-to-me": {
      if (scope.teamId === undefined) return "My Issues";
      const key = state.teams.find((team) => team.id === scope.teamId)?.key;
      return key === undefined ? "My Issues" : `${key} My Issues`;
    }
    case "team": {
      const key = state.teams.find((team) => team.id === scope.teamId)?.key;
      return key === undefined ? "Team Issues" : `${key} Team Issues`;
    }
    case "current-cycle":
      return state.issues[0]?.cycle?.name ?? "Current Cycle";
    case "cycle":
      return state.cycles.find((cycle) => cycle.id === scope.cycleId)?.name ?? "Cycle Issues";
    case "project":
      return (
        state.projects.find((project) => project.id === scope.projectId)?.name ?? "Project Issues"
      );
    default:
      return unreachable(scope);
  }
}

export function issueListText(state: AppState, width: number): string {
  return issueListRows(state, width)
    .map((row) => row.text)
    .join("\n");
}

export interface IssueListRow {
  readonly text: string;
  readonly selected: boolean;
}

export function issueListRows(state: AppState, width: number): IssueListRow[] {
  const issues = visibleIssues(state);
  if (issues.length === 0) {
    if (state.pendingIssueRequest !== null) {
      return [{ text: "Loading issues...", selected: false }];
    }
    if (state.issues.length === 0) {
      // "active" would be a lie while the done toggle widens the read.
      const adjective = state.includeDone ? "" : "active ";
      if (state.screen.kind === "issue-browser") {
        if (state.screen.scope.kind === "current-cycle") {
          return [{ text: `No ${adjective}issues in the current cycle.`, selected: false }];
        }
        if (state.screen.scope.kind === "assigned-to-me") {
          return [
            {
              text:
                state.screen.scope.teamId === undefined
                  ? `No ${adjective}issues are assigned to you.`
                  : `No ${adjective}issues are assigned to you in this team.`,
              selected: false,
            },
          ];
        }
      }
      return [{ text: "No issues in this view.", selected: false }];
    }
    return [{ text: "No issues match the current view.", selected: false }];
  }
  const groups = groupIssueList(issues, state.groupBy);
  const rows: IssueListRow[] = [];
  const displayed = new Set<string>();
  for (const group of groups) {
    const uniqueIssues = group.issues.filter((issue) => !displayed.has(issue.id));
    if (uniqueIssues.length === 0) continue;
    if (state.groupBy !== "none") {
      const issueCount = `${uniqueIssues.length} ${uniqueIssues.length === 1 ? "issue" : "issues"}`;
      rows.push({
        text: truncateToWidth(`▾ ${group.label} · ${issueCount}`, width),
        selected: false,
      });
    }
    for (const issue of uniqueIssues) {
      displayed.add(issue.id);
      const selected = issue.id === state.selectedIssueId;
      const marker = selected ? "›" : " ";
      const row =
        state.groupBy === "none"
          ? `${marker} ${issue.identifier} [${issue.state.name}] ${issue.title}`
          : `  ${marker} [${issue.state.name}] ${issue.title}`;
      rows.push({ text: truncateToWidth(row, width), selected });
    }
  }
  return rows;
}

export function styledListContent(rows: readonly IssueListRow[]): StyledText {
  return new StyledText(
    rows.map((row, index) =>
      fg(row.selected ? COLORS.accent : COLORS.text)(
        `${row.text}${index === rows.length - 1 ? "" : "\n"}`,
      ),
    ),
  );
}

export function selectableTextRows(content: string): IssueListRow[] {
  return content.split("\n").map((text) => ({
    text,
    selected: /^\s*›/.test(text),
  }));
}

export function issueListContent(state: AppState, width: number): StyledText {
  return styledListContent(issueListRows(state, width));
}

export function listScrollOffset(
  currentOffset: number,
  viewportHeight: number,
  selectedLine: number | null,
): number {
  if (selectedLine === null) return 0;
  if (viewportHeight <= 0) return currentOffset;
  if (selectedLine < currentOffset) return selectedLine;
  if (selectedLine >= currentOffset + viewportHeight) {
    return selectedLine - viewportHeight + 1;
  }
  return currentOffset;
}

export function issueDetailText(issue: Issue | undefined): string {
  if (issue === undefined) return "Select an issue.";
  return [
    `${issue.identifier}  ${issue.title}`,
    "",
    `Status:   ${issue.state.name}`,
    `Assignee: ${issue.assignee?.name ?? "Unassigned"}`,
    `Priority: ${issue.priorityLabel}`,
    `Estimate: ${issue.estimate ?? "-"}`,
    `Team:     ${issue.team.name}`,
    `Cycle:    ${issue.cycle === null ? "Unassigned" : `#${issue.cycle.number} ${issue.cycle.name ?? "Untitled"}`}`,
    `Project:  ${issue.project?.name ?? "Unassigned"}`,
    `Labels:   ${issue.labels.map((label) => label.name).join(", ") || "-"}`,
    `Updated:  ${formatDate(issue.updatedAt)}`,
    `URL:      ${issue.url}`,
    "",
    issue.description?.trim() || "No description.",
  ].join("\n");
}

export function catalogListText(state: AppState, width: number): string {
  if (state.screen.kind !== "catalog") return "";
  const index = state.catalogIndexes[state.screen.catalog];
  const all = scopedProjects(state);
  const projects = visibleProjects(state);
  if (all.length === 0) return "No active projects for this team.";
  if (projects.length === 0) return "No projects match the current view.";
  return projects
    .map((project, row) =>
      truncateToWidth(
        `${row === index ? "›" : " "} [${project.status.name}] ${project.name}`,
        width,
      ),
    )
    .join("\n");
}

export function catalogDetailText(item: Project | undefined): string {
  if (item === undefined) return "Select an item.";
  return [
    item.name,
    "",
    `Status: ${item.status.name}`,
    `Progress: ${formatProgress(item.progress)}`,
    `Health: ${item.health ?? "-"}`,
    `Lead: ${item.lead?.name ?? "-"}`,
    `Teams: ${item.teams.map((team) => team.name).join(", ")}`,
    `URL: ${item.url}`,
    "",
    item.description,
    "",
    "Press Enter to load this project's issues.",
  ].join("\n");
}
