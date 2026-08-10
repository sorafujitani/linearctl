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
          title: "Build CLI",
          description: "Ship the terminal workflow",
          updatedAt: "2026-08-10T00:00:00.000Z",
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
            organization: { id: "org-1", name: "Example", urlKey: "sample-workspace" },
          },
        },
      });
    });
    await expect(
      new LinearGraphqlClient("test-key-not-real", fetcher).getAuthStatus(),
    ).resolves.toEqual({
      viewer: { id: "viewer-1", name: "Sora", email: "sora@example.invalid" },
      workspace: { id: "org-1", name: "Example", urlKey: "sample-workspace" },
    });
  });

  it("limits assigned issues to 50 and parses nullable full fields", async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
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
              pageInfo: { hasNextPage: false },
            },
          },
        },
      });
    });
    const { issues } = await new LinearGraphqlClient("test-key-not-real", fetcher).getIssues({
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
        return jsonResponse({
          data: { issues: { nodes: [issueNode()], pageInfo: { hasNextPage: false } } },
        });
      });
      const page = await new LinearGraphqlClient("test-key-not-real", fetcher).getIssues(
        testCase.scope,
      );
      expect(page.issues).toHaveLength(1);
      expect(page.hasMore).toBe(false);
    }
  });

  it("scopes assigned issues to the active team", async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const request = requestBody(init);
      expect(request.query).toContain("query TeamAssignedIssues");
      expect(request.query).toContain("team: { id: { eq: $teamId } }");
      expect(request.variables).toEqual({ teamId: "team-1" });
      expect(request.query).toContain('nin: ["completed", "canceled"]');
      return jsonResponse({
        data: {
          viewer: {
            assignedIssues: { nodes: [issueNode()], pageInfo: { hasNextPage: false } },
          },
        },
      });
    });
    await expect(
      new LinearGraphqlClient("test-key-not-real", fetcher)
        .getIssues({ kind: "assigned-to-me", teamId: "team-1" })
        .then((page) => page.issues),
    ).resolves.toHaveLength(1);
  });

  it("resolves the active team's current cycle before loading its issues", async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const request = requestBody(init);
      if (request.query.includes("query TeamCurrentCycle")) {
        expect(request.query).not.toContain("issues(");
        expect(request.variables).toEqual({ teamId: "team-1" });
        return jsonResponse({
          data: {
            team: {
              activeCycle: {
                ...cycleRef,
                startsAt: "2026-08-01T00:00:00.000Z",
                endsAt: "2026-08-14T00:00:00.000Z",
                progress: 0.5,
                isActive: true,
                team,
              },
            },
          },
        });
      }
      expect(request.query).toContain("query CycleIssues");
      expect(request.variables).toEqual({ cycleId: "cycle-1" });
      return jsonResponse({
        data: { issues: { nodes: [issueNode()], pageInfo: { hasNextPage: false } } },
      });
    });

    await expect(
      new LinearGraphqlClient("test-key-not-real", fetcher)
        .getIssues({ kind: "current-cycle", teamId: "team-1" })
        .then((page) => page.issues),
    ).resolves.toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("returns no issues when the active team has no current cycle", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ data: { team: { activeCycle: null } } }));

    await expect(
      new LinearGraphqlClient("test-key-not-real", fetcher).getIssues({
        kind: "current-cycle",
        teamId: "team-1",
      }),
    ).resolves.toEqual({ issues: [], hasMore: false });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("omits the state filter entirely when done issues are included", async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const request = requestBody(init);
      expect(request.variables).toEqual({ teamId: "team-1" });
      expect(request.query).not.toContain("state:");
      expect(request.query).not.toContain("nin:");
      return jsonResponse({
        data: { issues: { nodes: [], pageInfo: { hasNextPage: false } } },
      });
    });
    await new LinearGraphqlClient("test-key-not-real", fetcher).getIssues(
      { kind: "team", teamId: "team-1" },
      { includeDone: true },
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("sorts team cycles active-first then newest", async () => {
    const cycleNode = (number: number, isActive: boolean) => ({
      id: `cycle-${number}`,
      number,
      name: null,
      startsAt: "2026-08-01T00:00:00.000Z",
      endsAt: "2026-08-14T00:00:00.000Z",
      progress: 0,
      isActive,
      team,
    });
    const fetcher = vi.fn(async () =>
      jsonResponse({
        data: {
          team: {
            cycles: { nodes: [cycleNode(22, false), cycleNode(24, true), cycleNode(23, false)] },
          },
        },
      }),
    );
    const cycles = await new LinearGraphqlClient("test-key-not-real", fetcher).getTeamCycles(
      "team-1",
    );
    expect(cycles.map((cycle) => cycle.number)).toEqual([24, 23, 22]);
  });

  it("normalizes issue comments and null users", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        data: {
          issue: {
            comments: {
              nodes: [
                {
                  id: "comment-1",
                  body: "Looks good.",
                  createdAt: "2026-08-05T00:00:00.000Z",
                  user: assignee,
                },
                {
                  id: "comment-2",
                  body: "Deployed.",
                  createdAt: "2026-08-06T00:00:00.000Z",
                  user: null,
                },
              ],
              pageInfo: { hasNextPage: true },
            },
          },
        },
      }),
    );
    const page = await new LinearGraphqlClient("test-key-not-real", fetcher).getIssueComments(
      "issue-1",
    );
    expect(page.comments).toEqual([
      {
        id: "comment-1",
        body: "Looks good.",
        createdAt: "2026-08-05T00:00:00.000Z",
        author: "Sora",
      },
      { id: "comment-2", body: "Deployed.", createdAt: "2026-08-06T00:00:00.000Z", author: null },
    ]);
    expect(page.hasMore).toBe(true);
  });

  it("reports when the issue list exceeds the read limit", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        data: {
          viewer: {
            assignedIssues: { nodes: [issueNode()], pageInfo: { hasNextPage: true } },
          },
        },
      }),
    );
    const page = await new LinearGraphqlClient("test-key-not-real", fetcher).getIssues({
      kind: "assigned-to-me",
    });
    expect(page.hasMore).toBe(true);
  });

  it("reports when issue labels exceed the read limit", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        data: {
          viewer: {
            assignedIssues: { nodes: [issueNode(true)], pageInfo: { hasNextPage: false } },
          },
        },
      }),
    );
    const { issues } = await new LinearGraphqlClient("test-key-not-real", fetcher).getIssues({
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
            pageInfo: { hasNextPage: false },
          },
        },
      });
    });
    const { projects } = await new LinearGraphqlClient(
      "test-key-not-real",
      fetcher,
    ).getActiveProjects();
    expect(projects[0]).toMatchObject({ health: null, lead: null, teams: [team] });
  });

  it("loads cycle and project catalogs through the active team", async () => {
    const project = {
      ...projectRef,
      description: "Ship CLI",
      url: "https://linear.app/example/project/launch",
      progress: 0.25,
      health: null,
      startDate: null,
      targetDate: null,
      status: { id: "started", name: "In Progress", type: "started", color: "#fff" },
      lead: null,
      teams: { nodes: [team] },
    };
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const request = requestBody(init);
      expect(request.variables).toEqual({ teamId: "team-1" });
      expect(request.query).not.toContain("issues(");
      if (request.query.includes("query TeamCurrentCycle")) {
        return jsonResponse({
          data: {
            team: {
              activeCycle: {
                ...cycleRef,
                startsAt: "2026-08-01T00:00:00.000Z",
                endsAt: "2026-08-14T00:00:00.000Z",
                progress: 0.5,
                isActive: true,
                team,
              },
            },
          },
        });
      }
      expect(request.query).toContain("query TeamActiveProjects");
      expect(request.query).toContain("team(id: $teamId)");
      return jsonResponse({
        data: {
          team: { projects: { nodes: [project], pageInfo: { hasNextPage: false } } },
        },
      });
    });
    const client = new LinearGraphqlClient("test-key-not-real", fetcher);
    await expect(client.getCurrentCycles("team-1")).resolves.toHaveLength(1);
    await expect(
      client.getActiveProjects("team-1").then((page) => page.projects),
    ).resolves.toHaveLength(1);
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

  it("updates title and markdown description in one mutation", async () => {
    await expectMutation(
      {
        kind: "content",
        issueId: "issue-1",
        title: "Edit issues",
        description: "## Done\nFrom the TUI.",
      },
      {
        issueId: "issue-1",
        title: "Edit issues",
        description: "## Done\nFrom the TUI.",
      },
      "input: { title: $title, description: $description }",
      [
        "input: { stateId",
        "input: { cycleId",
        "input: { projectId",
        "input: { assigneeId",
        "input: { priority",
        "input: { labelIds",
      ],
    );
  });

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

  it("classifies HTTP 429 as a rate limit with the reset time", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response("too many requests", {
          status: 429,
          headers: { "x-ratelimit-requests-reset": "1893456000000" },
        }),
    );
    const error = await new LinearGraphqlClient("test-key-not-real", fetcher)
      .getIssues({ kind: "assigned-to-me" })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(LinearApiError);
    expect(error).toMatchObject({ kind: "rate-limit" });
    expect((error as LinearApiError).message).toContain("Retry after");
  });

  it("classifies request timeouts separately from connection failures", async () => {
    const client = new LinearGraphqlClient("test-key-not-real", async () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    });
    await expect(client.getAuthStatus()).rejects.toMatchObject({
      kind: "timeout",
      message: expect.stringContaining("did not respond") as string,
    });
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
  const workspace = { id: "org-1", name: "Example", urlKey: "sample-workspace" };
  it("accepts matching or omitted workspaces and fails fast on a mismatch", () => {
    expect(() => assertWorkspace("SAMPLE-WORKSPACE", workspace)).not.toThrow();
    expect(() => assertWorkspace(undefined, workspace)).not.toThrow();
    expect(() => assertWorkspace("other", workspace)).toThrow("Workspace mismatch");
  });
});

describe("LinearGraphqlClient create mutations", () => {
  it("creates an issue with a composite input payload", async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const request = requestBody(init);
      expect(request.query).toContain("mutation CreateIssue");
      expect(request.variables).toEqual({
        input: {
          teamId: "team-1",
          title: "Ship create flow",
          priority: 2,
          description: "## Notes\n- one",
          stateId: "state-1",
          labelIds: ["label-1"],
        },
      });
      return jsonResponse({
        data: {
          issueCreate: {
            success: true,
            issue: issueNode(),
          },
        },
      });
    });
    const created = await new LinearGraphqlClient("test-key-not-real", fetcher).createIssue({
      teamId: "team-1",
      title: "Ship create flow",
      description: "## Notes\n- one",
      stateId: "state-1",
      assigneeId: null,
      priority: 2,
      cycleId: null,
      projectId: null,
      labelIds: ["label-1"],
    });
    expect(created.identifier).toBe("ENG-1");
  });

  it("creates a project with name, teams, and markdown content", async () => {
    const project = {
      id: "project-2",
      name: "New Platform",
      slugId: "new-platform",
      description: "short",
      url: "https://linear.app/example/project/new-platform",
      progress: 0,
      health: null,
      startDate: null,
      targetDate: null,
      status: { id: "planned", name: "Planned", type: "planned", color: "#fff" },
      lead: null,
      teams: { nodes: [team] },
    };
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const request = requestBody(init);
      expect(request.query).toContain("mutation CreateProject");
      expect(request.variables).toEqual({
        input: {
          name: "New Platform",
          teamIds: ["team-1"],
          description: "short",
          content: "# Body\nmarkdown",
        },
      });
      return jsonResponse({ data: { projectCreate: { success: true, project } } });
    });
    const created = await new LinearGraphqlClient("test-key-not-real", fetcher).createProject({
      name: "New Platform",
      description: "short",
      content: "# Body\nmarkdown",
      teamIds: ["team-1"],
      leadId: null,
    });
    expect(created).toMatchObject({ name: "New Platform", teams: [team] });
  });
});

describe("LinearGraphqlClient getIssue", () => {
  it("normalizes the human identifier before sending it", async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const request = requestBody(init);
      expect(request.query).toContain("issue(id: $id)");
      expect(request.variables).toEqual({ id: "ENG-1" });
      return jsonResponse({ data: { issue: issueNode() } });
    });
    const issue = await new LinearGraphqlClient("test-key-not-real", fetcher).getIssue(" eng-1 ");
    expect(issue).toMatchObject({ identifier: "ENG-1", labels: [label], labelsComplete: true });
  });

  it("updates the title alone without sending the description", async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const request = requestBody(init);
      expect(request.query).toContain("input: { title: $title }");
      expect(request.variables).toEqual({ issueId: "issue-1", title: "Renamed" });
      return jsonResponse(updatedIssueData());
    });
    await new LinearGraphqlClient("test-key-not-real", fetcher).updateIssue({
      kind: "title",
      issueId: "issue-1",
      title: "Renamed",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("propagates the API error when the issue does not exist", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({ errors: [{ message: "Entity not found: Issue" }] }),
    );
    await expect(
      new LinearGraphqlClient("test-key-not-real", fetcher).getIssue("ENG-999"),
    ).rejects.toThrow("Entity not found");
  });
});
