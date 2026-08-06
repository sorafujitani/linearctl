import { describe, expect, it } from "vite-plus/test";

import {
  clampSelection,
  filterCycles,
  filterIssues,
  filterProjects,
  sortWorkflowStates,
  type Cycle,
  type Issue,
  type Project,
} from "./domain";

const team = { id: "team-1", name: "Engineering", key: "ENG" };
const state = {
  id: "state-1",
  name: "In Progress",
  type: "started",
  color: "#fff",
  position: 2,
};

function issue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: "issue-1",
    identifier: "ENG-1",
    title: "Build terminal UI",
    description: "OpenTUI viewer",
    priority: 2,
    priorityLabel: "High",
    estimate: 3,
    assignee: { id: "user-1", name: "Sora" },
    labels: [{ id: "label-1", name: "Docs", color: "#fff", team }],
    labelsComplete: true,
    url: "https://linear.app/example/issue/ENG-1",
    updatedAt: "2026-08-06T00:00:00.000Z",
    state,
    team,
    cycle: { id: "cycle-1", number: 12, name: "August" },
    project: { id: "project-1", name: "CLI Launch", slugId: "cli-launch" },
    ...overrides,
  };
}

function cycle(overrides: Partial<Cycle> = {}): Cycle {
  return {
    id: "cycle-1",
    number: 12,
    name: "August",
    startsAt: "2026-08-01T00:00:00.000Z",
    endsAt: "2026-08-14T00:00:00.000Z",
    progress: 0.4,
    isActive: true,
    team,
    ...overrides,
  };
}

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: "project-1",
    name: "CLI Launch",
    description: "Ship the terminal client",
    slugId: "cli-launch",
    url: "https://linear.app/example/project/cli-launch",
    progress: 0.5,
    health: "onTrack",
    startDate: "2026-08-01",
    targetDate: "2026-09-01",
    status: { id: "project-started", name: "In Progress", type: "started", color: "#fff" },
    lead: { id: "user-1", name: "Sora" },
    teams: [team],
    ...overrides,
  };
}

describe("search filters", () => {
  it("searches issue cycle and project fields", () => {
    const issues = [
      issue(),
      issue({ id: "issue-2", identifier: "OPS-2", cycle: null, project: null }),
    ];
    expect(filterIssues(issues, "august")).toEqual([issues[0]]);
    expect(filterIssues(issues, "CLI Launch")).toEqual([issues[0]]);
    expect(filterIssues(issues, "OPS-2")).toEqual([issues[1]]);
  });

  it("searches cycle and project catalog fields", () => {
    expect(filterCycles([cycle()], "engineering")).toHaveLength(1);
    expect(filterProjects([project()], "sora")).toHaveLength(1);
    expect(filterProjects([project()], "in progress")).toHaveLength(1);
  });

  it("returns a new array in the original order for an empty search", () => {
    const issues = [issue()];
    const result = filterIssues(issues, "  ");
    expect(result).toEqual(issues);
    expect(result).not.toBe(issues);
  });
});

it("clamps selection to the available range", () => {
  expect(clampSelection(-1, 2)).toBe(0);
  expect(clampSelection(10, 2)).toBe(1);
  expect(clampSelection(4, 0)).toBe(0);
});

it("sorts workflow states by position without mutating the input", () => {
  const states = [
    { id: "2", name: "Done", type: "completed", color: "#fff", position: 2 },
    { id: "1", name: "Todo", type: "unstarted", color: "#fff", position: 1 },
  ];
  expect(sortWorkflowStates(states).map((item) => item.id)).toEqual(["1", "2"]);
  expect(states[0]?.id).toBe("2");
});
