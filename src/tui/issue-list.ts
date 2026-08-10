import { matchesSearch, type Issue } from "../core/domain";
import { unreachable } from "../core/unreachable";

export const ISSUE_DIMENSIONS = [
  "status",
  "assignee",
  "priority",
  "team",
  "cycle",
  "project",
  "label",
] as const;

export type IssueDimension = (typeof ISSUE_DIMENSIONS)[number];
export type IssueGroupDimension = "none" | IssueDimension;
export type IssueFilters = Partial<Record<IssueDimension, string>>;

export const NONE_VALUE = "__none__";

export interface IssueGroup {
  key: string;
  label: string;
  issues: Issue[];
}

function includesText(issue: Issue, query: string): boolean {
  return matchesSearch(query, [
    issue.identifier,
    issue.title,
    issue.description ?? "",
    issue.state.name,
    issue.assignee?.name ?? "",
    issue.priorityLabel,
    issue.team.name,
    issue.cycle?.name ?? "",
    issue.project?.name ?? "",
    ...issue.labels.map((label) => label.name),
  ]);
}

function matchesFilter(issue: Issue, dimension: IssueDimension, value: string): boolean {
  switch (dimension) {
    case "status":
      return issue.state.id === value;
    case "assignee":
      return value === NONE_VALUE ? issue.assignee === null : issue.assignee?.id === value;
    case "priority":
      return String(issue.priority) === value;
    case "team":
      return issue.team.id === value;
    case "cycle":
      return value === NONE_VALUE ? issue.cycle === null : issue.cycle?.id === value;
    case "project":
      return value === NONE_VALUE ? issue.project === null : issue.project?.id === value;
    case "label":
      return value === NONE_VALUE
        ? issue.labels.length === 0
        : issue.labels.some((label) => label.id === value);
    default:
      return unreachable(dimension);
  }
}

export function filterIssueList(
  issues: readonly Issue[],
  query: string,
  filters: IssueFilters,
): Issue[] {
  const criteria = ISSUE_DIMENSIONS.flatMap((dimension) => {
    const value = filters[dimension];
    return value === undefined ? [] : [{ dimension, value }];
  });
  return issues.filter(
    (issue) =>
      includesText(issue, query) &&
      criteria.every(({ dimension, value }) => matchesFilter(issue, dimension, value)),
  );
}

function groupValues(
  issue: Issue,
  dimension: IssueGroupDimension,
): { key: string; label: string }[] {
  switch (dimension) {
    case "none":
      return [{ key: "all", label: "All Issues" }];
    case "status":
      return [{ key: issue.state.id, label: issue.state.name }];
    case "assignee":
      return [
        { key: issue.assignee?.id ?? NONE_VALUE, label: issue.assignee?.name ?? "Unassigned" },
      ];
    case "priority":
      return [{ key: String(issue.priority), label: issue.priorityLabel }];
    case "team":
      return [{ key: issue.team.id, label: `${issue.team.key} · ${issue.team.name}` }];
    case "cycle":
      return [{ key: issue.cycle?.id ?? NONE_VALUE, label: issue.cycle?.name ?? "Unassigned" }];
    case "project":
      return [{ key: issue.project?.id ?? NONE_VALUE, label: issue.project?.name ?? "Unassigned" }];
    case "label":
      return issue.labels.length === 0
        ? [{ key: NONE_VALUE, label: "No labels" }]
        : issue.labels.map((label) => ({ key: label.id, label: label.name }));
    default:
      return unreachable(dimension);
  }
}

export function groupIssueList(
  issues: readonly Issue[],
  dimension: IssueGroupDimension,
): IssueGroup[] {
  const groups = new Map<string, IssueGroup>();
  for (const issue of issues) {
    for (const value of groupValues(issue, dimension)) {
      const group = groups.get(value.key);
      if (group === undefined) groups.set(value.key, { ...value, issues: [issue] });
      else group.issues.push(issue);
    }
  }
  return [...groups.values()];
}

export function groupedIssueTraversal(
  issues: readonly Issue[],
  dimension: IssueGroupDimension,
): Issue[] {
  const seen = new Set<string>();
  const traversal: Issue[] = [];
  for (const group of groupIssueList(issues, dimension)) {
    for (const issue of group.issues) {
      if (seen.has(issue.id)) continue;
      seen.add(issue.id);
      traversal.push(issue);
    }
  }
  return traversal;
}

export function retainSelectedIssueId(
  issues: readonly Issue[],
  selectedIssueId: string | null,
): string | null {
  if (selectedIssueId !== null && issues.some((issue) => issue.id === selectedIssueId)) {
    return selectedIssueId;
  }
  return issues[0]?.id ?? null;
}

export function moveSelectedIssueId(
  issues: readonly Issue[],
  selectedIssueId: string | null,
  delta: number,
): string | null {
  if (issues.length === 0) return null;
  const current = issues.findIndex((issue) => issue.id === selectedIssueId);
  const index = Math.min(Math.max((current < 0 ? 0 : current) + delta, 0), issues.length - 1);
  return issues[index]?.id ?? null;
}
