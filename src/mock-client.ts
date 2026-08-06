import type {
  Cycle,
  CycleRef,
  Issue,
  IssueChange,
  IssueLabel,
  IssueScope,
  Project,
  ProjectRef,
  Team,
  UpdatedIssue,
  UserSummary,
  WorkflowState,
} from "./domain";
import type { AuthStatus, LinearClient } from "./linear-client";

type CycleDefinition = Cycle;
type ProjectDefinition = Project;

const MOCK_AUTH_STATUS: AuthStatus = {
  viewer: { id: "mock-viewer", name: "Mock Viewer", email: "mock.viewer@example.invalid" },
  workspace: {
    id: "mock-workspace",
    name: "Linearctl Mock Workspace",
    urlKey: "fs0414",
  },
};

const APP_TEAM: Team = {
  id: "mock-team-app",
  name: "Product Engineering",
  key: "APP",
};
const PLATFORM_TEAM: Team = {
  id: "mock-team-plat",
  name: "Platform & Reliability",
  key: "PLAT",
};
const GROWTH_TEAM: Team = {
  id: "mock-team-grow",
  name: "Growth Operations",
  key: "GROW",
};

const MOCK_VIEWER_USER: UserSummary = { id: "mock-viewer", name: "Mock Viewer" };
const AIKO_USER: UserSummary = { id: "mock-user-aiko", name: "Aiko Takahashi" };
const YUTA_USER: UserSummary = { id: "mock-user-yuta", name: "Yuta Yamada" };
const REN_USER: UserSummary = { id: "mock-user-ren", name: "Ren Sato" };
const MEI_USER: UserSummary = { id: "mock-user-mei", name: "Mei Suzuki" };
const HARU_USER: UserSummary = { id: "mock-user-haru", name: "Haru Tanaka" };
const MOCK_USERS: UserSummary[] = [
  MOCK_VIEWER_USER,
  AIKO_USER,
  YUTA_USER,
  REN_USER,
  MEI_USER,
  HARU_USER,
];

const BUG_LABEL: IssueLabel = { id: "label-bug", name: "Bug", color: "#EF4444", team: null };
const PERFORMANCE_LABEL: IssueLabel = {
  id: "label-performance",
  name: "Performance",
  color: "#F59E0B",
  team: null,
};
const APP_LABEL: IssueLabel = {
  id: "label-app",
  name: "Mobile",
  color: "#60A5FA",
  team: APP_TEAM,
};
const PLATFORM_LABEL: IssueLabel = {
  id: "label-platform",
  name: "Infrastructure",
  color: "#A78BFA",
  team: PLATFORM_TEAM,
};
const GROWTH_LABEL: IssueLabel = {
  id: "label-growth",
  name: "Experiment",
  color: "#10B981",
  team: GROWTH_TEAM,
};
const MOCK_LABELS: IssueLabel[] = [
  BUG_LABEL,
  PERFORMANCE_LABEL,
  APP_LABEL,
  PLATFORM_LABEL,
  GROWTH_LABEL,
];

const APP_BACKLOG: WorkflowState = {
  id: "app-backlog",
  name: "Backlog",
  type: "backlog",
  color: "#6B7280",
  position: 0,
};
const APP_READY: WorkflowState = {
  id: "app-ready",
  name: "Ready",
  type: "unstarted",
  color: "#60A5FA",
  position: 1,
};
const APP_PROGRESS: WorkflowState = {
  id: "app-progress",
  name: "In Progress",
  type: "started",
  color: "#F59E0B",
  position: 2,
};
const APP_REVIEW: WorkflowState = {
  id: "app-review",
  name: "In Review",
  type: "started",
  color: "#A78BFA",
  position: 3,
};
const APP_DONE: WorkflowState = {
  id: "app-done",
  name: "Done",
  type: "completed",
  color: "#22C55E",
  position: 4,
};
const APP_STATES = [APP_BACKLOG, APP_READY, APP_PROGRESS, APP_REVIEW, APP_DONE];

const PLATFORM_TRIAGE: WorkflowState = {
  id: "plat-triage",
  name: "Triage",
  type: "triage",
  color: "#A78BFA",
  position: 0,
};
const PLATFORM_BACKLOG: WorkflowState = {
  id: "plat-backlog",
  name: "Backlog",
  type: "backlog",
  color: "#6B7280",
  position: 1,
};
const PLATFORM_INVESTIGATING: WorkflowState = {
  id: "plat-investigating",
  name: "Investigating",
  type: "started",
  color: "#F97316",
  position: 2,
};
const PLATFORM_BLOCKED: WorkflowState = {
  id: "plat-blocked",
  name: "Blocked",
  type: "started",
  color: "#EF4444",
  position: 3,
};
const PLATFORM_RESOLVED: WorkflowState = {
  id: "plat-resolved",
  name: "Resolved",
  type: "completed",
  color: "#10B981",
  position: 4,
};
const PLATFORM_STATES = [
  PLATFORM_TRIAGE,
  PLATFORM_BACKLOG,
  PLATFORM_INVESTIGATING,
  PLATFORM_BLOCKED,
  PLATFORM_RESOLVED,
];

const GROWTH_IDEAS: WorkflowState = {
  id: "grow-ideas",
  name: "Ideas",
  type: "backlog",
  color: "#6B7280",
  position: 0,
};
const GROWTH_PLANNED: WorkflowState = {
  id: "grow-planned",
  name: "Planned",
  type: "unstarted",
  color: "#60A5FA",
  position: 1,
};
const GROWTH_RUNNING: WorkflowState = {
  id: "grow-running",
  name: "Running",
  type: "started",
  color: "#F59E0B",
  position: 2,
};
const GROWTH_MEASURING: WorkflowState = {
  id: "grow-measuring",
  name: "Measuring",
  type: "started",
  color: "#A78BFA",
  position: 3,
};
const GROWTH_DONE: WorkflowState = {
  id: "grow-done",
  name: "Done",
  type: "completed",
  color: "#22C55E",
  position: 4,
};
const GROWTH_STATES = [GROWTH_IDEAS, GROWTH_PLANNED, GROWTH_RUNNING, GROWTH_MEASURING, GROWTH_DONE];

const APP_CYCLE: CycleRef = {
  id: "mock-cycle-app-24",
  number: 24,
  name: "2026 Summer 4",
};
const PLATFORM_CYCLE: CycleRef = {
  id: "mock-cycle-plat-31",
  number: 31,
  name: "Reliability Sprint 31",
};
const GROWTH_CYCLE: CycleRef = {
  id: "mock-cycle-grow-18",
  number: 18,
  name: "August Experiments",
};

const MOBILE_RENEWAL_PROJECT: ProjectRef = {
  id: "mock-project-mobile-renewal",
  name: "Mobile Experience Renewal",
  slugId: "mobile-experience-renewal",
};
const RELIABILITY_PROJECT: ProjectRef = {
  id: "mock-project-reliability",
  name: "Reliability Improvement Program",
  slugId: "reliability-program",
};
const GROWTH_EXPERIMENTS_PROJECT: ProjectRef = {
  id: "mock-project-growth-experiments",
  name: "Growth Experiment Platform",
  slugId: "growth-experiment-platform",
};
const ONCALL_AUTOMATION_PROJECT: ProjectRef = {
  id: "mock-project-oncall-automation",
  name: "On-call Automation",
  slugId: "oncall-automation",
};

const MOCK_CYCLE_DEFINITIONS: CycleDefinition[] = [
  {
    ...APP_CYCLE,
    startsAt: "2026-08-03T00:00:00.000Z",
    endsAt: "2026-08-16T23:59:59.000Z",
    progress: 0.58,
    isActive: true,
    team: APP_TEAM,
  },
  {
    ...PLATFORM_CYCLE,
    startsAt: "2026-08-01T00:00:00.000Z",
    endsAt: "2026-08-14T23:59:59.000Z",
    progress: 0.42,
    isActive: true,
    team: PLATFORM_TEAM,
  },
  {
    ...GROWTH_CYCLE,
    startsAt: "2026-08-04T00:00:00.000Z",
    endsAt: "2026-08-17T23:59:59.000Z",
    progress: 0.67,
    isActive: true,
    team: GROWTH_TEAM,
  },
];

const MOCK_PROJECT_DEFINITIONS: ProjectDefinition[] = [
  {
    ...MOBILE_RENEWAL_PROJECT,
    description: "Shorten the mobile purchase path and improve performance and usability.",
    url: "https://linear.example.invalid/fs0414/project/mobile-experience-renewal",
    progress: 0.62,
    health: "onTrack",
    startDate: "2026-06-15",
    targetDate: "2026-09-12",
    status: { id: "project-started", name: "In Progress", type: "started", color: "#F59E0B" },
    lead: AIKO_USER,
    teams: [APP_TEAM],
  },
  {
    ...RELIABILITY_PROJECT,
    description: "Reduce incident recovery time and continuously measure critical-path uptime.",
    url: "https://linear.example.invalid/fs0414/project/reliability-program",
    progress: 0.38,
    health: "atRisk",
    startDate: null,
    targetDate: "2026-10-30",
    status: { id: "project-started", name: "In Progress", type: "started", color: "#F59E0B" },
    lead: REN_USER,
    teams: [PLATFORM_TEAM],
  },
  {
    ...GROWTH_EXPERIMENTS_PROJECT,
    description: "Standardize experiment assignment and measurement on a safe shared platform.",
    url: "https://linear.example.invalid/fs0414/project/growth-experiment-platform",
    progress: 0.18,
    health: null,
    startDate: "2026-08-20",
    targetDate: "2026-11-28",
    status: { id: "project-planned", name: "Planned", type: "planned", color: "#60A5FA" },
    lead: null,
    teams: [APP_TEAM, GROWTH_TEAM],
  },
  {
    ...ONCALL_AUTOMATION_PROJECT,
    description: "Automate routine incident response and stakeholder notifications.",
    url: "https://linear.example.invalid/fs0414/project/oncall-automation",
    progress: 0.44,
    health: "offTrack",
    startDate: "2026-05-08",
    targetDate: null,
    status: { id: "project-paused", name: "Paused", type: "paused", color: "#A78BFA" },
    lead: null,
    teams: [PLATFORM_TEAM, GROWTH_TEAM],
  },
];

interface IssueMetadata {
  priority: number;
  estimate: number | null;
  assignee: UserSummary | null;
  labels: IssueLabel[];
}

function issueMetadata(identifier: string): IssueMetadata {
  switch (identifier) {
    case "APP-101":
      return {
        priority: 1,
        estimate: 5,
        assignee: MOCK_VIEWER_USER,
        labels: [PERFORMANCE_LABEL, APP_LABEL],
      };
    case "APP-102":
      return { priority: 3, estimate: 3, assignee: AIKO_USER, labels: [APP_LABEL] };
    case "APP-103":
      return { priority: 2, estimate: 8, assignee: null, labels: [] };
    case "APP-104":
      return { priority: 2, estimate: 5, assignee: YUTA_USER, labels: [BUG_LABEL, APP_LABEL] };
    case "APP-105":
      return { priority: 4, estimate: 2, assignee: null, labels: [] };
    case "PLAT-201":
      return {
        priority: 1,
        estimate: 5,
        assignee: MOCK_VIEWER_USER,
        labels: [BUG_LABEL, PLATFORM_LABEL],
      };
    case "PLAT-202":
      return { priority: 3, estimate: 2, assignee: REN_USER, labels: [PLATFORM_LABEL] };
    case "PLAT-203":
      return { priority: 2, estimate: 8, assignee: null, labels: [PLATFORM_LABEL] };
    case "PLAT-204":
      return {
        priority: 3,
        estimate: 3,
        assignee: REN_USER,
        labels: [PERFORMANCE_LABEL, PLATFORM_LABEL],
      };
    case "PLAT-205":
      return { priority: 0, estimate: null, assignee: null, labels: [] };
    case "GROW-301":
      return { priority: 2, estimate: 3, assignee: MOCK_VIEWER_USER, labels: [GROWTH_LABEL] };
    case "GROW-302":
      return { priority: 3, estimate: 2, assignee: MEI_USER, labels: [GROWTH_LABEL] };
    case "GROW-303":
      return {
        priority: 4,
        estimate: 5,
        assignee: HARU_USER,
        labels: [BUG_LABEL, GROWTH_LABEL],
      };
    case "GROW-304":
      return { priority: 3, estimate: 3, assignee: MEI_USER, labels: [GROWTH_LABEL] };
    default:
      return { priority: 0, estimate: null, assignee: null, labels: [] };
  }
}

function defineIssue(
  input: Omit<Issue, "url" | "priority" | "estimate" | "assignee" | "labels" | "labelsComplete">,
): Issue {
  return {
    ...issueMetadata(input.identifier),
    ...input,
    labelsComplete: true,
    url: `https://linear.example.invalid/fs0414/issue/${input.identifier}`,
  };
}

const MOCK_ISSUES: Issue[] = [
  defineIssue({
    id: "mock-issue-app-101",
    identifier: "APP-101",
    title: "Improve checkout confirmation performance",
    description: "Measure image and pricing latency and keep the initial render below one second.",
    priorityLabel: "Urgent",
    updatedAt: "2026-08-06T05:42:00.000Z",
    state: APP_PROGRESS,
    team: APP_TEAM,
    cycle: APP_CYCLE,
    project: MOBILE_RENEWAL_PROJECT,
  }),
  defineIssue({
    id: "mock-issue-app-102",
    identifier: "APP-102",
    title: "Add interaction metrics to the product list",
    description: "Standardize event names and properties for filter and sort usage analysis.",
    priorityLabel: "Medium",
    updatedAt: "2026-08-05T10:18:00.000Z",
    state: APP_READY,
    team: APP_TEAM,
    cycle: APP_CYCLE,
    project: null,
  }),
  defineIssue({
    id: "mock-issue-app-103",
    identifier: "APP-103",
    title: "Design the experiment feature flag evaluation API",
    description: "Define a consistent API contract for user-segment experiment assignment.",
    priorityLabel: "High",
    updatedAt: "2026-08-04T08:05:00.000Z",
    state: APP_BACKLOG,
    team: APP_TEAM,
    cycle: null,
    project: GROWTH_EXPERIMENTS_PROJECT,
  }),
  defineIssue({
    id: "mock-issue-app-104",
    identifier: "APP-104",
    title: "Stabilize the iOS payment return flow",
    description: "Prevent stale order state immediately after returning from external payment.",
    priorityLabel: "High",
    updatedAt: "2026-08-03T12:30:00.000Z",
    state: APP_REVIEW,
    team: APP_TEAM,
    cycle: APP_CYCLE,
    project: MOBILE_RENEWAL_PROJECT,
  }),
  defineIssue({
    id: "mock-issue-app-105",
    identifier: "APP-105",
    title: "Standardize shared component spacing",
    description: "Audit screen differences and identify spacing values to move into design tokens.",
    priorityLabel: "Low",
    updatedAt: "2026-07-31T02:14:00.000Z",
    state: APP_BACKLOG,
    team: APP_TEAM,
    cycle: null,
    project: null,
  }),
  defineIssue({
    id: "mock-issue-plat-201",
    identifier: "PLAT-201",
    title: "Verify the primary database failover procedure",
    description: "Measure failover and recovery in staging and update the runbook.",
    priorityLabel: "Urgent",
    updatedAt: "2026-08-06T03:26:00.000Z",
    state: PLATFORM_INVESTIGATING,
    team: PLATFORM_TEAM,
    cycle: PLATFORM_CYCLE,
    project: RELIABILITY_PROJECT,
  }),
  defineIssue({
    id: "mock-issue-plat-202",
    identifier: "PLAT-202",
    title: "Tune API latency alert thresholds",
    description: "Reduce noisy alerts without increasing misses using hourly baseline data.",
    priorityLabel: "Medium",
    updatedAt: "2026-08-05T01:48:00.000Z",
    state: PLATFORM_TRIAGE,
    team: PLATFORM_TEAM,
    cycle: PLATFORM_CYCLE,
    project: null,
  }),
  defineIssue({
    id: "mock-issue-plat-203",
    identifier: "PLAT-203",
    title: "Automate the incident response runbook",
    description: "Define diagnostic commands and approval boundaries for safe retries.",
    priorityLabel: "High",
    updatedAt: "2026-08-04T23:12:00.000Z",
    state: PLATFORM_BLOCKED,
    team: PLATFORM_TEAM,
    cycle: null,
    project: ONCALL_AUTOMATION_PROJECT,
  }),
  defineIssue({
    id: "mock-issue-plat-204",
    identifier: "PLAT-204",
    title: "Visualize CI runner wait times",
    description: "Build a dashboard of queue and execution time by repository.",
    priorityLabel: "Medium",
    updatedAt: "2026-08-03T06:37:00.000Z",
    state: PLATFORM_INVESTIGATING,
    team: PLATFORM_TEAM,
    cycle: PLATFORM_CYCLE,
    project: RELIABILITY_PROJECT,
  }),
  defineIssue({
    id: "mock-issue-plat-205",
    identifier: "PLAT-205",
    title: "Audit development secret access paths",
    description: "Verify ownership and rotation procedures for local and CI credentials.",
    priorityLabel: "No priority",
    updatedAt: "2026-07-30T09:20:00.000Z",
    state: PLATFORM_BACKLOG,
    team: PLATFORM_TEAM,
    cycle: null,
    project: null,
  }),
  defineIssue({
    id: "mock-issue-grow-301",
    identifier: "GROW-301",
    title: "Launch the new-user landing page A/B test",
    description: "Split two value propositions evenly and compare completion and drop-off rates.",
    priorityLabel: "High",
    updatedAt: "2026-08-06T00:55:00.000Z",
    state: GROWTH_RUNNING,
    team: GROWTH_TEAM,
    cycle: GROWTH_CYCLE,
    project: GROWTH_EXPERIMENTS_PROJECT,
  }),
  defineIssue({
    id: "mock-issue-grow-302",
    identifier: "GROW-302",
    title: "Update the paid attribution dashboard",
    description: "Compare registrations and activation rates by channel over the same period.",
    priorityLabel: "Medium",
    updatedAt: "2026-08-05T04:44:00.000Z",
    state: GROWTH_MEASURING,
    team: GROWTH_TEAM,
    cycle: GROWTH_CYCLE,
    project: null,
  }),
  defineIssue({
    id: "mock-issue-grow-303",
    identifier: "GROW-303",
    title: "Route campaign anomaly alerts automatically",
    description: "Resolve alert recipients from channel and campaign ownership mappings.",
    priorityLabel: "Low",
    updatedAt: "2026-08-04T02:08:00.000Z",
    state: GROWTH_PLANNED,
    team: GROWTH_TEAM,
    cycle: null,
    project: ONCALL_AUTOMATION_PROJECT,
  }),
  defineIssue({
    id: "mock-issue-grow-304",
    identifier: "GROW-304",
    title: "Recalculate onboarding segment performance",
    description: "Compare retention by first action and prioritize the next experiment segment.",
    priorityLabel: "Medium",
    updatedAt: "2026-08-02T11:33:00.000Z",
    state: GROWTH_MEASURING,
    team: GROWTH_TEAM,
    cycle: GROWTH_CYCLE,
    project: GROWTH_EXPERIMENTS_PROJECT,
  }),
  defineIssue({
    id: "mock-issue-grow-305",
    identifier: "GROW-305",
    title: "Classify campaigns for naming migration",
    description: "Assess reporting impact and identify campaigns ready for the new naming scheme.",
    priorityLabel: "No priority",
    updatedAt: "2026-07-29T07:16:00.000Z",
    state: GROWTH_IDEAS,
    team: GROWTH_TEAM,
    cycle: null,
    project: null,
  }),
].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

function clone<T>(value: T): T {
  return structuredClone(value);
}

function updatedIssue(issue: Issue): UpdatedIssue {
  return clone({
    id: issue.id,
    state: issue.state,
    cycle: issue.cycle,
    project: issue.project,
    assignee: issue.assignee,
    priority: issue.priority,
    labels: issue.labels,
    labelsComplete: issue.labelsComplete,
  });
}

export class MockLinearClient implements LinearClient {
  private readonly authStatus = clone(MOCK_AUTH_STATUS);
  private readonly issues = clone(MOCK_ISSUES);
  private readonly cycleDefinitions = clone(MOCK_CYCLE_DEFINITIONS);
  private readonly projectDefinitions = clone(MOCK_PROJECT_DEFINITIONS);
  private readonly users = clone(MOCK_USERS);
  private readonly labels = clone(MOCK_LABELS);
  private readonly statesByTeam = new Map<string, WorkflowState[]>([
    [APP_TEAM.id, clone(APP_STATES)],
    [PLATFORM_TEAM.id, clone(PLATFORM_STATES)],
    [GROWTH_TEAM.id, clone(GROWTH_STATES)],
  ]);

  async getAuthStatus(): Promise<AuthStatus> {
    return clone(this.authStatus);
  }

  async getTeams(): Promise<Team[]> {
    return clone([APP_TEAM, PLATFORM_TEAM, GROWTH_TEAM]);
  }

  async getIssues(scope: IssueScope): Promise<Issue[]> {
    const issues = this.issues.filter((issue) => {
      switch (scope.kind) {
        case "assigned-to-me":
          return issue.assignee?.id === this.authStatus.viewer.id;
        case "team":
          return issue.team.id === scope.teamId;
        case "cycle":
          return issue.cycle?.id === scope.cycleId;
        case "project":
          return issue.project?.id === scope.projectId;
      }
    });
    return clone(issues);
  }

  async getTeamMembers(teamId: string): Promise<UserSummary[]> {
    const membersByTeam = new Map<string, UserSummary[]>([
      [APP_TEAM.id, [MOCK_VIEWER_USER, AIKO_USER, YUTA_USER]],
      [PLATFORM_TEAM.id, [MOCK_VIEWER_USER, REN_USER]],
      [GROWTH_TEAM.id, [MOCK_VIEWER_USER, MEI_USER, HARU_USER]],
    ]);
    const members = membersByTeam.get(teamId);
    if (members === undefined) throw new Error(`Mock team not found: ${teamId}`);
    return clone(members);
  }

  async getIssueLabels(): Promise<IssueLabel[]> {
    return clone(this.labels);
  }

  async getCurrentCycles(): Promise<Cycle[]> {
    return clone(this.cycleDefinitions);
  }

  async getActiveProjects(): Promise<Project[]> {
    return clone(this.projectDefinitions);
  }

  async getWorkflowStates(teamId: string): Promise<WorkflowState[]> {
    const states = this.statesByTeam.get(teamId);
    if (states === undefined) throw new Error(`Mock team not found: ${teamId}`);
    return clone(states);
  }

  async updateIssue(change: IssueChange): Promise<UpdatedIssue> {
    const issue = this.issues.find((candidate) => candidate.id === change.issueId);
    if (issue === undefined) throw new Error(`Mock issue not found: ${change.issueId}`);

    switch (change.kind) {
      case "status": {
        const state = this.statesByTeam
          .get(issue.team.id)
          ?.find((candidate) => candidate.id === change.stateId);
        if (state === undefined) throw new Error(`Mock status not found: ${change.stateId}`);
        issue.state = clone(state);
        break;
      }
      case "cycle": {
        if (change.cycleId === null) {
          issue.cycle = null;
          break;
        }
        const cycle = this.cycleDefinitions.find((candidate) => candidate.id === change.cycleId);
        if (cycle === undefined || cycle.team.id !== issue.team.id) {
          throw new Error(`Mock cycle not found: ${change.cycleId}`);
        }
        issue.cycle = { id: cycle.id, number: cycle.number, name: cycle.name };
        break;
      }
      case "project": {
        if (change.projectId === null) {
          issue.project = null;
          break;
        }
        const project = this.projectDefinitions.find(
          (candidate) => candidate.id === change.projectId,
        );
        if (project === undefined || !project.teams.some((team) => team.id === issue.team.id)) {
          throw new Error(`Mock project not found: ${change.projectId}`);
        }
        issue.project = { id: project.id, name: project.name, slugId: project.slugId };
        break;
      }
      case "assignee": {
        if (change.assigneeId === null) {
          issue.assignee = null;
          break;
        }
        const assignee = this.users.find((candidate) => candidate.id === change.assigneeId);
        if (assignee === undefined) {
          throw new Error(`Mock assignee not found: ${change.assigneeId}`);
        }
        issue.assignee = clone(assignee);
        break;
      }
      case "priority":
        if (!Number.isInteger(change.priority) || change.priority < 0 || change.priority > 4) {
          throw new Error(`Invalid mock priority: ${change.priority}`);
        }
        issue.priority = change.priority;
        issue.priorityLabel =
          ["No priority", "Urgent", "High", "Medium", "Low"][change.priority] ?? "No priority";
        break;
      case "labels": {
        const labels = change.labelIds.map((labelId) =>
          this.labels.find((candidate) => candidate.id === labelId),
        );
        if (
          labels.some(
            (label) =>
              label === undefined || (label.team !== null && label.team.id !== issue.team.id),
          )
        ) {
          throw new Error("Mock label not found or does not belong to the issue team");
        }
        issue.labels = labels.flatMap((label) => (label === undefined ? [] : [clone(label)]));
        break;
      }
    }

    return updatedIssue(issue);
  }
}
