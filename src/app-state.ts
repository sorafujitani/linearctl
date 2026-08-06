import type {
  Cycle,
  Issue,
  IssueChange,
  IssueLabel,
  IssueScope,
  Project,
  Team,
  UpdatedIssue,
} from "./domain";
import {
  filterIssueList,
  groupedIssueTraversal,
  moveSelectedIssueId,
  NONE_VALUE,
  retainSelectedIssueId,
  type IssueDimension,
  type IssueFilters,
  type IssueGroupDimension,
} from "./issue-list";

export type TopNav = "my-issues" | "teams" | "cycles" | "projects";
export type Catalog = "cycles" | "projects";

export type Screen =
  | { kind: "catalog"; catalog: Catalog }
  | { kind: "issue-browser"; origin: TopNav; scope: IssueScope };

export interface SelectOption {
  id: string;
  label: string;
}

export type Overlay =
  | {
      kind: "team-context";
      destination: TopNav;
      options: SelectOption[];
      selectedIndex: number;
    }
  | { kind: "filter-field"; selectedIndex: number }
  | {
      kind: "filter-value";
      dimension: IssueDimension;
      options: SelectOption[];
      selectedIndex: number;
    }
  | { kind: "group"; selectedIndex: number }
  | {
      kind: "single-choice";
      action: "status" | "assignee" | "priority" | "cycle" | "project";
      issueId: string;
      options: SelectOption[];
      selectedIndex: number;
    }
  | {
      kind: "labels";
      issueId: string;
      options: IssueLabel[];
      selectedIndex: number;
      selectedIds: string[];
    };

interface PendingIssueRequest {
  id: number;
  scope: IssueScope;
}

export interface AppState {
  screen: Screen;
  teams: Team[];
  activeTeamId: string | null;
  cycles: Cycle[];
  projects: Project[];
  issues: Issue[];
  catalogIndexes: Record<Catalog, number>;
  query: string;
  filters: IssueFilters;
  groupBy: IssueGroupDimension;
  selectedIssueId: string | null;
  overlay: Overlay | null;
  pendingIssueRequest: PendingIssueRequest | null;
}

export function createAppState(): AppState {
  return {
    screen: {
      kind: "issue-browser",
      origin: "my-issues",
      scope: { kind: "assigned-to-me" },
    },
    teams: [],
    activeTeamId: null,
    cycles: [],
    projects: [],
    catalogIndexes: { cycles: 0, projects: 0 },
    issues: [],
    query: "",
    filters: {},
    groupBy: "none",
    selectedIssueId: null,
    overlay: null,
    pendingIssueRequest: null,
  };
}

export function currentTopNav(state: AppState): TopNav {
  return state.screen.kind === "catalog" ? state.screen.catalog : state.screen.origin;
}

export function visibleIssues(state: AppState): Issue[] {
  return filterIssueList(state.issues, state.query, state.filters);
}

export function traversableIssues(state: AppState): Issue[] {
  return groupedIssueTraversal(visibleIssues(state), state.groupBy);
}

export function selectedIssue(state: AppState): Issue | undefined {
  return traversableIssues(state).find((issue) => issue.id === state.selectedIssueId);
}

export function selectedCatalogItem(state: AppState): Cycle | Project | undefined {
  if (state.screen.kind !== "catalog") return undefined;
  const index = state.catalogIndexes[state.screen.catalog];
  switch (state.screen.catalog) {
    case "cycles":
      return scopedCycles(state)[index];
    case "projects":
      return scopedProjects(state)[index];
  }
}

export function activeTeam(state: AppState): Team | undefined {
  return state.teams.find((team) => team.id === state.activeTeamId);
}

export function scopedCycles(state: AppState): Cycle[] {
  if (state.activeTeamId === null) return [];
  return state.cycles.filter((cycle) => cycle.team.id === state.activeTeamId);
}

export function scopedProjects(state: AppState): Project[] {
  if (state.activeTeamId === null) return [];
  return state.projects.filter((project) =>
    project.teams.some((team) => team.id === state.activeTeamId),
  );
}

export function openTeamSelector(state: AppState, destination = currentTopNav(state)): AppState {
  const options = state.teams.map((team) => ({
    id: team.id,
    label: `${team.key} · ${team.name}`,
  }));
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.id === state.activeTeamId),
  );
  return {
    ...state,
    overlay: { kind: "team-context", destination, options, selectedIndex },
  };
}

export function selectActiveTeam(
  state: AppState,
  teamId: string,
  destination = currentTopNav(state),
): AppState {
  if (!state.teams.some((team) => team.id === teamId)) return state;
  const screen: Screen =
    destination === "my-issues"
      ? {
          kind: "issue-browser",
          origin: destination,
          scope: { kind: "assigned-to-me", teamId },
        }
      : destination === "teams"
        ? { kind: "issue-browser", origin: destination, scope: { kind: "team", teamId } }
        : { kind: "catalog", catalog: destination };
  return {
    ...state,
    activeTeamId: teamId,
    screen,
    issues: [],
    catalogIndexes: { cycles: 0, projects: 0 },
    query: "",
    filters: {},
    groupBy: "none",
    selectedIssueId: null,
    overlay: null,
    pendingIssueRequest: null,
  };
}

function catalogCount(state: AppState, catalog: Catalog): number {
  switch (catalog) {
    case "cycles":
      return scopedCycles(state).length;
    case "projects":
      return scopedProjects(state).length;
  }
}

function clamp(index: number, count: number): number {
  if (count === 0) return 0;
  return Math.min(Math.max(index, 0), count - 1);
}

export function selectTopNav(state: AppState, nav: TopNav): AppState {
  if (state.activeTeamId === null) return openTeamSelector(state, nav);
  const alreadyAssigned =
    state.screen.kind === "issue-browser" &&
    state.screen.scope.kind === "assigned-to-me" &&
    state.screen.scope.teamId === state.activeTeamId;
  const screen: Screen =
    nav === "my-issues"
      ? {
          kind: "issue-browser",
          origin: nav,
          scope: { kind: "assigned-to-me", teamId: state.activeTeamId },
        }
      : nav === "teams"
        ? {
            kind: "issue-browser",
            origin: nav,
            scope: { kind: "team", teamId: state.activeTeamId },
          }
        : { kind: "catalog", catalog: nav };
  return {
    ...state,
    screen,
    issues: nav === "my-issues" && alreadyAssigned ? state.issues : [],
    query: "",
    filters: {},
    groupBy: "none",
    selectedIssueId: nav === "my-issues" && alreadyAssigned ? state.selectedIssueId : null,
    overlay: null,
    pendingIssueRequest: null,
  };
}

export function moveSelection(state: AppState, delta: number): AppState {
  if (state.screen.kind === "issue-browser") {
    return {
      ...state,
      selectedIssueId: moveSelectedIssueId(traversableIssues(state), state.selectedIssueId, delta),
    };
  }
  const catalog = state.screen.catalog;
  return {
    ...state,
    catalogIndexes: {
      ...state.catalogIndexes,
      [catalog]: clamp(state.catalogIndexes[catalog] + delta, catalogCount(state, catalog)),
    },
  };
}

export function drillIntoSelected(state: AppState): AppState {
  if (state.screen.kind !== "catalog") return state;
  const origin = state.screen.catalog;
  const selected = selectedCatalogItem(state);
  if (selected === undefined) return state;
  const scope: IssueScope =
    origin === "cycles"
      ? { kind: "cycle", cycleId: selected.id }
      : { kind: "project", projectId: selected.id };
  return {
    ...state,
    screen: { kind: "issue-browser", origin, scope },
    issues: [],
    query: "",
    filters: {},
    groupBy: "none",
    selectedIssueId: null,
    overlay: null,
    pendingIssueRequest: null,
  };
}

export function escapeIssueBrowser(state: AppState): AppState {
  if (
    state.screen.kind !== "issue-browser" ||
    state.screen.origin === "my-issues" ||
    state.screen.origin === "teams"
  )
    return state;
  return {
    ...state,
    screen: { kind: "catalog", catalog: state.screen.origin },
    issues: [],
    query: "",
    filters: {},
    groupBy: "none",
    selectedIssueId: null,
    overlay: null,
    pendingIssueRequest: null,
  };
}

function sameScope(left: IssueScope, right: IssueScope): boolean {
  if (left.kind !== right.kind) return false;
  switch (left.kind) {
    case "assigned-to-me":
      return right.kind === "assigned-to-me" && left.teamId === right.teamId;
    case "team":
      return right.kind === "team" && left.teamId === right.teamId;
    case "cycle":
      return right.kind === "cycle" && left.cycleId === right.cycleId;
    case "project":
      return right.kind === "project" && left.projectId === right.projectId;
  }
}

export function beginIssueRequest(state: AppState, requestId: number): AppState {
  if (state.screen.kind !== "issue-browser") return state;
  return { ...state, pendingIssueRequest: { id: requestId, scope: state.screen.scope } };
}

export function finishIssueRequest(
  state: AppState,
  requestId: number,
  scope: IssueScope,
  issues: Issue[],
): AppState {
  const pending = state.pendingIssueRequest;
  if (
    pending === null ||
    pending.id !== requestId ||
    !sameScope(pending.scope, scope) ||
    state.screen.kind !== "issue-browser" ||
    !sameScope(state.screen.scope, scope)
  ) {
    return state;
  }
  const next = { ...state, issues, pendingIssueRequest: null };
  return {
    ...next,
    selectedIssueId: retainSelectedIssueId(traversableIssues(next), state.selectedIssueId),
  };
}

export function setQuery(state: AppState, query: string): AppState {
  const next = { ...state, query };
  return {
    ...next,
    selectedIssueId: retainSelectedIssueId(traversableIssues(next), state.selectedIssueId),
  };
}

export function setFilter(
  state: AppState,
  dimension: IssueDimension,
  value: string | null,
): AppState {
  const filters = { ...state.filters };
  if (value === null) delete filters[dimension];
  else filters[dimension] = value;
  const next = { ...state, filters, overlay: null };
  return {
    ...next,
    selectedIssueId: retainSelectedIssueId(traversableIssues(next), state.selectedIssueId),
  };
}

export function setGroup(state: AppState, groupBy: IssueGroupDimension): AppState {
  const next = { ...state, groupBy, overlay: null };
  return {
    ...next,
    selectedIssueId: retainSelectedIssueId(traversableIssues(next), state.selectedIssueId),
  };
}

export function resetIssueList(state: AppState): AppState {
  const next: AppState = { ...state, query: "", filters: {}, groupBy: "none", overlay: null };
  return {
    ...next,
    selectedIssueId: retainSelectedIssueId(traversableIssues(next), state.selectedIssueId),
  };
}

export function openOverlay(state: AppState, overlay: Overlay): AppState {
  return { ...state, overlay };
}

export function closeOverlay(state: AppState): AppState {
  return { ...state, overlay: null };
}

export function moveOverlay(state: AppState, delta: number): AppState {
  const overlay = state.overlay;
  if (overlay === null) return state;
  const count =
    overlay.kind === "filter-field" ? 7 : overlay.kind === "group" ? 8 : overlay.options.length;
  return {
    ...state,
    overlay: { ...overlay, selectedIndex: clamp(overlay.selectedIndex + delta, count) },
  };
}

export function toggleSelectedLabel(state: AppState): AppState {
  const overlay = state.overlay;
  if (overlay?.kind !== "labels") return state;
  const label = overlay.options[overlay.selectedIndex];
  if (label === undefined) return state;
  const selectedIds = overlay.selectedIds.includes(label.id)
    ? overlay.selectedIds.filter((id) => id !== label.id)
    : [...overlay.selectedIds, label.id];
  return { ...state, overlay: { ...overlay, selectedIds } };
}

export function applyIssueUpdate(state: AppState, updated: UpdatedIssue): AppState {
  const issues = state.issues.map((issue) =>
    issue.id === updated.id
      ? {
          ...issue,
          state: updated.state,
          cycle: updated.cycle,
          project: updated.project,
          assignee: updated.assignee,
          priority: updated.priority,
          priorityLabel:
            ["No priority", "Urgent", "High", "Medium", "Low"][updated.priority] ?? "No priority",
          labels: updated.labels,
          labelsComplete: updated.labelsComplete,
        }
      : issue,
  );
  const next = { ...state, issues, overlay: null };
  return {
    ...next,
    selectedIssueId: retainSelectedIssueId(traversableIssues(next), updated.id),
  };
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const values = new Set(left);
  return values.size === left.length && right.every((value) => values.has(value));
}

export function issueChangeForOverlay(issue: Issue, overlay: Overlay): IssueChange | null {
  if (overlay.kind === "labels") {
    const currentIds = issue.labels.map((label) => label.id);
    return sameStringSet(currentIds, overlay.selectedIds)
      ? null
      : { kind: "labels", issueId: issue.id, labelIds: overlay.selectedIds };
  }
  if (overlay.kind !== "single-choice") return null;
  const option = overlay.options[overlay.selectedIndex];
  if (option === undefined) return null;
  switch (overlay.action) {
    case "status":
      return option.id === issue.state.id
        ? null
        : { kind: "status", issueId: issue.id, stateId: option.id };
    case "assignee": {
      const assigneeId = option.id === NONE_VALUE ? null : option.id;
      return assigneeId === (issue.assignee?.id ?? null)
        ? null
        : { kind: "assignee", issueId: issue.id, assigneeId };
    }
    case "priority": {
      const priority = Number(option.id);
      return priority === issue.priority ? null : { kind: "priority", issueId: issue.id, priority };
    }
    case "cycle": {
      const cycleId = option.id === NONE_VALUE ? null : option.id;
      return cycleId === (issue.cycle?.id ?? null)
        ? null
        : { kind: "cycle", issueId: issue.id, cycleId };
    }
    case "project": {
      const projectId = option.id === NONE_VALUE ? null : option.id;
      return projectId === (issue.project?.id ?? null)
        ? null
        : { kind: "project", issueId: issue.id, projectId };
    }
  }
}
