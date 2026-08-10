import { selectedCatalogItem, selectedIssue, type AppState } from "./app-state";
import type { IssueScope } from "../core/domain";
import type { UrlOpener } from "./open-url";

export function selectedItemUrl(state: AppState, workspaceUrlKey: string): string | null {
  const issue = selectedIssue(state);
  if (issue !== undefined) return issue.url;

  if (state.screen.kind === "catalog") {
    return selectedCatalogItem(state)?.url ?? null;
  }

  if (state.screen.kind !== "issue-browser") return null;
  const scope = state.screen.scope;
  if (scope.kind === "project") {
    return state.projects.find((project) => project.id === scope.projectId)?.url ?? null;
  }
  if (scope.kind === "current-cycle" || scope.kind === "cycle") {
    return selectedCycleUrl(state, workspaceUrlKey, scope);
  }
  return null;
}

export async function openSelectedItemUrl(
  state: AppState,
  workspaceUrlKey: string,
  openUrl: UrlOpener,
): Promise<boolean> {
  const url = selectedItemUrl(state, workspaceUrlKey);
  if (url === null) return false;
  await openUrl(url);
  return true;
}

export function selectedCycleUrl(
  state: AppState,
  workspaceUrlKey: string,
  scope: Extract<IssueScope, { kind: "current-cycle" } | { kind: "cycle" }>,
): string | null {
  if (scope.kind === "cycle") {
    const defined = state.cycles.find((item) => item.id === scope.cycleId);
    if (defined !== undefined) {
      return `https://linear.app/${workspaceUrlKey}/team/${defined.team.key}/cycle/${defined.number}`;
    }
    const issue = state.issues.find((item) => item.cycle?.id === scope.cycleId);
    if (issue?.cycle === undefined || issue.cycle === null) return null;
    return `https://linear.app/${workspaceUrlKey}/team/${issue.team.key}/cycle/${issue.cycle.number}`;
  }

  const defined = state.cycles.find((item) => item.team.id === scope.teamId && item.isActive);
  if (defined !== undefined) {
    return `https://linear.app/${workspaceUrlKey}/team/${defined.team.key}/cycle/${defined.number}`;
  }
  const issue = state.issues.find((item) => item.cycle !== null);
  if (issue?.cycle === undefined || issue.cycle === null) return null;
  const team = state.teams.find((item) => item.id === scope.teamId) ?? issue.team;
  return `https://linear.app/${workspaceUrlKey}/team/${team.key}/cycle/${issue.cycle.number}`;
}
