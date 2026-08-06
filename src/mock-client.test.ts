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

async function allIssues(client: MockLinearClient): Promise<Issue[]> {
  const teams = await client.getTeams();
  const scoped = await Promise.all(
    teams.map((team) => client.getIssues({ kind: "team", teamId: team.id })),
  );
  return scoped.flat().sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

describe("MockLinearClient fixture", () => {
  it("returns 15 issues, three teams/current cycles, and four active projects", async () => {
    const client = new MockLinearClient();
    const status = await client.getAuthStatus();
    const issues = await allIssues(client);
    const cycles = await client.getCurrentCycles();
    const projects = await client.getActiveProjects();

    expect(status.workspace.urlKey).toBe("fs0414");
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
      (await client.getActiveProjects("mock-team-app")).every((project) =>
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

  it("returns assigned, team, cycle, and project scopes from one issue source", async () => {
    const client = new MockLinearClient();
    const assigned = await client.getIssues({ kind: "assigned-to-me" });
    const appAssigned = await client.getIssues({
      kind: "assigned-to-me",
      teamId: "mock-team-app",
    });
    const app = await client.getIssues({ kind: "team", teamId: "mock-team-app" });
    const cycle = await client.getIssues({ kind: "cycle", cycleId: "mock-cycle-app-24" });
    const project = await client.getIssues({
      kind: "project",
      projectId: "mock-project-growth-experiments",
    });
    expect(assigned).toHaveLength(3);
    expect(appAssigned.every((issue) => issue.team.id === "mock-team-app")).toBe(true);
    expect(appAssigned.length).toBeGreaterThan(0);
    expect(app).toHaveLength(5);
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
    const projects = await client.getActiveProjects();

    for (const cycle of cycles)
      expect(await client.getIssues({ kind: "cycle", cycleId: cycle.id })).toEqual(
        issues.filter((issue) => issue.cycle?.id === cycle.id),
      );

    for (const project of projects)
      expect(await client.getIssues({ kind: "project", projectId: project.id })).toEqual(
        issues.filter((issue) => issue.project?.id === project.id),
      );
  });

  it("includes single-team and multi-team projects with nullable metadata", async () => {
    const projects = await new MockLinearClient().getActiveProjects();
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
    const projects = await client.getActiveProjects();
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
    expect((await client.getActiveProjects())[0]?.teams[0]?.name).not.toBe("caller mutation");
    expect((await client.getTeamMembers("mock-team-app"))[0]?.name).not.toBe("caller mutation");
    expect((await client.getIssueLabels())[0]?.name).not.toBe("caller mutation");
  });
});

describe("MockLinearClient mutations", () => {
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
    const cycleIssue = (
      await first.getIssues({
        kind: "cycle",
        cycleId: "mock-cycle-app-24",
      })
    ).find((issue) => issue.id === "mock-issue-app-101");
    expect(cycleIssue?.state.id).toBe("app-done");

    await first.updateIssue({ kind: "cycle", issueId: "mock-issue-app-101", cycleId: null });
    await first.updateIssue({ kind: "project", issueId: "mock-issue-app-101", projectId: null });
    const updated = requireIssue(await allIssues(first), "mock-issue-app-101");
    expect(updated).toMatchObject({ state: { id: "app-done" }, cycle: null, project: null });
    expect(
      (await first.getIssues({ kind: "cycle", cycleId: "mock-cycle-app-24" })).map(
        (issue) => issue.id,
      ),
    ).not.toContain("mock-issue-app-101");
    expect(
      (await first.getIssues({ kind: "project", projectId: "mock-project-mobile-renewal" })).map(
        (issue) => issue.id,
      ),
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
});
