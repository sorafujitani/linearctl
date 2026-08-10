import * as v from "valibot";

import type {
  Cycle,
  Issue,
  IssueChange,
  IssueCreateInput,
  IssueCommentPage,
  IssueLabel,
  IssuePage,
  IssueScope,
  Project,
  ProjectCreateInput,
  ProjectPage,
  Team,
  UpdatedIssue,
  UserSummary,
  Viewer,
  WorkflowState,
  Workspace,
} from "./domain";
import { normalizeIssueIdentifier } from "./domain";
import { unreachable } from "./unreachable";

const LINEAR_GRAPHQL_ENDPOINT = "https://api.linear.app/graphql";
const REQUEST_TIMEOUT_MS = 15_000;

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
  title: v.string(),
  description: v.nullable(v.string()),
  updatedAt: v.string(),
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
const pageInfoSchema = v.object({ hasNextPage: v.boolean() });
const issueConnectionSchema = v.object({
  nodes: v.array(issueSchema),
  pageInfo: pageInfoSchema,
});
const projectConnectionSchema = v.object({
  nodes: v.array(projectSchema),
  pageInfo: pageInfoSchema,
});
const assignedIssuesSchema = v.object({
  viewer: v.object({ assignedIssues: issueConnectionSchema }),
});
const scopedIssuesSchema = v.object({ issues: issueConnectionSchema });
const singleIssueSchema = v.object({ issue: issueSchema });
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
const teamCyclesSchema = v.object({
  team: v.object({ cycles: v.object({ nodes: v.array(cycleSchema) }) }),
});
const issueCommentsSchema = v.object({
  issue: v.object({
    comments: v.object({
      nodes: v.array(
        v.object({
          id: v.string(),
          body: v.string(),
          createdAt: v.string(),
          user: v.nullable(userSummarySchema),
        }),
      ),
      pageInfo: pageInfoSchema,
    }),
  }),
});
const activeProjectsSchema = v.object({
  projects: projectConnectionSchema,
});
const teamActiveProjectsSchema = v.object({
  team: v.object({ projects: projectConnectionSchema }),
});
const workflowStatesSchema = v.object({
  workflowStates: v.object({ nodes: v.array(workflowStateSchema) }),
});
const updateIssueSchema = v.object({
  issueUpdate: v.object({ success: v.boolean(), issue: updatedIssueSchema }),
});
const createIssueSchema = v.object({
  issueCreate: v.object({ success: v.boolean(), issue: v.nullable(issueSchema) }),
});
const createProjectSchema = v.object({
  projectCreate: v.object({ success: v.boolean(), project: v.nullable(projectSchema) }),
});

export type LinearApiErrorKind =
  | "network"
  | "timeout"
  | "http"
  | "graphql"
  | "rate-limit"
  | "invalid-response";

export class LinearApiError extends Error {
  readonly kind: LinearApiErrorKind;

  constructor(kind: LinearApiErrorKind, message: string) {
    super(message);
    this.kind = kind;
    this.name = "LinearApiError";
  }
}

export interface AuthStatus {
  viewer: Viewer;
  workspace: Workspace;
}

export interface IssueReadOptions {
  /** Include completed and canceled issues; the default hides them. */
  includeDone?: boolean;
}

export interface LinearClient {
  getAuthStatus(): Promise<AuthStatus>;
  getTeams(): Promise<Team[]>;
  getIssues(scope: IssueScope, options?: IssueReadOptions): Promise<IssuePage>;
  /** Resolve one issue by its human identifier (e.g. APP-101); throws when it does not exist. */
  getIssue(identifier: string): Promise<Issue>;
  getTeamMembers(teamId: string): Promise<UserSummary[]>;
  getIssueLabels(): Promise<IssueLabel[]>;
  getCurrentCycles(teamId?: string): Promise<Cycle[]>;
  getTeamCycles(teamId: string): Promise<Cycle[]>;
  getIssueComments(issueId: string): Promise<IssueCommentPage>;
  getActiveProjects(teamId?: string): Promise<ProjectPage>;
  getWorkflowStates(teamId: string): Promise<WorkflowState[]>;
  updateIssue(change: IssueChange): Promise<UpdatedIssue>;
  createIssue(input: IssueCreateInput): Promise<Issue>;
  createProject(input: ProjectCreateInput): Promise<Project>;
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

const PROJECT_FIELDS = `
  id name description slugId url progress health startDate targetDate
  status { id name type color }
  lead { id name }
  teams(first: 20) { nodes { id name key } }
`;

const DONE_STATE_FILTER = 'state: { type: { nin: ["completed", "canceled"] } }';

/**
 * The done filter is included or omitted per query instead of sent as a
 * variable: an empty nin list must not reach the server, where "exclude
 * nothing" semantics are not guaranteed.
 */
const assignedIssuesQuery = (includeDone: boolean): string => `
  query AssignedIssues {
    viewer {
      assignedIssues(
        first: 50
        orderBy: updatedAt
        ${includeDone ? "" : `filter: { ${DONE_STATE_FILTER} }`}
      ) {
        nodes {
          ${ISSUE_FIELDS}
        }
        pageInfo { hasNextPage }
      }
    }
  }
`;

const teamAssignedIssuesQuery = (includeDone: boolean): string => `
  query TeamAssignedIssues($teamId: ID!) {
    viewer {
      assignedIssues(
        first: 50
        orderBy: updatedAt
        filter: {
          team: { id: { eq: $teamId } }
          ${includeDone ? "" : DONE_STATE_FILTER}
        }
      ) {
        nodes {
          ${ISSUE_FIELDS}
        }
        pageInfo { hasNextPage }
      }
    }
  }
`;

const scopedIssuesQuery = (
  name: string,
  variable: string,
  field: string,
  includeDone: boolean,
): string => `
  query ${name}($${variable}: ID!) {
    issues(first: 50, orderBy: updatedAt, filter: {
      ${field}: { id: { eq: $${variable} } }
      ${includeDone ? "" : DONE_STATE_FILTER}
    }) { nodes { ${ISSUE_FIELDS} } pageInfo { hasNextPage } }
  }
`;

const ISSUE_BY_IDENTIFIER_QUERY = `
  query IssueByIdentifier($id: String!) {
    issue(id: $id) {
      ${ISSUE_FIELDS}
    }
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

const TEAM_CYCLES_QUERY = `
  query TeamCycles($teamId: String!) {
    team(id: $teamId) {
      cycles(first: 50, orderBy: updatedAt) {
        nodes {
          id number name startsAt endsAt progress isActive
          team { id name key }
        }
      }
    }
  }
`;

const ISSUE_COMMENTS_QUERY = `
  query IssueComments($issueId: String!) {
    issue(id: $issueId) {
      comments(first: 50, orderBy: createdAt) {
        nodes { id body createdAt user { id name } }
        pageInfo { hasNextPage }
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
        ${PROJECT_FIELDS}
      }
      pageInfo { hasNextPage }
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
          ${PROJECT_FIELDS}
        }
        pageInfo { hasNextPage }
      }
    }
  }
`;

const CREATE_ISSUE_MUTATION = `
  mutation CreateIssue($input: IssueCreateInput!) {
    issueCreate(input: $input) {
      success
      issue {
        ${ISSUE_FIELDS}
      }
    }
  }
`;

const CREATE_PROJECT_MUTATION = `
  mutation CreateProject($input: ProjectCreateInput!) {
    projectCreate(input: $input) {
      success
      project {
        ${PROJECT_FIELDS}
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

const UPDATED_ISSUE_FIELDS = `
  id title description updatedAt
  state { id name type color position }
  cycle { id number name }
  project { id name slugId }
  assignee { id name }
  priority
  labels(first: 50) { nodes { id name color team { id name key } } pageInfo { hasNextPage } }
`;

const UPDATE_ISSUE_STATUS_MUTATION = `
  mutation UpdateIssueStatus($issueId: String!, $stateId: String!) {
    issueUpdate(id: $issueId, input: { stateId: $stateId }) {
      success
      issue { ${UPDATED_ISSUE_FIELDS} }
    }
  }
`;

const UPDATE_ISSUE_CYCLE_MUTATION = `
  mutation UpdateIssueCycle($issueId: String!, $cycleId: String) {
    issueUpdate(id: $issueId, input: { cycleId: $cycleId }) {
      success
      issue { ${UPDATED_ISSUE_FIELDS} }
    }
  }
`;

const UPDATE_ISSUE_PROJECT_MUTATION = `
  mutation UpdateIssueProject($issueId: String!, $projectId: String) {
    issueUpdate(id: $issueId, input: { projectId: $projectId }) {
      success
      issue { ${UPDATED_ISSUE_FIELDS} }
    }
  }
`;

const UPDATE_ISSUE_ASSIGNEE_MUTATION = `
  mutation UpdateIssueAssignee($issueId: String!, $assigneeId: String) {
    issueUpdate(id: $issueId, input: { assigneeId: $assigneeId }) {
      success
      issue { ${UPDATED_ISSUE_FIELDS} }
    }
  }
`;

const UPDATE_ISSUE_PRIORITY_MUTATION = `
  mutation UpdateIssuePriority($issueId: String!, $priority: Int!) {
    issueUpdate(id: $issueId, input: { priority: $priority }) {
      success
      issue { ${UPDATED_ISSUE_FIELDS} }
    }
  }
`;

const UPDATE_ISSUE_LABELS_MUTATION = `
  mutation UpdateIssueLabels($issueId: String!, $labelIds: [String!]!) {
    issueUpdate(id: $issueId, input: { labelIds: $labelIds }) {
      success
      issue { ${UPDATED_ISSUE_FIELDS} }
    }
  }
`;

const UPDATE_ISSUE_TITLE_MUTATION = `
  mutation UpdateIssueTitle($issueId: String!, $title: String!) {
    issueUpdate(id: $issueId, input: { title: $title }) {
      success
      issue { ${UPDATED_ISSUE_FIELDS} }
    }
  }
`;

const UPDATE_ISSUE_DESCRIPTION_MUTATION = `
  mutation UpdateIssueDescription($issueId: String!, $description: String!) {
    issueUpdate(id: $issueId, input: { description: $description }) {
      success
      issue { ${UPDATED_ISSUE_FIELDS} }
    }
  }
`;

const UPDATE_ISSUE_CONTENT_MUTATION = `
  mutation UpdateIssueContent($issueId: String!, $title: String!, $description: String!) {
    issueUpdate(id: $issueId, input: { title: $title, description: $description }) {
      success
      issue { ${UPDATED_ISSUE_FIELDS} }
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

function normalizeIssuePage(connection: v.InferOutput<typeof issueConnectionSchema>): IssuePage {
  return {
    issues: connection.nodes.map(normalizeIssue),
    hasMore: connection.pageInfo.hasNextPage,
  };
}

function normalizeProjectPage(
  connection: v.InferOutput<typeof projectConnectionSchema>,
): ProjectPage {
  return {
    projects: connection.nodes.map(normalizeProject),
    hasMore: connection.pageInfo.hasNextPage,
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
  private readonly apiKey: string;
  private readonly fetcher: Fetch;

  constructor(apiKey: string, fetcher: Fetch = fetch) {
    this.apiKey = apiKey;
    this.fetcher = fetcher;
  }

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

  async getIssues(scope: IssueScope, options?: IssueReadOptions): Promise<IssuePage> {
    const includeDone = options?.includeDone === true;
    switch (scope.kind) {
      case "assigned-to-me": {
        const data =
          scope.teamId === undefined
            ? await this.request(assignedIssuesQuery(includeDone), {}, assignedIssuesSchema)
            : await this.request(
                teamAssignedIssuesQuery(includeDone),
                { teamId: scope.teamId },
                assignedIssuesSchema,
              );
        return normalizeIssuePage(data.viewer.assignedIssues);
      }
      case "team": {
        const data = await this.request(
          scopedIssuesQuery("TeamIssues", "teamId", "team", includeDone),
          { teamId: scope.teamId },
          scopedIssuesSchema,
        );
        return normalizeIssuePage(data.issues);
      }
      case "current-cycle": {
        const [cycle] = await this.getCurrentCycles(scope.teamId);
        return cycle === undefined
          ? { issues: [], hasMore: false }
          : this.getIssues({ kind: "cycle", cycleId: cycle.id }, options);
      }
      case "cycle": {
        const data = await this.request(
          scopedIssuesQuery("CycleIssues", "cycleId", "cycle", includeDone),
          { cycleId: scope.cycleId },
          scopedIssuesSchema,
        );
        return normalizeIssuePage(data.issues);
      }
      case "project": {
        const data = await this.request(
          scopedIssuesQuery("ProjectIssues", "projectId", "project", includeDone),
          { projectId: scope.projectId },
          scopedIssuesSchema,
        );
        return normalizeIssuePage(data.issues);
      }
      default:
        return unreachable(scope);
    }
  }

  async getIssue(identifier: string): Promise<Issue> {
    const data = await this.request(
      ISSUE_BY_IDENTIFIER_QUERY,
      { id: normalizeIssueIdentifier(identifier) },
      singleIssueSchema,
    );
    return normalizeIssue(data.issue);
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

  async getTeamCycles(teamId: string): Promise<Cycle[]> {
    const data = await this.request(TEAM_CYCLES_QUERY, { teamId }, teamCyclesSchema);
    // Active cycle first, then newest first, so pickers read naturally.
    return data.team.cycles.nodes
      .map(normalizeCycle)
      .sort(
        (left, right) =>
          Number(right.isActive) - Number(left.isActive) || right.number - left.number,
      );
  }

  async getIssueComments(issueId: string): Promise<IssueCommentPage> {
    const data = await this.request(ISSUE_COMMENTS_QUERY, { issueId }, issueCommentsSchema);
    // orderBy: createdAt pages newest-first, so a truncated read drops the
    // oldest comments; the thread itself reads top-down oldest-first.
    const comments = data.issue.comments.nodes
      .map((comment) => ({
        id: comment.id,
        body: comment.body,
        createdAt: comment.createdAt,
        author: comment.user?.name ?? null,
      }))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    return { comments, hasMore: data.issue.comments.pageInfo.hasNextPage };
  }

  async getActiveProjects(teamId?: string): Promise<ProjectPage> {
    if (teamId !== undefined) {
      const data = await this.request(
        TEAM_ACTIVE_PROJECTS_QUERY,
        { teamId },
        teamActiveProjectsSchema,
      );
      return normalizeProjectPage(data.team.projects);
    }
    const data = await this.request(ACTIVE_PROJECTS_QUERY, {}, activeProjectsSchema);
    return normalizeProjectPage(data.projects);
  }

  async getWorkflowStates(teamId: string): Promise<WorkflowState[]> {
    const data = await this.request(WORKFLOW_STATES_QUERY, { teamId }, workflowStatesSchema);
    return data.workflowStates.nodes;
  }

  async updateIssue(change: IssueChange): Promise<UpdatedIssue> {
    let data: v.InferOutput<typeof updateIssueSchema>;
    switch (change.kind) {
      case "content":
        data = await this.request(
          UPDATE_ISSUE_CONTENT_MUTATION,
          {
            issueId: change.issueId,
            title: change.title,
            description: change.description,
          },
          updateIssueSchema,
        );
        break;
      case "title":
        data = await this.request(
          UPDATE_ISSUE_TITLE_MUTATION,
          { issueId: change.issueId, title: change.title },
          updateIssueSchema,
        );
        break;
      case "description":
        data = await this.request(
          UPDATE_ISSUE_DESCRIPTION_MUTATION,
          { issueId: change.issueId, description: change.description },
          updateIssueSchema,
        );
        break;
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
      default:
        return unreachable(change);
    }
    if (!data.issueUpdate.success) {
      throw new LinearApiError("graphql", "Linear rejected the issue update.");
    }
    return normalizeUpdatedIssue(data.issueUpdate.issue);
  }

  async createIssue(input: IssueCreateInput): Promise<Issue> {
    const payload: Record<string, unknown> = {
      teamId: input.teamId,
      title: input.title,
      priority: input.priority,
    };
    if (input.description.trim().length > 0) payload["description"] = input.description;
    if (input.stateId !== null) payload["stateId"] = input.stateId;
    if (input.assigneeId !== null) payload["assigneeId"] = input.assigneeId;
    if (input.cycleId !== null) payload["cycleId"] = input.cycleId;
    if (input.projectId !== null) payload["projectId"] = input.projectId;
    if (input.labelIds.length > 0) payload["labelIds"] = input.labelIds;

    const data = await this.request(CREATE_ISSUE_MUTATION, { input: payload }, createIssueSchema);
    if (!data.issueCreate.success || data.issueCreate.issue === null) {
      throw new LinearApiError("graphql", "Linear rejected the issue create.");
    }
    return normalizeIssue(data.issueCreate.issue);
  }

  async createProject(input: ProjectCreateInput): Promise<Project> {
    const payload: Record<string, unknown> = {
      name: input.name,
      teamIds: input.teamIds,
    };
    if (input.description.trim().length > 0) payload["description"] = input.description;
    if (input.content.trim().length > 0) payload["content"] = input.content;
    if (input.leadId !== null) payload["leadId"] = input.leadId;

    const data = await this.request(
      CREATE_PROJECT_MUTATION,
      { input: payload },
      createProjectSchema,
    );
    if (!data.projectCreate.success || data.projectCreate.project === null) {
      throw new LinearApiError("graphql", "Linear rejected the project create.");
    }
    return normalizeProject(data.projectCreate.project);
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
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { Authorization: this.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new LinearApiError(
          "timeout",
          `The Linear API did not respond within ${REQUEST_TIMEOUT_MS / 1000} seconds. Try again.`,
        );
      }
      throw new LinearApiError(
        "network",
        "Could not connect to the Linear API. Check your network connection.",
      );
    }

    if (response.status === 429) {
      throw new LinearApiError("rate-limit", rateLimitMessage(response));
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
      if (envelope.output.errors.some((error) => error.extensions?.["code"] === "RATELIMITED")) {
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
