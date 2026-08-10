import { describe, expect, it } from "vite-plus/test";

import type { Issue } from "../core/domain";
import {
  filterIssueList,
  groupIssueList,
  groupedIssueTraversal,
  ISSUE_DIMENSIONS,
  moveSelectedIssueId,
  NONE_VALUE,
  retainSelectedIssueId,
} from "./issue-list";

const appTeam = { id: "team-app", name: "Product Engineering", key: "APP" };
const platTeam = { id: "team-plat", name: "Platform", key: "PLAT" };
const todo = { id: "todo", name: "Todo", type: "unstarted", color: "#fff", position: 1 };
const started = {
  id: "started",
  name: "In Progress",
  type: "started",
  color: "#fff",
  position: 2,
};
const backend = { id: "backend", name: "Backend", color: "#fff", team: appTeam };
const urgent = { id: "urgent", name: "Urgent", color: "#f00", team: null };

function issue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: "issue-1",
    identifier: "APP-1",
    title: "Improve the payment API",
    description: "Searchable description",
    priority: 2,
    priorityLabel: "High",
    estimate: 3,
    assignee: { id: "user-1", name: "Sora" },
    labels: [backend, urgent],
    labelsComplete: true,
    url: "https://example.invalid/APP-1",
    updatedAt: "2026-08-06T00:00:00Z",
    state: started,
    team: appTeam,
    cycle: { id: "cycle-1", number: 1, name: "Cycle 1" },
    project: { id: "project-1", name: "Checkout", slugId: "checkout" },
    ...overrides,
  };
}

const issues = [
  issue(),
  issue({
    id: "issue-2",
    identifier: "APP-2",
    title: "Unassigned issue",
    priority: 0,
    priorityLabel: "No priority",
    assignee: null,
    labels: [],
    labelsComplete: true,
    state: todo,
    cycle: null,
    project: null,
  }),
  issue({
    id: "issue-3",
    identifier: "PLAT-3",
    team: platTeam,
    assignee: { id: "user-2", name: "Ren" },
    labels: [urgent],
    labelsComplete: true,
    cycle: { id: "cycle-2", number: 2, name: "Cycle 2" },
  }),
];

describe("filterIssueList", () => {
  it("applies text search and each of the seven filter dimensions", () => {
    expect(filterIssueList(issues, "Searchable", {})).toHaveLength(3);
    expect(filterIssueList(issues, "", { status: "todo" }).map((value) => value.id)).toEqual([
      "issue-2",
    ]);
    expect(filterIssueList(issues, "", { assignee: "user-2" })[0]?.id).toBe("issue-3");
    expect(filterIssueList(issues, "", { priority: "2" })).toHaveLength(2);
    expect(filterIssueList(issues, "", { team: "team-plat" })[0]?.id).toBe("issue-3");
    expect(filterIssueList(issues, "", { cycle: "cycle-1" })[0]?.id).toBe("issue-1");
    expect(filterIssueList(issues, "", { project: "project-1" })).toHaveLength(2);
    expect(filterIssueList(issues, "", { label: "backend" })[0]?.id).toBe("issue-1");
  });

  it("combines unassigned values with filters across dimensions", () => {
    expect(
      filterIssueList(issues, "Unassigned", {
        assignee: NONE_VALUE,
        cycle: NONE_VALUE,
        project: NONE_VALUE,
        label: NONE_VALUE,
      }).map((value) => value.id),
    ).toEqual(["issue-2"]);
    expect(filterIssueList(issues, "", { status: "started", team: "team-plat" })[0]?.id).toBe(
      "issue-3",
    );
  });

  it("does not mutate the input array", () => {
    const original = structuredClone(issues);
    filterIssueList(issues, "api", { priority: "2" });
    expect(issues).toEqual(original);
  });

  it("traverses interleaved statuses in group-major order", () => {
    expect(groupedIssueTraversal(issues, "status").map((value) => value.id)).toEqual([
      "issue-1",
      "issue-3",
      "issue-2",
    ]);
  });

  it("includes a multi-label issue only at its first group occurrence", () => {
    const traversal = groupedIssueTraversal(issues, "label");
    expect(traversal.map((value) => value.id)).toEqual(["issue-1", "issue-3", "issue-2"]);
    expect(traversal.filter((value) => value.id === "issue-1")).toHaveLength(1);
    expect(moveSelectedIssueId(traversal, "issue-1", 1)).toBe("issue-3");
  });
});

describe("groupIssueList", () => {
  it("supports no grouping, seven group dimensions, and empty labels", () => {
    expect(groupIssueList(issues, "none")).toHaveLength(1);
    for (const dimension of ISSUE_DIMENSIONS) {
      expect(groupIssueList(issues, dimension).length).toBeGreaterThan(1);
    }
    expect(
      groupIssueList(issues, "label").find((group) => group.key === NONE_VALUE)?.issues[0]?.id,
    ).toBe("issue-2");
  });

  it("does not mutate the input array", () => {
    const original = structuredClone(issues);
    groupIssueList(issues, "label");
    expect(issues).toEqual(original);
  });
});

describe("issue selection", () => {
  it("retains the selected ID and falls back to the first item when it disappears", () => {
    expect(retainSelectedIssueId(issues, "issue-2")).toBe("issue-2");
    expect(
      retainSelectedIssueId(
        issues.filter((value) => value.id !== "issue-2"),
        "issue-2",
      ),
    ).toBe("issue-1");
    expect(retainSelectedIssueId([], "issue-2")).toBeNull();
  });

  it("moves by issue ID independently of group headers", () => {
    expect(moveSelectedIssueId(issues, "issue-1", 1)).toBe("issue-2");
    expect(moveSelectedIssueId(issues, "issue-3", 1)).toBe("issue-3");
  });
});
