export interface Workspace {
  id: string;
  name: string;
  urlKey: string;
}

export interface Viewer {
  id: string;
  name: string;
  email: string;
}

export interface WorkflowState {
  id: string;
  name: string;
  type: string;
  color: string;
  position: number;
}

export interface ProjectStatus {
  id: string;
  name: string;
  type: string;
  color: string;
}

export interface Team {
  id: string;
  name: string;
  key: string;
}

export interface UserSummary {
  id: string;
  name: string;
}

export interface IssueLabel {
  id: string;
  name: string;
  color: string;
  team: Team | null;
}

export type IssueScope =
  | { kind: "assigned-to-me"; teamId?: string }
  | { kind: "team"; teamId: string }
  | { kind: "cycle"; cycleId: string }
  | { kind: "project"; projectId: string };

export interface CycleRef {
  id: string;
  number: number;
  name: string | null;
}

export interface ProjectRef {
  id: string;
  name: string;
  slugId: string;
}

export interface IssueSummary {
  id: string;
  identifier: string;
  title: string;
  state: WorkflowState;
  team: Team;
}

export interface Issue extends IssueSummary {
  description: string | null;
  priority: number;
  priorityLabel: string;
  estimate: number | null;
  assignee: UserSummary | null;
  labels: IssueLabel[];
  labelsComplete: boolean;
  url: string;
  updatedAt: string;
  cycle: CycleRef | null;
  project: ProjectRef | null;
}

export interface Cycle extends CycleRef {
  startsAt: string;
  endsAt: string;
  progress: number;
  isActive: boolean;
  team: Team;
}

export interface Project extends ProjectRef {
  description: string;
  url: string;
  progress: number;
  health: string | null;
  startDate: string | null;
  targetDate: string | null;
  status: ProjectStatus;
  lead: UserSummary | null;
  teams: Team[];
}

export type IssueChange =
  | { kind: "status"; issueId: string; stateId: string }
  | { kind: "cycle"; issueId: string; cycleId: string | null }
  | { kind: "project"; issueId: string; projectId: string | null }
  | { kind: "assignee"; issueId: string; assigneeId: string | null }
  | { kind: "priority"; issueId: string; priority: number }
  | { kind: "labels"; issueId: string; labelIds: string[] };

export interface UpdatedIssue {
  id: string;
  state: WorkflowState;
  cycle: CycleRef | null;
  project: ProjectRef | null;
  assignee: UserSummary | null;
  priority: number;
  labels: IssueLabel[];
  labelsComplete: boolean;
}

const normalizeSearch = (value: string): string => value.trim().toLocaleLowerCase();

function matchesSearch(query: string, candidates: readonly string[]): boolean {
  const normalized = normalizeSearch(query);
  return (
    normalized.length === 0 ||
    candidates.some((candidate) => candidate.toLocaleLowerCase().includes(normalized))
  );
}

export function filterIssues(issues: readonly Issue[], query: string): Issue[] {
  return issues.filter((issue) =>
    matchesSearch(query, [
      issue.identifier,
      issue.title,
      issue.description ?? "",
      issue.state.name,
      issue.team.name,
      issue.priorityLabel,
      issue.assignee?.name ?? "",
      issue.cycle?.name ?? "",
      issue.cycle === null ? "" : String(issue.cycle.number),
      issue.project?.name ?? "",
      ...issue.labels.map((label) => label.name),
    ]),
  );
}

export function filterCycles(cycles: readonly Cycle[], query: string): Cycle[] {
  return cycles.filter((cycle) =>
    matchesSearch(query, [cycle.name ?? "", String(cycle.number), cycle.team.name, cycle.team.key]),
  );
}

export function filterProjects(projects: readonly Project[], query: string): Project[] {
  return projects.filter((project) =>
    matchesSearch(query, [
      project.name,
      project.description,
      project.slugId,
      project.status.name,
      project.health ?? "",
      project.lead?.name ?? "",
      ...project.teams.flatMap((team) => [team.name, team.key]),
    ]),
  );
}

export function clampSelection(index: number, itemCount: number): number {
  if (itemCount <= 0) return 0;
  return Math.min(Math.max(index, 0), itemCount - 1);
}

export function sortWorkflowStates(states: readonly WorkflowState[]): WorkflowState[] {
  return [...states].sort(
    (left, right) => left.position - right.position || left.name.localeCompare(right.name),
  );
}

export function cycleRef(cycle: Cycle): CycleRef {
  return { id: cycle.id, number: cycle.number, name: cycle.name };
}

export function projectRef(project: Project): ProjectRef {
  return { id: project.id, name: project.name, slugId: project.slugId };
}
