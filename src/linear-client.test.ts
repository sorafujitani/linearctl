import * as v from "valibot";
import { describe, expect, it, vi } from "vite-plus/test";

import type { IssueChange, IssueScope } from "./domain";
import { assertWorkspace, LinearApiError, LinearGraphqlClient } from "./linear-client";

const requestSchema = v.object({
  query: v.string(),
  variables: v.record(v.string(), v.unknown()),
});
const team = { id: "team-1", name: "Engineering", key: "ENG" };
const workflowState = {
  id: "state-1",
  name: "In Progress",
  type: "started",
  color: "#123456",
  position: 2,
};
const cycleRef = { id: "cycle-1", number: 8, name: "Current" };
const projectRef = { id: "project-1", name: "Launch", slugId: "launch" };
const assignee = { id: "user-1", name: "Sora" };
const label = { id: "label-1", name: "Backend", color: "#123456", team: null };

function issueNode(hasNextPage = false) {
  return {
    id: "issue-1",
    identifier: "ENG-1",
    title: "Build CLI",
    description: null,
    priority: 2,
    priorityLabel: "High",
    estimate: null,
    assignee: null,
    labels: { nodes: [label], pageInfo: { hasNextPage } },
    url: "https://linear.app/example/ENG-1",
    updatedAt: "2026-08-06T00:00:00.000Z",
    state: workflowState,
    team,
    cycle: null,
    project: projectRef,
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(body), { ...init, headers });
}

function requestBody(init: RequestInit | undefined) {
  if (typeof init?.body !== "string") throw new Error("request body is not a string");
  return v.parse(requestSchema, JSON.parse(init.body));
}

function updatedIssueData() {
  return {
    data: {
      issueUpdate: {
        success: true,
        issue: {
          id: "issue-1",
          state: workflowState,
          cycle: cycleRef,
          project: projectRef,
          assignee,
          priority: 2,
          labels: { nodes: [label], pageInfo: { hasNextPage: false } },
        },
      },
    },
  };
}

describe("LinearGraphqlClient reads", () => {
  it("uses the personal API key header and validates the external response", async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("Authorization")).toBe("test-key-not-real");
      return jsonResponse({
        data: {
          viewer: {
            id: "viewer-1",
            name: "Sora",
            email: "sora@example.invalid",
            organization: { id: "org-1", name: "Example", urlKey: "fs0414" },
          },
        },
      });
    });
    await expect(
      new LinearGraphqlClient("test-key-not-real", fetcher).getAuthStatus(),
    ).resolves.toEqual({
      viewer: { id: "viewer-1", name: "Sora", email: "sora@example.invalid" },
      workspace: { id: "org-1", name: "Example", urlKey: "fs0414" },
    });
  });

  it("limits assigned issues to 50 and parses nullable full fields", async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const request = requestBody(init);
      expect(request.variables).toEqual({});
      expect(request.query).toContain("first: 50");
      expect(request.query).toContain('nin: ["completed", "canceled"]');
      expect(request.query).toContain("cycle { id number name }");
      expect(request.query).toContain("project { id name slugId }");
      return jsonResponse({
        data: {
          viewer: {
            assignedIssues: {
              nodes: [issueNode()],
            },
          },
        },
      });
    });
    const issues = await new LinearGraphqlClient("test-key-not-real", fetcher).getIssues({
      kind: "assigned-to-me",
    });
    expect(issues[0]).toMatchObject({
      cycle: null,
      assignee: null,
      estimate: null,
      labels: [label],
      labelsComplete: true,
      project: { id: "project-1" },
    });
  });

  it("sends only the target ID to top-level issues for scoped reads", async () => {
    const cases: {
      scope: IssueScope;
      field: string;
      key: string;
      id: string;
      name: string;
    }[] = [
      {
        scope: { kind: "team", teamId: "team-1" },
        field: "team",
        key: "teamId",
        id: "team-1",
        name: "TeamIssues",
      },
      {
        scope: { kind: "cycle", cycleId: "cycle-1" },
        field: "cycle",
        key: "cycleId",
        id: "cycle-1",
        name: "CycleIssues",
      },
      {
        scope: { kind: "project", projectId: "project-1" },
        field: "project",
        key: "projectId",
        id: "project-1",
        name: "ProjectIssues",
      },
    ];
    for (const testCase of cases) {
      const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        const request = requestBody(init);
        expect(request.query).toContain(`query ${testCase.name}`);
        expect(request.query).toContain("first: 50");
        expect(request.query).toContain('nin: ["completed", "canceled"]');
        expect(request.query).toContain(`${testCase.field}: { id: { eq: $${testCase.key} } }`);
        expect(request.variables).toEqual({ [testCase.key]: testCase.id });
        return jsonResponse({ data: { issues: { nodes: [issueNode()] } } });
      });
      await expect(
        new LinearGraphqlClient("test-key-not-real", fetcher).getIssues(testCase.scope),
      ).resolves.toHaveLength(1);
    }
  });

  it("reports when issue labels exceed the read limit", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        data: { viewer: { assignedIssues: { nodes: [issueNode(true)] } } },
      }),
    );
    const issues = await new LinearGraphqlClient("test-key-not-real", fetcher).getIssues({
      kind: "assigned-to-me",
    });
    expect(issues[0]?.labelsComplete).toBe(false);
  });

  it("fetches teams, team members, and issue labels with bounded queries", async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const request = requestBody(init);
      if (request.query.includes("query Teams"))
        return jsonResponse({ data: { teams: { nodes: [team] } } });
      if (request.query.includes("query TeamMembers")) {
        expect(request.variables).toEqual({ teamId: "team-1" });
        expect(request.query).toContain("members(first: 100, includeDisabled: false)");
        return jsonResponse({ data: { team: { members: { nodes: [assignee] } } } });
      }
      expect(request.query).toContain("issueLabels(first: 100)");
      return jsonResponse({ data: { issueLabels: { nodes: [label] } } });
    });
    const client = new LinearGraphqlClient("test-key-not-real", fetcher);
    await expect(client.getTeams()).resolves.toEqual([team]);
    await expect(client.getTeamMembers("team-1")).resolves.toEqual([assignee]);
    await expect(client.getIssueLabels()).resolves.toEqual([label]);
  });

  it("loads active cycles without nesting issues", async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const request = requestBody(init);
      expect(request.query).toContain("teams(first: 50)");
      expect(request.query).not.toContain("issues(");
      return jsonResponse({
        data: {
          teams: {
            nodes: [
              {
                activeCycle: {
                  ...cycleRef,
                  startsAt: "2026-08-01T00:00:00.000Z",
                  endsAt: "2026-08-14T00:00:00.000Z",
                  progress: 0.5,
                  isActive: true,
                  team,
                },
              },
              { activeCycle: null },
            ],
          },
        },
      });
    });
    const cycles = await new LinearGraphqlClient("test-key-not-real", fetcher).getCurrentCycles();
    expect(cycles).toHaveLength(1);
    expect(cycles[0]).toMatchObject({ id: "cycle-1", team });
  });

  it("parses active projects with bounded relationships and nullable fields", async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const request = requestBody(init);
      expect(request.query).toContain("projects(");
      expect(request.query).toContain('nin: ["completed", "canceled"]');
      expect(request.query).toContain("teams(first: 20)");
      expect(request.query).not.toContain("issues(");
      return jsonResponse({
        data: {
          projects: {
            nodes: [
              {
                ...projectRef,
                description: "Ship CLI",
                url: "https://linear.app/example/project/launch",
                progress: 0.25,
                health: null,
                startDate: null,
                targetDate: "2026-09-01",
                status: {
                  id: "project-started",
                  name: "In Progress",
                  type: "started",
                  color: "#fff",
                },
                lead: null,
                teams: { nodes: [team] },
              },
            ],
          },
        },
      });
    });
    const projects = await new LinearGraphqlClient(
      "test-key-not-real",
      fetcher,
    ).getActiveProjects();
    expect(projects[0]).toMatchObject({ health: null, lead: null, teams: [team] });
  });
});

describe("LinearGraphqlClient mutations", () => {
  async function expectMutation(
    change: IssueChange,
    expectedVariables: Record<string, unknown>,
    expectedInput: string,
    forbiddenInputs: string[],
  ) {
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const request = requestBody(init);
      expect(request.variables).toEqual(expectedVariables);
      expect(request.query).toContain(expectedInput);
      for (const forbidden of forbiddenInputs) expect(request.query).not.toContain(forbidden);
      return jsonResponse(updatedIssueData());
    });
    const result = await new LinearGraphqlClient("test-key-not-real", fetcher).updateIssue(change);
    expect(result).toEqual({
      ...updatedIssueData().data.issueUpdate.issue,
      labels: [label],
      labelsComplete: true,
    });
  }

  it("includes only stateId in a status mutation", async () => {
    await expectMutation(
      { kind: "status", issueId: "issue-1", stateId: "state-2" },
      { issueId: "issue-1", stateId: "state-2" },
      "input: { stateId: $stateId }",
      [
        "input: { cycleId",
        "input: { projectId",
        "input: { assigneeId",
        "input: { priority",
        "input: { labelIds",
      ],
    );
  });

  it("includes only nullable cycleId in a cycle mutation", async () => {
    await expectMutation(
      { kind: "cycle", issueId: "issue-1", cycleId: null },
      { issueId: "issue-1", cycleId: null },
      "input: { cycleId: $cycleId }",
      [
        "input: { stateId",
        "input: { projectId",
        "input: { assigneeId",
        "input: { priority",
        "input: { labelIds",
      ],
    );
  });

  it("includes only nullable projectId in a project mutation", async () => {
    await expectMutation(
      { kind: "project", issueId: "issue-1", projectId: null },
      { issueId: "issue-1", projectId: null },
      "input: { projectId: $projectId }",
      [
        "input: { stateId",
        "input: { cycleId",
        "input: { assigneeId",
        "input: { priority",
        "input: { labelIds",
      ],
    );
  });

  it("sends only nullable assigneeId in an assignee mutation", async () => {
    await expectMutation(
      { kind: "assignee", issueId: "issue-1", assigneeId: null },
      { issueId: "issue-1", assigneeId: null },
      "input: { assigneeId: $assigneeId }",
      [
        "input: { stateId",
        "input: { cycleId",
        "input: { projectId",
        "input: { priority",
        "input: { labelIds",
      ],
    );
  });

  it("sends only priority in a priority mutation", async () => {
    await expectMutation(
      { kind: "priority", issueId: "issue-1", priority: 3 },
      { issueId: "issue-1", priority: 3 },
      "input: { priority: $priority }",
      [
        "input: { stateId",
        "input: { cycleId",
        "input: { projectId",
        "input: { assigneeId",
        "input: { labelIds",
      ],
    );
  });

  it("sends only labelIds in a labels mutation", async () => {
    await expectMutation(
      { kind: "labels", issueId: "issue-1", labelIds: ["label-1"] },
      { issueId: "issue-1", labelIds: ["label-1"] },
      "input: { labelIds: $labelIds }",
      [
        "input: { stateId",
        "input: { cycleId",
        "input: { projectId",
        "input: { assigneeId",
        "input: { priority",
      ],
    );
  });
});

describe("LinearGraphqlClient errors", () => {
  it("formats GraphQL rate limits as user-facing errors", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(
        { errors: [{ message: "limited", extensions: { code: "RATELIMITED" } }] },
        { status: 400, headers: { "x-ratelimit-requests-reset": "1893456000000" } },
      ),
    );
    const error = await new LinearGraphqlClient("test-key-not-real", fetcher)
      .getIssues({ kind: "assigned-to-me" })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(LinearApiError);
    expect(error).toMatchObject({ kind: "rate-limit" });
  });

  it("distinguishes HTTP, network, and schema errors without exposing the key", async () => {
    const http = new LinearGraphqlClient(
      "test-key-not-real",
      async () => new Response("unavailable", { status: 503 }),
    );
    const network = new LinearGraphqlClient("test-key-not-real", async () => {
      throw new Error("socket with test-key-not-real");
    });
    const invalid = new LinearGraphqlClient("test-key-not-real", async () =>
      jsonResponse({ data: { viewer: { assignedIssues: { nodes: [{ id: "invalid" }] } } } }),
    );
    const graphql = new LinearGraphqlClient("test-key-not-real", async () =>
      jsonResponse({ errors: [{ message: "bad test-key-not-real" }] }),
    );
    await expect(http.getAuthStatus()).rejects.toMatchObject({ kind: "http" });
    await expect(network.getAuthStatus()).rejects.toMatchObject({ kind: "network" });
    await expect(invalid.getIssues({ kind: "assigned-to-me" })).rejects.toMatchObject({
      kind: "invalid-response",
    });
    await expect(graphql.getAuthStatus()).rejects.not.toThrow("test-key-not-real");
  });
});

describe("assertWorkspace", () => {
  const workspace = { id: "org-1", name: "Example", urlKey: "fs0414" };
  it("accepts matching or omitted workspaces and fails fast on a mismatch", () => {
    expect(() => assertWorkspace("FS0414", workspace)).not.toThrow();
    expect(() => assertWorkspace(undefined, workspace)).not.toThrow();
    expect(() => assertWorkspace("other", workspace)).toThrow("Workspace mismatch");
  });
});
