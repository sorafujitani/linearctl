import { describe, expect, it } from "vite-plus/test";

import type { Issue } from "./domain";
import { MockLinearClient } from "./mock-client";

function requireIssue(issues: readonly Issue[], issueId: string): Issue {
  const issue = issues.find((candidate) => candidate.id === issueId);
  if (issue === undefined) throw new Error(`test fixture issue is missing: ${issueId}`);
  return issue;
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort();
}

async function allIssues(client: MockLinearClient, includeDone = false): Promise<Issue[]> {
  const teams = await client.getTeams();
  const scoped = await Promise.all(
    teams.map((team) =>
      client
        .getIssues({ kind: "team", teamId: team.id }, { includeDone })
        .then((page) => page.issues),
    ),
  );
  return scoped.flat().sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

describe("MockLinearClient fixture", () => {
  it("returns 15 issues, three teams/current cycles, and four active projects", async () => {
    const client = new MockLinearClient();
    const status = await client.getAuthStatus();
    const issues = await allIssues(client);
    const cycles = await client.getCurrentCycles();
    const { projects } = await client.getActiveProjects();

    expect(status.workspace.urlKey).toBe("sample-workspace");
    expect(issues).toHaveLength(15);
    expect(sorted([...new Set(issues.map((issue) => issue.team.key))])).toEqual([
      "APP",
      "GROW",
      "PLAT",
    ]);
    expect(cycles).toHaveLength(3);
    expect(sorted(cycles.map((cycle) => cycle.team.key))).toEqual(["APP", "GROW", "PLAT"]);
    expect(projects).toHaveLength(4);
    expect(sorted(projects.map((project) => project.status.type))).toEqual([
      "paused",
      "planned",
      "started",
      "started",
    ]);
    await expect(client.getCurrentCycles("mock-team-app")).resolves.toHaveLength(1);
    expect(
      (await client.getActiveProjects("mock-team-app")).projects.every((project) =>
        project.teams.some((team) => team.id === "mock-team-app"),
      ),
    ).toBe(true);
    expect(issues.every((issue) => !["completed", "canceled"].includes(issue.state.type))).toBe(
      true,
    );
    expect(issues.map((issue) => issue.updatedAt)).toEqual(
      issues
        .map((issue) => issue.updatedAt)
        .toSorted()
        .reverse(),
    );
  });

  it("includes issues with both, one, or neither cycle and project", async () => {
    const issues = await allIssues(new MockLinearClient());

    expect(issues.some((issue) => issue.cycle !== null && issue.project !== null)).toBe(true);
    expect(issues.some((issue) => issue.cycle !== null && issue.project === null)).toBe(true);
    expect(issues.some((issue) => issue.cycle === null && issue.project !== null)).toBe(true);
    expect(issues.some((issue) => issue.cycle === null && issue.project === null)).toBe(true);
  });

  it("returns assigned, team, current-cycle, cycle, and project scopes from one issue source", async () => {
    const client = new MockLinearClient();
    const issuesFor = (scope: Parameters<MockLinearClient["getIssues"]>[0]) =>
      client.getIssues(scope).then((page) => page.issues);
    const assigned = await issuesFor({ kind: "assigned-to-me" });
    const appAssigned = await issuesFor({ kind: "assigned-to-me", teamId: "mock-team-app" });
    const app = await issuesFor({ kind: "team", teamId: "mock-team-app" });
    const currentCycle = await issuesFor({ kind: "current-cycle", teamId: "mock-team-app" });
    const cycle = await issuesFor({ kind: "cycle", cycleId: "mock-cycle-app-24" });
    const project = await issuesFor({
      kind: "project",
      projectId: "mock-project-growth-experiments",
    });
    expect(assigned).toHaveLength(3);
    expect(appAssigned.every((issue) => issue.team.id === "mock-team-app")).toBe(true);
    expect(appAssigned.length).toBeGreaterThan(0);
    expect(app).toHaveLength(5);
    expect(currentCycle).toEqual(cycle);
    expect(cycle.every((issue) => issue.cycle?.id === "mock-cycle-app-24")).toBe(true);
    expect(project.every((issue) => issue.project?.id === "mock-project-growth-experiments")).toBe(
      true,
    );
  });

  it("includes filterable assignee, priority, estimate, and label variation", async () => {
    const issues = await allIssues(new MockLinearClient());
    expect(issues.some((issue) => issue.assignee === null)).toBe(true);
    expect(issues.some((issue) => issue.assignee !== null)).toBe(true);
    expect(new Set(issues.map((issue) => issue.priority)).size).toBeGreaterThan(3);
    expect(issues.some((issue) => issue.estimate === null)).toBe(true);
    expect(issues.some((issue) => issue.labels.length === 0)).toBe(true);
    expect(issues.some((issue) => issue.labels.length > 1)).toBe(true);
  });

  it("hides done issues by default and includes them on request", async () => {
    const client = new MockLinearClient();
    const active = await client.getIssues({ kind: "team", teamId: "mock-team-app" });
    expect(active.issues.map((issue) => issue.identifier)).not.toContain("APP-106");
    const all = await client.getIssues(
      { kind: "team", teamId: "mock-team-app" },
      { includeDone: true },
    );
    expect(all.issues.map((issue) => issue.identifier)).toContain("APP-106");
  });

  it("lists team cycles with the active cycle first", async () => {
    const cycles = await new MockLinearClient().getTeamCycles("mock-team-app");
    expect(cycles.map((cycle) => cycle.number)).toEqual([24, 23]);
    expect(cycles[0]?.isActive).toBe(true);
    await expect(new MockLinearClient().getCurrentCycles("mock-team-app")).resolves.toHaveLength(1);
  });

  it("returns issue comments including bot comments", async () => {
    const client = new MockLinearClient();
    const page = await client.getIssueComments("mock-issue-app-101");
    expect(page.comments).toHaveLength(2);
    expect(page.comments[1]?.author).toBeNull();
    await expect(client.getIssueComments("mock-issue-app-102")).resolves.toEqual({
      comments: [],
      hasMore: false,
    });
    await expect(client.getIssueComments("missing")).rejects.toThrow("Mock issue not found");
  });

  it("returns only members of the requested team", async () => {
    const client = new MockLinearClient();
    await expect(client.getTeamMembers("mock-team-app")).resolves.toEqual([
      { id: "mock-viewer", name: "Mock Viewer" },
      { id: "mock-user-aiko", name: "Aiko Takahashi" },
      { id: "mock-user-yuta", name: "Yuta Yamada" },
    ]);
    await expect(client.getTeamMembers("unknown")).rejects.toThrow("Mock team not found");
  });

  it("matches each issue identifier prefix to its team key", async () => {
    const issues = await allIssues(new MockLinearClient());
    for (const issue of issues)
      expect(issue.identifier.startsWith(`${issue.team.key}-`)).toBe(true);
  });

  it("keeps every scoped issue consistent with its cycle or project reference", async () => {
    const client = new MockLinearClient();
    const issues = await allIssues(client);
    const cycles = await client.getCurrentCycles();
    const { projects } = await client.getActiveProjects();

    for (const cycle of cycles)
      expect((await client.getIssues({ kind: "cycle", cycleId: cycle.id })).issues).toEqual(
        issues.filter((issue) => issue.cycle?.id === cycle.id),
      );

    for (const project of projects)
      expect((await client.getIssues({ kind: "project", projectId: project.id })).issues).toEqual(
        issues.filter((issue) => issue.project?.id === project.id),
      );
  });

  it("includes single-team and multi-team projects with nullable metadata", async () => {
    const { projects } = await new MockLinearClient().getActiveProjects();
    const growthPlatform = projects.find(
      (project) => project.id === "mock-project-growth-experiments",
    );

    expect(projects.some((project) => project.teams.length === 1)).toBe(true);
    expect(projects.some((project) => project.teams.length > 1)).toBe(true);
    expect(growthPlatform?.teams.map((team) => team.key)).toEqual(["APP", "GROW"]);
    expect(projects.some((project) => project.health === null)).toBe(true);
    expect(projects.some((project) => project.startDate === null)).toBe(true);
    expect(projects.some((project) => project.targetDate === null)).toBe(true);
    expect(projects.some((project) => project.lead === null)).toBe(true);
  });
});

describe("MockLinearClient copy isolation", () => {
  it("returns deep copies that are isolated from client state", async () => {
    const client = new MockLinearClient();
    const issues = await allIssues(client);
    const cycles = await client.getCurrentCycles();
    const { projects } = await client.getActiveProjects();
    const users = await client.getTeamMembers("mock-team-app");
    const labels = await client.getIssueLabels();
    const firstIssue = issues[0];
    const firstCycle = cycles[0];
    const firstProjectTeam = projects[0]?.teams[0];
    const firstUser = users[0];
    const firstLabel = labels[0];
    if (
      firstIssue === undefined ||
      firstCycle === undefined ||
      firstProjectTeam === undefined ||
      firstUser === undefined ||
      firstLabel === undefined
    ) {
      throw new Error("mock fixture is empty");
    }

    firstIssue.state.name = "caller mutation";
    firstIssue.cycle = null;
    firstCycle.name = "caller mutation";
    firstProjectTeam.name = "caller mutation";
    firstUser.name = "caller mutation";
    firstLabel.name = "caller mutation";

    expect((await allIssues(client))[0]?.state.name).not.toBe("caller mutation");
    expect((await allIssues(client))[0]?.cycle).not.toBeNull();
    expect((await client.getCurrentCycles())[0]?.name).not.toBe("caller mutation");
    expect((await client.getActiveProjects()).projects[0]?.teams[0]?.name).not.toBe(
      "caller mutation",
    );
    expect((await client.getTeamMembers("mock-team-app"))[0]?.name).not.toBe("caller mutation");
    expect((await client.getIssueLabels())[0]?.name).not.toBe("caller mutation");
  });
});

describe("MockLinearClient mutations", () => {
  it("updates an issue title and markdown description only within the process", async () => {
    const first = new MockLinearClient();
    const second = new MockLinearClient();
    const result = await first.updateIssue({
      kind: "content",
      issueId: "mock-issue-app-105",
      title: "Editable issue",
      description: "## Notes\nUpdated from linearctl.",
    });

    expect(result).toMatchObject({
      title: "Editable issue",
      description: "## Notes\nUpdated from linearctl.",
    });
    expect(requireIssue(await allIssues(first), "mock-issue-app-105")).toMatchObject({
      title: "Editable issue",
      description: "## Notes\nUpdated from linearctl.",
    });
    const cleared = await first.updateIssue({
      kind: "content",
      issueId: "mock-issue-app-105",
      title: "Editable issue",
      description: "",
    });
    expect(cleared.description).toBeNull();
    expect(requireIssue(await allIssues(second), "mock-issue-app-105").title).not.toBe(
      "Editable issue",
    );
  });

  it("updates assignee, priority, and labels only within the process", async () => {
    const first = new MockLinearClient();
    const second = new MockLinearClient();
    await first.updateIssue({
      kind: "assignee",
      issueId: "mock-issue-app-105",
      assigneeId: "mock-user-aiko",
    });
    await first.updateIssue({ kind: "priority", issueId: "mock-issue-app-105", priority: 1 });
    const result = await first.updateIssue({
      kind: "labels",
      issueId: "mock-issue-app-105",
      labelIds: ["label-bug", "label-app"],
    });
    expect(result).toMatchObject({
      assignee: { id: "mock-user-aiko" },
      priority: 1,
      labels: [{ id: "label-bug" }, { id: "label-app" }],
    });
    const clearedAssignee = await first.updateIssue({
      kind: "assignee",
      issueId: "mock-issue-app-105",
      assigneeId: null,
    });
    const clearedLabels = await first.updateIssue({
      kind: "labels",
      issueId: "mock-issue-app-105",
      labelIds: [],
    });
    expect(clearedAssignee.assignee).toBeNull();
    expect(clearedLabels.labels).toEqual([]);
    expect(requireIssue(await allIssues(second), "mock-issue-app-105")).toMatchObject({
      assignee: null,
      priority: 4,
      labels: [],
    });
  });

  it("updates status, cycle, and project in one instance and refreshes scoped reads", async () => {
    const first = new MockLinearClient();
    const second = new MockLinearClient();

    const statusResult = await first.updateIssue({
      kind: "status",
      issueId: "mock-issue-app-101",
      stateId: "app-done",
    });
    expect(statusResult).toMatchObject({
      state: { id: "app-done" },
      cycle: { id: "mock-cycle-app-24" },
      project: { id: "mock-project-mobile-renewal" },
    });
    // Done issues disappear from default reads; includeDone keeps them reachable.
    const defaultRead = await first.getIssues({ kind: "cycle", cycleId: "mock-cycle-app-24" });
    expect(defaultRead.issues.map((issue) => issue.id)).not.toContain("mock-issue-app-101");
    const cycleIssue = (
      await first.getIssues({ kind: "cycle", cycleId: "mock-cycle-app-24" }, { includeDone: true })
    ).issues.find((issue) => issue.id === "mock-issue-app-101");
    expect(cycleIssue?.state.id).toBe("app-done");

    await first.updateIssue({ kind: "cycle", issueId: "mock-issue-app-101", cycleId: null });
    await first.updateIssue({ kind: "project", issueId: "mock-issue-app-101", projectId: null });
    const updated = requireIssue(await allIssues(first, true), "mock-issue-app-101");
    expect(updated).toMatchObject({ state: { id: "app-done" }, cycle: null, project: null });
    expect(
      (await first.getIssues({ kind: "cycle", cycleId: "mock-cycle-app-24" })).issues.map(
        (issue) => issue.id,
      ),
    ).not.toContain("mock-issue-app-101");
    expect(
      (
        await first.getIssues({ kind: "project", projectId: "mock-project-mobile-renewal" })
      ).issues.map((issue) => issue.id),
    ).not.toContain("mock-issue-app-101");

    const untouched = requireIssue(await allIssues(second), "mock-issue-app-101");
    expect(untouched).toMatchObject({
      state: { id: "app-progress" },
      cycle: { id: "mock-cycle-app-24" },
      project: { id: "mock-project-mobile-renewal" },
    });
  });

  it("assigns the same-team current cycle and a matching multi-team project", async () => {
    const client = new MockLinearClient();
    await client.updateIssue({
      kind: "cycle",
      issueId: "mock-issue-app-105",
      cycleId: "mock-cycle-app-24",
    });
    await client.updateIssue({
      kind: "project",
      issueId: "mock-issue-app-105",
      projectId: "mock-project-growth-experiments",
    });
    await client.updateIssue({
      kind: "project",
      issueId: "mock-issue-grow-305",
      projectId: "mock-project-growth-experiments",
    });

    const appIssue = requireIssue(await allIssues(client), "mock-issue-app-105");
    const growIssue = requireIssue(await allIssues(client), "mock-issue-grow-305");
    expect(appIssue).toMatchObject({
      cycle: { id: "mock-cycle-app-24" },
      project: { id: "mock-project-growth-experiments" },
    });
    expect(growIssue.project?.id).toBe("mock-project-growth-experiments");
  });

  it("rejects unknown or cross-team statuses, cycles, and projects", async () => {
    const client = new MockLinearClient();
    await expect(
      client.updateIssue({ kind: "status", issueId: "unknown", stateId: "app-done" }),
    ).rejects.toThrow("Mock issue");
    await expect(
      client.updateIssue({
        kind: "status",
        issueId: "mock-issue-app-101",
        stateId: "plat-resolved",
      }),
    ).rejects.toThrow("Mock status");
    await expect(
      client.updateIssue({
        kind: "cycle",
        issueId: "mock-issue-app-101",
        cycleId: "mock-cycle-plat-31",
      }),
    ).rejects.toThrow("Mock cycle");
    await expect(
      client.updateIssue({
        kind: "project",
        issueId: "mock-issue-plat-201",
        projectId: "mock-project-mobile-renewal",
      }),
    ).rejects.toThrow("Mock project");
    await expect(
      client.updateIssue({
        kind: "labels",
        issueId: "mock-issue-app-101",
        labelIds: ["label-platform"],
      }),
    ).rejects.toThrow("Mock label");
  });

  it("creates issues and projects in memory", async () => {
    const client = new MockLinearClient();
    const issue = await client.createIssue({
      teamId: "mock-team-app",
      title: "New checkout bug",
      description: "## Repro\n1. open cart",
      stateId: null,
      assigneeId: null,
      priority: 1,
      cycleId: "mock-cycle-app-24",
      projectId: "mock-project-mobile-renewal",
      labelIds: ["label-bug"],
    });
    expect(issue.identifier.startsWith("APP-")).toBe(true);
    expect(issue.description).toContain("## Repro");
    expect(issue.priorityLabel).toBe("Urgent");
    expect(
      (await client.getIssues({ kind: "team", teamId: "mock-team-app" })).issues.some(
        (item) => item.id === issue.id,
      ),
    ).toBe(true);

    const project = await client.createProject({
      name: "Support Ops",
      description: "short summary",
      content: "# Goals\n- reduce queue",
      teamIds: ["mock-team-app"],
      leadId: "mock-user-aiko",
    });
    expect(project.name).toBe("Support Ops");
    expect(project.lead?.id).toBe("mock-user-aiko");
    expect(
      (await client.getActiveProjects("mock-team-app")).projects.some(
        (item) => item.id === project.id,
      ),
    ).toBe(true);
  });
});
