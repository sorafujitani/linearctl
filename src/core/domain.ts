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
  | { kind: "current-cycle"; teamId: string }
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

/** One bounded read of an issue list; hasMore means rows past the read limit exist upstream. */
export interface IssuePage {
  issues: Issue[];
  hasMore: boolean;
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

export interface IssueComment {
  id: string;
  body: string;
  createdAt: string;
  /** Null for bot or integration comments that carry no user. */
  author: string | null;
}

/** One bounded read of an issue's comments; hasMore means older comments exist upstream. */
export interface IssueCommentPage {
  comments: IssueComment[];
  hasMore: boolean;
}

/** One bounded read of a project list; hasMore means rows past the read limit exist upstream. */
export interface ProjectPage {
  projects: Project[];
  hasMore: boolean;
}

export type IssueChange =
  | { kind: "content"; issueId: string; title: string; description: string }
  | { kind: "title"; issueId: string; title: string }
  | { kind: "description"; issueId: string; description: string }
  | { kind: "status"; issueId: string; stateId: string }
  | { kind: "cycle"; issueId: string; cycleId: string | null }
  | { kind: "project"; issueId: string; projectId: string | null }
  | { kind: "assignee"; issueId: string; assigneeId: string | null }
  | { kind: "priority"; issueId: string; priority: number }
  | { kind: "labels"; issueId: string; labelIds: string[] };

export interface UpdatedIssue {
  id: string;
  title: string;
  description: string | null;
  updatedAt: string;
  state: WorkflowState;
  cycle: CycleRef | null;
  project: ProjectRef | null;
  assignee: UserSummary | null;
  priority: number;
  labels: IssueLabel[];
  labelsComplete: boolean;
}

export interface IssueCreateInput {
  teamId: string;
  title: string;
  description: string;
  stateId: string | null;
  assigneeId: string | null;
  priority: number;
  cycleId: string | null;
  projectId: string | null;
  labelIds: string[];
}

export interface ProjectCreateInput {
  name: string;
  description: string;
  content: string;
  teamIds: string[];
  leadId: string | null;
}

const ISSUE_IDENTIFIER_PATTERN = /^[A-Za-z][A-Za-z0-9_]*-\d+$/;

/**
 * Human identifiers (app-101) are trimmed and uppercased so mock and real
 * clients resolve them identically; UUIDs and other shapes pass through.
 */
export function normalizeIssueIdentifier(raw: string): string {
  const trimmed = raw.trim();
  return ISSUE_IDENTIFIER_PATTERN.test(trimmed) ? trimmed.toLocaleUpperCase() : trimmed;
}

/** Linear priority values 0-4 in order; index with a priority number. */
export const PRIORITY_LABELS = ["No priority", "Urgent", "High", "Medium", "Low"] as const;

export function priorityLabel(priority: number): string {
  return PRIORITY_LABELS[priority] ?? PRIORITY_LABELS[0];
}

/** Case-insensitive substring match shared by list search, picker filters, and help search. */
export function matchesSearch(query: string, candidates: readonly string[]): boolean {
  const normalized = query.trim().toLocaleLowerCase();
  return (
    normalized.length === 0 ||
    candidates.some((candidate) => candidate.toLocaleLowerCase().includes(normalized))
  );
}

export function sortWorkflowStates(states: readonly WorkflowState[]): WorkflowState[] {
  return [...states].sort(
    (left, right) => left.position - right.position || left.name.localeCompare(right.name),
  );
}
