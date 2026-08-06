import * as v from "valibot";

import type {
  Cycle,
  Issue,
  IssueChange,
  IssueLabel,
  IssueScope,
  Project,
  Team,
  UpdatedIssue,
  UserSummary,
  Viewer,
  WorkflowState,
  Workspace,
} from "./domain";

const LINEAR_GRAPHQL_ENDPOINT = "https://api.linear.app/graphql";

const graphqlErrorSchema = v.object({
  message: v.string(),
  path: v.optional(v.array(v.union([v.string(), v.number()]))),
  extensions: v.optional(v.record(v.string(), v.unknown())),
});

const graphqlEnvelopeSchema = v.object({
  data: v.optional(v.unknown()),
  errors: v.optional(v.array(graphqlErrorSchema)),
});

const workspaceSchema = v.object({ id: v.string(), name: v.string(), urlKey: v.string() });
const viewerSchema = v.object({
  id: v.string(),
  name: v.string(),
  email: v.string(),
  organization: workspaceSchema,
});
const workflowStateSchema = v.object({
  id: v.string(),
  name: v.string(),
  type: v.string(),
  color: v.string(),
  position: v.number(),
});
const projectStatusSchema = v.object({
  id: v.string(),
  name: v.string(),
  type: v.string(),
  color: v.string(),
});
const teamSchema = v.object({ id: v.string(), name: v.string(), key: v.string() });
const userSummarySchema = v.object({ id: v.string(), name: v.string() });
const cycleRefSchema = v.object({
  id: v.string(),
  number: v.number(),
  name: v.nullable(v.string()),
});
const projectRefSchema = v.object({ id: v.string(), name: v.string(), slugId: v.string() });
const issueLabelSchema = v.object({
  id: v.string(),
  name: v.string(),
  color: v.string(),
  team: v.nullable(teamSchema),
});
const issueSummarySchema = v.object({
  id: v.string(),
  identifier: v.string(),
  title: v.string(),
  state: workflowStateSchema,
  team: teamSchema,
});
const issueSchema = v.object({
  ...issueSummarySchema.entries,
  description: v.nullable(v.string()),
  priority: v.number(),
  priorityLabel: v.string(),
  estimate: v.nullable(v.number()),
  assignee: v.nullable(userSummarySchema),
  labels: v.object({
    nodes: v.array(issueLabelSchema),
    pageInfo: v.object({ hasNextPage: v.boolean() }),
  }),
  url: v.string(),
  updatedAt: v.string(),
  cycle: v.nullable(cycleRefSchema),
  project: v.nullable(projectRefSchema),
});
const cycleSchema = v.object({
  ...cycleRefSchema.entries,
  startsAt: v.string(),
  endsAt: v.string(),
  progress: v.number(),
  isActive: v.boolean(),
  team: teamSchema,
});
const projectSchema = v.object({
  ...projectRefSchema.entries,
  description: v.string(),
  url: v.string(),
  progress: v.number(),
  health: v.nullable(v.string()),
  startDate: v.nullable(v.string()),
  targetDate: v.nullable(v.string()),
  status: projectStatusSchema,
  lead: v.nullable(userSummarySchema),
  teams: v.object({ nodes: v.array(teamSchema) }),
});
const updatedIssueSchema = v.object({
  id: v.string(),
  state: workflowStateSchema,
  cycle: v.nullable(cycleRefSchema),
  project: v.nullable(projectRefSchema),
  assignee: v.nullable(userSummarySchema),
  priority: v.number(),
  labels: v.object({
    nodes: v.array(issueLabelSchema),
    pageInfo: v.object({ hasNextPage: v.boolean() }),
  }),
});

const authStatusSchema = v.object({ viewer: viewerSchema });
const assignedIssuesSchema = v.object({
  viewer: v.object({ assignedIssues: v.object({ nodes: v.array(issueSchema) }) }),
});
const scopedIssuesSchema = v.object({ issues: v.object({ nodes: v.array(issueSchema) }) });
const teamsSchema = v.object({ teams: v.object({ nodes: v.array(teamSchema) }) });
const teamMembersSchema = v.object({
  team: v.object({ members: v.object({ nodes: v.array(userSummarySchema) }) }),
});
const issueLabelsSchema = v.object({ issueLabels: v.object({ nodes: v.array(issueLabelSchema) }) });
const currentCyclesSchema = v.object({
  teams: v.object({ nodes: v.array(v.object({ activeCycle: v.nullable(cycleSchema) })) }),
});
const teamCurrentCycleSchema = v.object({
  team: v.object({ activeCycle: v.nullable(cycleSchema) }),
});
const activeProjectsSchema = v.object({
  projects: v.object({ nodes: v.array(projectSchema) }),
});
const teamActiveProjectsSchema = v.object({
  team: v.object({ projects: v.object({ nodes: v.array(projectSchema) }) }),
});
const workflowStatesSchema = v.object({
  workflowStates: v.object({ nodes: v.array(workflowStateSchema) }),
});
const updateIssueSchema = v.object({
  issueUpdate: v.object({ success: v.boolean(), issue: updatedIssueSchema }),
});

export type LinearApiErrorKind = "network" | "http" | "graphql" | "rate-limit" | "invalid-response";

export class LinearApiError extends Error {
  constructor(
    public readonly kind: LinearApiErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "LinearApiError";
  }
}

export interface AuthStatus {
  viewer: Viewer;
  workspace: Workspace;
}

export interface LinearClient {
  getAuthStatus(): Promise<AuthStatus>;
  getTeams(): Promise<Team[]>;
  getIssues(scope: IssueScope): Promise<Issue[]>;
  getTeamMembers(teamId: string): Promise<UserSummary[]>;
  getIssueLabels(): Promise<IssueLabel[]>;
  getCurrentCycles(teamId?: string): Promise<Cycle[]>;
  getActiveProjects(teamId?: string): Promise<Project[]>;
  getWorkflowStates(teamId: string): Promise<WorkflowState[]>;
  updateIssue(change: IssueChange): Promise<UpdatedIssue>;
}

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type Schema = v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>;

const AUTH_STATUS_QUERY = `
  query AuthStatus {
    viewer { id name email organization { id name urlKey } }
  }
`;

const ISSUE_FIELDS = `
  id identifier title description priority priorityLabel estimate url updatedAt
  state { id name type color position }
  team { id name key }
  assignee { id name }
  cycle { id number name }
  project { id name slugId }
  labels(first: 50) {
    nodes { id name color team { id name key } }
    pageInfo { hasNextPage }
  }
`;

const ASSIGNED_ISSUES_QUERY = `
  query AssignedIssues {
    viewer {
      assignedIssues(
        first: 50
        orderBy: updatedAt
        filter: { state: { type: { nin: ["completed", "canceled"] } } }
      ) {
        nodes {
          ${ISSUE_FIELDS}
        }
      }
    }
  }
`;

const TEAM_ASSIGNED_ISSUES_QUERY = `
  query TeamAssignedIssues($teamId: ID!) {
    viewer {
      assignedIssues(
        first: 50
        orderBy: updatedAt
        filter: {
          team: { id: { eq: $teamId } }
          state: { type: { nin: ["completed", "canceled"] } }
        }
      ) {
        nodes {
          ${ISSUE_FIELDS}
        }
      }
    }
  }
`;

const TEAM_ISSUES_QUERY = `
  query TeamIssues($teamId: ID!) {
    issues(first: 50, orderBy: updatedAt, filter: {
      team: { id: { eq: $teamId } }
      state: { type: { nin: ["completed", "canceled"] } }
    }) { nodes { ${ISSUE_FIELDS} } }
  }
`;

const CYCLE_ISSUES_QUERY = `
  query CycleIssues($cycleId: ID!) {
    issues(first: 50, orderBy: updatedAt, filter: {
      cycle: { id: { eq: $cycleId } }
      state: { type: { nin: ["completed", "canceled"] } }
    }) { nodes { ${ISSUE_FIELDS} } }
  }
`;

const PROJECT_ISSUES_QUERY = `
  query ProjectIssues($projectId: ID!) {
    issues(first: 50, orderBy: updatedAt, filter: {
      project: { id: { eq: $projectId } }
      state: { type: { nin: ["completed", "canceled"] } }
    }) { nodes { ${ISSUE_FIELDS} } }
  }
`;

const TEAMS_QUERY = `query Teams { teams(first: 50) { nodes { id name key } } }`;
const TEAM_MEMBERS_QUERY = `
  query TeamMembers($teamId: String!) {
    team(id: $teamId) {
      members(first: 100, includeDisabled: false) { nodes { id name } }
    }
  }
`;
const ISSUE_LABELS_QUERY = `
  query IssueLabels {
    issueLabels(first: 100) { nodes { id name color team { id name key } } }
  }
`;

const CURRENT_CYCLES_QUERY = `
  query CurrentCycles {
    teams(first: 50) {
      nodes {
        activeCycle {
          id number name startsAt endsAt progress isActive
          team { id name key }
        }
      }
    }
  }
`;

const TEAM_CURRENT_CYCLE_QUERY = `
  query TeamCurrentCycle($teamId: String!) {
    team(id: $teamId) {
      activeCycle {
        id number name startsAt endsAt progress isActive
        team { id name key }
      }
    }
  }
`;

const ACTIVE_PROJECTS_QUERY = `
  query ActiveProjects {
    projects(
      first: 50
      orderBy: updatedAt
      filter: { status: { type: { nin: ["completed", "canceled"] } } }
    ) {
      nodes {
        id name description slugId url progress health startDate targetDate
        status { id name type color }
      lead { id name }
      teams(first: 20) { nodes { id name key } }
      }
    }
  }
`;

const TEAM_ACTIVE_PROJECTS_QUERY = `
  query TeamActiveProjects($teamId: String!) {
    team(id: $teamId) {
      projects(
        first: 50
        orderBy: updatedAt
        filter: { status: { type: { nin: ["completed", "canceled"] } } }
      ) {
        nodes {
          id name description slugId url progress health startDate targetDate
          status { id name type color }
          lead { id name }
          teams(first: 20) { nodes { id name key } }
        }
      }
    }
  }
`;

const WORKFLOW_STATES_QUERY = `
  query WorkflowStates($teamId: ID!) {
    workflowStates(
      first: 50
      filter: { team: { id: { eq: $teamId } } }
      orderBy: createdAt
    ) {
      nodes { id name type color position }
    }
  }
`;

const UPDATE_ISSUE_STATUS_MUTATION = `
  mutation UpdateIssueStatus($issueId: String!, $stateId: String!) {
    issueUpdate(id: $issueId, input: { stateId: $stateId }) {
      success
      issue {
        id
        state { id name type color position }
        cycle { id number name }
        project { id name slugId }
        assignee { id name }
        priority
        labels(first: 50) { nodes { id name color team { id name key } } pageInfo { hasNextPage } }
      }
    }
  }
`;

const UPDATE_ISSUE_CYCLE_MUTATION = `
  mutation UpdateIssueCycle($issueId: String!, $cycleId: String) {
    issueUpdate(id: $issueId, input: { cycleId: $cycleId }) {
      success
      issue {
        id
        state { id name type color position }
        cycle { id number name }
        project { id name slugId }
        assignee { id name }
        priority
        labels(first: 50) { nodes { id name color team { id name key } } pageInfo { hasNextPage } }
      }
    }
  }
`;

const UPDATE_ISSUE_PROJECT_MUTATION = `
  mutation UpdateIssueProject($issueId: String!, $projectId: String) {
    issueUpdate(id: $issueId, input: { projectId: $projectId }) {
      success
      issue {
        id
        state { id name type color position }
        cycle { id number name }
        project { id name slugId }
        assignee { id name }
        priority
        labels(first: 50) { nodes { id name color team { id name key } } pageInfo { hasNextPage } }
      }
    }
  }
`;

const UPDATE_ISSUE_ASSIGNEE_MUTATION = `
  mutation UpdateIssueAssignee($issueId: String!, $assigneeId: String) {
    issueUpdate(id: $issueId, input: { assigneeId: $assigneeId }) {
      success
      issue { id state { id name type color position } cycle { id number name }
        project { id name slugId } assignee { id name } priority
        labels(first: 50) { nodes { id name color team { id name key } } pageInfo { hasNextPage } } }
    }
  }
`;

const UPDATE_ISSUE_PRIORITY_MUTATION = `
  mutation UpdateIssuePriority($issueId: String!, $priority: Int!) {
    issueUpdate(id: $issueId, input: { priority: $priority }) {
      success
      issue { id state { id name type color position } cycle { id number name }
        project { id name slugId } assignee { id name } priority
        labels(first: 50) { nodes { id name color team { id name key } } pageInfo { hasNextPage } } }
    }
  }
`;

const UPDATE_ISSUE_LABELS_MUTATION = `
  mutation UpdateIssueLabels($issueId: String!, $labelIds: [String!]!) {
    issueUpdate(id: $issueId, input: { labelIds: $labelIds }) {
      success
      issue { id state { id name type color position } cycle { id number name }
        project { id name slugId } assignee { id name } priority
        labels(first: 50) { nodes { id name color team { id name key } } pageInfo { hasNextPage } } }
    }
  }
`;

function redact(value: string, secret: string): string {
  return secret.length === 0 ? value : value.replaceAll(secret, "[REDACTED]");
}

function rateLimitMessage(response: Response): string {
  const reset =
    response.headers.get("x-ratelimit-endpoint-requests-reset") ??
    response.headers.get("x-ratelimit-requests-reset");
  if (reset === null) {
    return "The Linear API rate limit was reached. Wait before retrying.";
  }
  const resetAt = Number(reset);
  if (!Number.isFinite(resetAt)) {
    return "The Linear API rate limit was reached. Wait before retrying.";
  }
  return `The Linear API rate limit was reached. Retry after: ${new Date(resetAt).toLocaleString()}`;
}

function normalizeCycle(cycle: v.InferOutput<typeof cycleSchema>): Cycle {
  return cycle;
}

function normalizeProject(project: v.InferOutput<typeof projectSchema>): Project {
  return { ...project, teams: project.teams.nodes };
}

function normalizeIssue(issue: v.InferOutput<typeof issueSchema>): Issue {
  return {
    ...issue,
    labels: issue.labels.nodes,
    labelsComplete: !issue.labels.pageInfo.hasNextPage,
  };
}

function normalizeUpdatedIssue(issue: v.InferOutput<typeof updatedIssueSchema>): UpdatedIssue {
  return {
    ...issue,
    labels: issue.labels.nodes,
    labelsComplete: !issue.labels.pageInfo.hasNextPage,
  };
}

export class LinearGraphqlClient implements LinearClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: Fetch = fetch,
  ) {}

  async getAuthStatus(): Promise<AuthStatus> {
    const data = await this.request(AUTH_STATUS_QUERY, {}, authStatusSchema);
    return {
      viewer: { id: data.viewer.id, name: data.viewer.name, email: data.viewer.email },
      workspace: data.viewer.organization,
    };
  }

  async getTeams(): Promise<Team[]> {
    const data = await this.request(TEAMS_QUERY, {}, teamsSchema);
    return data.teams.nodes;
  }

  async getIssues(scope: IssueScope): Promise<Issue[]> {
    switch (scope.kind) {
      case "assigned-to-me": {
        const data =
          scope.teamId === undefined
            ? await this.request(ASSIGNED_ISSUES_QUERY, {}, assignedIssuesSchema)
            : await this.request(
                TEAM_ASSIGNED_ISSUES_QUERY,
                { teamId: scope.teamId },
                assignedIssuesSchema,
              );
        return data.viewer.assignedIssues.nodes.map(normalizeIssue);
      }
      case "team": {
        const data = await this.request(
          TEAM_ISSUES_QUERY,
          { teamId: scope.teamId },
          scopedIssuesSchema,
        );
        return data.issues.nodes.map(normalizeIssue);
      }
      case "cycle": {
        const data = await this.request(
          CYCLE_ISSUES_QUERY,
          { cycleId: scope.cycleId },
          scopedIssuesSchema,
        );
        return data.issues.nodes.map(normalizeIssue);
      }
      case "project": {
        const data = await this.request(
          PROJECT_ISSUES_QUERY,
          { projectId: scope.projectId },
          scopedIssuesSchema,
        );
        return data.issues.nodes.map(normalizeIssue);
      }
    }
  }

  async getTeamMembers(teamId: string): Promise<UserSummary[]> {
    const data = await this.request(TEAM_MEMBERS_QUERY, { teamId }, teamMembersSchema);
    return data.team.members.nodes;
  }

  async getIssueLabels(): Promise<IssueLabel[]> {
    const data = await this.request(ISSUE_LABELS_QUERY, {}, issueLabelsSchema);
    return data.issueLabels.nodes;
  }

  async getCurrentCycles(teamId?: string): Promise<Cycle[]> {
    if (teamId !== undefined) {
      const data = await this.request(TEAM_CURRENT_CYCLE_QUERY, { teamId }, teamCurrentCycleSchema);
      return data.team.activeCycle === null ? [] : [normalizeCycle(data.team.activeCycle)];
    }
    const data = await this.request(CURRENT_CYCLES_QUERY, {}, currentCyclesSchema);
    return data.teams.nodes.flatMap(({ activeCycle }) =>
      activeCycle === null ? [] : [normalizeCycle(activeCycle)],
    );
  }

  async getActiveProjects(teamId?: string): Promise<Project[]> {
    if (teamId !== undefined) {
      const data = await this.request(
        TEAM_ACTIVE_PROJECTS_QUERY,
        { teamId },
        teamActiveProjectsSchema,
      );
      return data.team.projects.nodes.map(normalizeProject);
    }
    const data = await this.request(ACTIVE_PROJECTS_QUERY, {}, activeProjectsSchema);
    return data.projects.nodes.map(normalizeProject);
  }

  async getWorkflowStates(teamId: string): Promise<WorkflowState[]> {
    const data = await this.request(WORKFLOW_STATES_QUERY, { teamId }, workflowStatesSchema);
    return data.workflowStates.nodes;
  }

  async updateIssue(change: IssueChange): Promise<UpdatedIssue> {
    let data: v.InferOutput<typeof updateIssueSchema>;
    switch (change.kind) {
      case "status":
        data = await this.request(
          UPDATE_ISSUE_STATUS_MUTATION,
          { issueId: change.issueId, stateId: change.stateId },
          updateIssueSchema,
        );
        break;
      case "cycle":
        data = await this.request(
          UPDATE_ISSUE_CYCLE_MUTATION,
          { issueId: change.issueId, cycleId: change.cycleId },
          updateIssueSchema,
        );
        break;
      case "project":
        data = await this.request(
          UPDATE_ISSUE_PROJECT_MUTATION,
          { issueId: change.issueId, projectId: change.projectId },
          updateIssueSchema,
        );
        break;
      case "assignee":
        data = await this.request(
          UPDATE_ISSUE_ASSIGNEE_MUTATION,
          { issueId: change.issueId, assigneeId: change.assigneeId },
          updateIssueSchema,
        );
        break;
      case "priority":
        data = await this.request(
          UPDATE_ISSUE_PRIORITY_MUTATION,
          { issueId: change.issueId, priority: change.priority },
          updateIssueSchema,
        );
        break;
      case "labels":
        data = await this.request(
          UPDATE_ISSUE_LABELS_MUTATION,
          { issueId: change.issueId, labelIds: change.labelIds },
          updateIssueSchema,
        );
        break;
    }
    if (!data.issueUpdate.success) {
      throw new LinearApiError("graphql", "Linear rejected the issue update.");
    }
    return normalizeUpdatedIssue(data.issueUpdate.issue);
  }

  private async request<TSchema extends Schema>(
    query: string,
    variables: Record<string, unknown>,
    schema: TSchema,
  ): Promise<v.InferOutput<TSchema>> {
    let response: Response;
    try {
      response = await this.fetcher(LINEAR_GRAPHQL_ENDPOINT, {
        method: "POST",
        signal: AbortSignal.timeout(15_000),
        headers: { Authorization: this.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
      });
    } catch {
      throw new LinearApiError(
        "network",
        "Could not connect to the Linear API. Check your network connection.",
      );
    }

    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      if (!response.ok) {
        throw new LinearApiError("http", `The Linear API returned HTTP ${response.status}.`);
      }
      throw new LinearApiError("invalid-response", "The Linear API response was not valid JSON.");
    }

    const envelope = v.safeParse(graphqlEnvelopeSchema, raw);
    if (envelope.success && envelope.output.errors?.length) {
      if (envelope.output.errors.some((error) => error.extensions?.code === "RATELIMITED")) {
        throw new LinearApiError("rate-limit", rateLimitMessage(response));
      }
      const messages = envelope.output.errors.map((error) => error.message).join(" / ");
      throw new LinearApiError("graphql", redact(`Linear API error: ${messages}`, this.apiKey));
    }
    if (!response.ok) {
      throw new LinearApiError(
        "http",
        redact(
          `The Linear API returned HTTP ${response.status} ${response.statusText}.`,
          this.apiKey,
        ),
      );
    }
    if (!envelope.success || envelope.output.data === undefined) {
      throw new LinearApiError("invalid-response", "The Linear API response shape was invalid.");
    }
    const parsed = v.safeParse(schema, envelope.output.data);
    if (!parsed.success) {
      throw new LinearApiError(
        "invalid-response",
        "The Linear API response data did not match the expected schema.",
      );
    }
    return parsed.output;
  }
}

export function assertWorkspace(expected: string | undefined, actual: Workspace): void {
  if (
    expected !== undefined &&
    expected.toLocaleLowerCase() !== actual.urlKey.toLocaleLowerCase()
  ) {
    throw new Error(
      `Workspace mismatch. Expected: ${expected}; connected: ${actual.urlKey}. The operation was stopped.`,
    );
  }
}
