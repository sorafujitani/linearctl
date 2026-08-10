import type {
  Cycle,
  Issue,
  IssueChange,
  IssueCreateInput,
  IssueLabel,
  IssuePage,
  IssueScope,
  Project,
  ProjectCreateInput,
  Team,
  UpdatedIssue,
} from "./domain";
import { matchesSearch, priorityLabel } from "./domain";
import {
  filterIssueList,
  groupedIssueTraversal,
  ISSUE_DIMENSIONS,
  moveSelectedIssueId,
  NONE_VALUE,
  retainSelectedIssueId,
  type IssueDimension,
  type IssueFilters,
  type IssueGroupDimension,
} from "./issue-list";
import { unreachable } from "./unreachable";

export type TopNav = "my-issues" | "teams" | "cycles" | "projects";
export type Catalog = "projects";

export type Screen =
  | { kind: "catalog"; catalog: Catalog }
  | { kind: "issue-browser"; origin: TopNav; scope: IssueScope };

export interface SelectOption {
  id: string;
  label: string;
}

type SingleChoiceAction = Exclude<IssueChange["kind"], "content" | "labels">;

export type EditIssueField = "title" | "description" | "submit";

export const EDIT_ISSUE_FIELDS: readonly EditIssueField[] = ["title", "description", "submit"];

export type CreateIssueField =
  | "title"
  | "description"
  | "status"
  | "assignee"
  | "priority"
  | "cycle"
  | "project"
  | "labels"
  | "submit";

export type CreateProjectField = "name" | "description" | "content" | "lead" | "submit";

export const CREATE_ISSUE_FIELDS: readonly CreateIssueField[] = [
  "title",
  "description",
  "status",
  "assignee",
  "priority",
  "cycle",
  "project",
  "labels",
  "submit",
];

export const CREATE_PROJECT_FIELDS: readonly CreateProjectField[] = [
  "name",
  "description",
  "content",
  "lead",
  "submit",
];

export interface IssueCreateDraft {
  teamId: string;
  title: string;
  description: string;
  stateId: string | null;
  stateLabel: string;
  assigneeId: string | null;
  assigneeLabel: string;
  priority: number;
  cycleId: string | null;
  cycleLabel: string;
  projectId: string | null;
  projectLabel: string;
  labelIds: string[];
  labelSummary: string;
}

export interface ProjectCreateDraft {
  teamId: string;
  name: string;
  description: string;
  content: string;
  leadId: string | null;
  leadLabel: string;
}

export interface IssueEditDraft {
  issueId: string;
  title: string;
  description: string;
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
      action: SingleChoiceAction;
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
    }
  | {
      kind: "create-issue";
      draft: IssueCreateDraft;
      focusedField: CreateIssueField;
      editor: "fields" | "title" | "description";
      cursor: number;
    }
  | {
      kind: "edit-issue";
      draft: IssueEditDraft;
      focusedField: EditIssueField;
      editor: "fields" | "title" | "description";
      cursor: number;
    }
  | {
      kind: "create-project";
      draft: ProjectCreateDraft;
      focusedField: CreateProjectField;
      editor: "fields" | "name" | "description" | "content";
      cursor: number;
    }
  | {
      kind: "create-choice";
      target: "issue";
      field: "status" | "assignee" | "priority" | "cycle" | "project";
      draft: IssueCreateDraft;
      options: SelectOption[];
      selectedIndex: number;
    }
  | {
      kind: "create-choice";
      target: "project";
      field: "lead";
      draft: ProjectCreateDraft;
      options: SelectOption[];
      selectedIndex: number;
    }
  | {
      kind: "create-labels";
      draft: IssueCreateDraft;
      options: IssueLabel[];
      selectedIndex: number;
      selectedIds: string[];
    };

interface PendingIssueRequest {
  id: number;
  scope: IssueScope;
}

/** Incremental filter for the option list of the open overlay; reset whenever the overlay changes. */
export interface OverlaySearch {
  active: boolean;
  query: string;
}

const NO_OVERLAY_SEARCH: OverlaySearch = { active: false, query: "" };

export interface AppState {
  screen: Screen;
  teams: Team[];
  activeTeamId: string | null;
  cycles: Cycle[];
  projects: Project[];
  projectsHasMore: boolean;
  issues: Issue[];
  issuesHasMore: boolean;
  /** Include completed/canceled issues in issue reads; toggled per session, not per view. */
  includeDone: boolean;
  catalogIndexes: Record<Catalog, number>;
  query: string;
  filters: IssueFilters;
  groupBy: IssueGroupDimension;
  selectedIssueId: string | null;
  overlay: Overlay | null;
  overlaySearch: OverlaySearch;
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
    projectsHasMore: false,
    catalogIndexes: { projects: 0 },
    issues: [],
    issuesHasMore: false,
    includeDone: false,
    query: "",
    filters: {},
    groupBy: "none",
    selectedIssueId: null,
    overlay: null,
    overlaySearch: NO_OVERLAY_SEARCH,
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

export function filterProjects(projects: readonly Project[], query: string): Project[] {
  return projects.filter((project) =>
    matchesSearch(query, [
      project.name,
      project.description,
      project.status.name,
      project.lead?.name ?? "",
      ...project.teams.flatMap((team) => [team.key, team.name]),
    ]),
  );
}

export function visibleProjects(state: AppState): Project[] {
  return filterProjects(scopedProjects(state), state.query);
}

export function selectedCatalogItem(state: AppState): Project | undefined {
  if (state.screen.kind !== "catalog") return undefined;
  const index = state.catalogIndexes[state.screen.catalog];
  return visibleProjects(state)[index];
}

export function activeTeam(state: AppState): Team | undefined {
  return state.teams.find((team) => team.id === state.activeTeamId);
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
        : destination === "cycles"
          ? {
              kind: "issue-browser",
              origin: destination,
              scope: { kind: "current-cycle", teamId },
            }
          : { kind: "catalog", catalog: destination };
  return {
    ...state,
    activeTeamId: teamId,
    screen,
    issues: [],
    catalogIndexes: { projects: 0 },
    query: "",
    filters: {},
    groupBy: "none",
    selectedIssueId: null,
    overlay: null,
    pendingIssueRequest: null,
  };
}

function catalogCount(state: AppState): number {
  return visibleProjects(state).length;
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
        : nav === "cycles"
          ? {
              kind: "issue-browser",
              origin: nav,
              scope: { kind: "current-cycle", teamId: state.activeTeamId },
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
      [catalog]: clamp(state.catalogIndexes[catalog] + delta, catalogCount(state)),
    },
  };
}

export function drillIntoSelected(state: AppState): AppState {
  if (state.screen.kind !== "catalog") return state;
  const origin = state.screen.catalog;
  const selected = selectedCatalogItem(state);
  if (selected === undefined) return state;
  const scope: IssueScope = { kind: "project", projectId: selected.id };
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
  if (state.screen.kind !== "issue-browser" || state.screen.origin !== "projects") return state;
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

export function sameScope(left: IssueScope, right: IssueScope): boolean {
  if (left.kind !== right.kind) return false;
  switch (left.kind) {
    case "assigned-to-me":
      return right.kind === "assigned-to-me" && left.teamId === right.teamId;
    case "team":
      return right.kind === "team" && left.teamId === right.teamId;
    case "current-cycle":
      return right.kind === "current-cycle" && left.teamId === right.teamId;
    case "cycle":
      return right.kind === "cycle" && left.cycleId === right.cycleId;
    case "project":
      return right.kind === "project" && left.projectId === right.projectId;
    default:
      return unreachable(left);
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
  page: IssuePage,
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
  const next = {
    ...state,
    issues: page.issues,
    issuesHasMore: page.hasMore,
    pendingIssueRequest: null,
  };
  return {
    ...next,
    selectedIssueId: retainSelectedIssueId(traversableIssues(next), state.selectedIssueId),
  };
}

export function setQuery(state: AppState, query: string): AppState {
  const next = { ...state, query };
  if (next.screen.kind === "catalog") {
    const catalog = next.screen.catalog;
    return {
      ...next,
      catalogIndexes: {
        ...next.catalogIndexes,
        [catalog]: clamp(next.catalogIndexes[catalog], catalogCount(next)),
      },
    };
  }
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
  if (next.screen.kind === "catalog") {
    const catalog = next.screen.catalog;
    return {
      ...next,
      catalogIndexes: {
        ...next.catalogIndexes,
        [catalog]: clamp(next.catalogIndexes[catalog], catalogCount(next)),
      },
    };
  }
  return {
    ...next,
    selectedIssueId: retainSelectedIssueId(traversableIssues(next), state.selectedIssueId),
  };
}

export function openOverlay(state: AppState, overlay: Overlay): AppState {
  return { ...state, overlay, overlaySearch: NO_OVERLAY_SEARCH };
}

export function closeOverlay(state: AppState): AppState {
  return { ...state, overlay: null, overlaySearch: NO_OVERLAY_SEARCH };
}

function matchesOverlayQuery(text: string, query: string): boolean {
  return matchesSearch(query, [text]);
}

export function overlaySupportsSearch(overlay: Overlay | null): boolean {
  if (overlay === null) return false;
  switch (overlay.kind) {
    case "team-context":
    case "filter-value":
    case "single-choice":
    case "create-choice":
    case "labels":
    case "create-labels":
      return true;
    default:
      return false;
  }
}

export function visibleOverlayOptions(state: AppState): SelectOption[] {
  const overlay = state.overlay;
  if (
    overlay === null ||
    (overlay.kind !== "team-context" &&
      overlay.kind !== "filter-value" &&
      overlay.kind !== "single-choice" &&
      overlay.kind !== "create-choice")
  ) {
    return [];
  }
  return overlay.options.filter((option) =>
    matchesOverlayQuery(option.label, state.overlaySearch.query),
  );
}

export function visibleOverlayLabels(state: AppState): IssueLabel[] {
  const overlay = state.overlay;
  if (overlay === null || (overlay.kind !== "labels" && overlay.kind !== "create-labels")) {
    return [];
  }
  return overlay.options.filter((label) =>
    matchesOverlayQuery(label.name, state.overlaySearch.query),
  );
}

/** Overlays that highlight one row; the create/edit forms track a focused field instead. */
function indexedOverlay(
  overlay: Overlay | null,
): Extract<Overlay, { selectedIndex: number }> | null {
  if (
    overlay === null ||
    overlay.kind === "create-issue" ||
    overlay.kind === "create-project" ||
    overlay.kind === "edit-issue"
  ) {
    return null;
  }
  return overlay;
}

export function selectedOverlayOption(state: AppState): SelectOption | undefined {
  const overlay = indexedOverlay(state.overlay);
  if (overlay === null) return undefined;
  return visibleOverlayOptions(state)[overlay.selectedIndex];
}

export function startOverlaySearch(state: AppState): AppState {
  if (!overlaySupportsSearch(state.overlay)) return state;
  return { ...state, overlaySearch: { active: true, query: state.overlaySearch.query } };
}

/** Leaves search input without dropping the filter, so Enter can confirm the highlighted row. */
export function commitOverlaySearch(state: AppState): AppState {
  return { ...state, overlaySearch: { ...state.overlaySearch, active: false } };
}

export function cancelOverlaySearch(state: AppState): AppState {
  const overlay = indexedOverlay(state.overlay);
  if (overlay === null) {
    return { ...state, overlaySearch: NO_OVERLAY_SEARCH };
  }
  return {
    ...state,
    overlay: { ...overlay, selectedIndex: 0 },
    overlaySearch: NO_OVERLAY_SEARCH,
  };
}

export function setOverlayQuery(state: AppState, query: string): AppState {
  const overlay = indexedOverlay(state.overlay);
  if (overlay === null) return state;
  const next: AppState = { ...state, overlaySearch: { active: true, query } };
  const count =
    overlay.kind === "labels" || overlay.kind === "create-labels"
      ? visibleOverlayLabels(next).length
      : visibleOverlayOptions(next).length;
  return { ...next, overlay: { ...overlay, selectedIndex: clamp(overlay.selectedIndex, count) } };
}

export function moveOverlay(state: AppState, delta: number): AppState {
  const overlay = state.overlay;
  if (overlay === null) return state;
  if (overlay.kind === "create-issue") {
    const index = CREATE_ISSUE_FIELDS.indexOf(overlay.focusedField);
    const next = clamp(index + delta, CREATE_ISSUE_FIELDS.length);
    return {
      ...state,
      overlay: { ...overlay, focusedField: CREATE_ISSUE_FIELDS[next] ?? "title" },
    };
  }
  if (overlay.kind === "create-project") {
    const index = CREATE_PROJECT_FIELDS.indexOf(overlay.focusedField);
    const next = clamp(index + delta, CREATE_PROJECT_FIELDS.length);
    return {
      ...state,
      overlay: { ...overlay, focusedField: CREATE_PROJECT_FIELDS[next] ?? "name" },
    };
  }
  if (overlay.kind === "edit-issue") {
    const index = EDIT_ISSUE_FIELDS.indexOf(overlay.focusedField);
    const next = clamp(index + delta, EDIT_ISSUE_FIELDS.length);
    return {
      ...state,
      overlay: { ...overlay, focusedField: EDIT_ISSUE_FIELDS[next] ?? "title" },
    };
  }
  const count =
    overlay.kind === "filter-field"
      ? ISSUE_DIMENSIONS.length
      : overlay.kind === "group"
        ? ISSUE_DIMENSIONS.length + 1 // dimensions plus the leading "None" row
        : overlay.kind === "labels" || overlay.kind === "create-labels"
          ? visibleOverlayLabels(state).length
          : visibleOverlayOptions(state).length;
  return {
    ...state,
    overlay: { ...overlay, selectedIndex: clamp(overlay.selectedIndex + delta, count) },
  };
}

export function toggleSelectedLabel(state: AppState): AppState {
  const overlay = state.overlay;
  if (overlay?.kind === "labels" || overlay?.kind === "create-labels") {
    const label = visibleOverlayLabels(state)[overlay.selectedIndex];
    if (label === undefined) return state;
    const selectedIds = overlay.selectedIds.includes(label.id)
      ? overlay.selectedIds.filter((id) => id !== label.id)
      : [...overlay.selectedIds, label.id];
    return { ...state, overlay: { ...overlay, selectedIds } };
  }
  return state;
}

export function applyIssueUpdate(state: AppState, updated: UpdatedIssue): AppState {
  const issues = state.issues.map((issue) =>
    issue.id === updated.id
      ? {
          ...issue,
          title: updated.title,
          description: updated.description,
          updatedAt: updated.updatedAt,
          state: updated.state,
          cycle: updated.cycle,
          project: updated.project,
          assignee: updated.assignee,
          priority: updated.priority,
          priorityLabel: priorityLabel(updated.priority),
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

export function issueEditDraft(issue: Issue): IssueEditDraft {
  return {
    issueId: issue.id,
    title: issue.title,
    description: issue.description ?? "",
  };
}

export function emptyIssueCreateDraft(teamId: string): IssueCreateDraft {
  return {
    teamId,
    title: "",
    description: "",
    stateId: null,
    stateLabel: "Team default",
    assigneeId: null,
    assigneeLabel: "Unassigned",
    priority: 0,
    cycleId: null,
    cycleLabel: "Unassigned",
    projectId: null,
    projectLabel: "Unassigned",
    labelIds: [],
    labelSummary: "None",
  };
}

export function emptyProjectCreateDraft(teamId: string): ProjectCreateDraft {
  return {
    teamId,
    name: "",
    description: "",
    content: "",
    leadId: null,
    leadLabel: "Unassigned",
  };
}

export function issueCreateInputFromDraft(draft: IssueCreateDraft): IssueCreateInput {
  return {
    teamId: draft.teamId,
    title: draft.title.trim(),
    description: draft.description,
    stateId: draft.stateId,
    assigneeId: draft.assigneeId,
    priority: draft.priority,
    cycleId: draft.cycleId,
    projectId: draft.projectId,
    labelIds: draft.labelIds,
  };
}

export function projectCreateInputFromDraft(draft: ProjectCreateDraft): ProjectCreateInput {
  return {
    name: draft.name.trim(),
    description: draft.description.trim(),
    content: draft.content,
    teamIds: [draft.teamId],
    leadId: draft.leadId,
  };
}

export function applyCreatedIssue(state: AppState, issue: Issue): AppState {
  const next = {
    ...state,
    issues: [issue, ...state.issues.filter((candidate) => candidate.id !== issue.id)],
    overlay: null,
  };
  return {
    ...next,
    selectedIssueId: retainSelectedIssueId(traversableIssues(next), issue.id),
  };
}

export function applyCreatedProject(state: AppState, project: Project): AppState {
  const projects = [project, ...state.projects.filter((candidate) => candidate.id !== project.id)];
  const next = { ...state, projects, overlay: null };
  if (next.screen.kind !== "catalog") return next;
  const index = visibleProjects(next).findIndex((item) => item.id === project.id);
  return {
    ...next,
    catalogIndexes: {
      ...next.catalogIndexes,
      [next.screen.catalog]: index < 0 ? 0 : index,
    },
  };
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const values = new Set(left);
  return values.size === left.length && right.every((value) => values.has(value));
}

export function issueChangeForOverlay(state: AppState, issue: Issue): IssueChange | null {
  const overlay = state.overlay;
  if (overlay === null) return null;
  if (overlay.kind === "edit-issue") {
    const title = overlay.draft.title.trim();
    const description = overlay.draft.description;
    return title === issue.title && description === (issue.description ?? "")
      ? null
      : { kind: "content", issueId: issue.id, title, description };
  }
  if (overlay.kind === "labels") {
    const currentIds = issue.labels.map((label) => label.id);
    return sameStringSet(currentIds, overlay.selectedIds)
      ? null
      : { kind: "labels", issueId: issue.id, labelIds: overlay.selectedIds };
  }
  if (overlay.kind !== "single-choice") return null;
  const option = selectedOverlayOption(state);
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
    default:
      return unreachable(overlay.action);
  }
}
