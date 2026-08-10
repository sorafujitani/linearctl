import { expect, it } from "vite-plus/test";

import type { Cycle, Issue } from "../core/domain";
import { NONE_VALUE } from "./issue-list";
import { CLEAR_VALUE, cycleOptions, issueFilterOptions, optionsWithNone } from "./issue-options";

const team = { id: "team-1", name: "Engineering", key: "ENG" };

function issue(overrides: Partial<Issue>): Issue {
  return {
    id: "issue-1",
    identifier: "ENG-1",
    title: "Issue",
    description: null,
    priority: 2,
    priorityLabel: "High",
    estimate: null,
    assignee: null,
    labels: [],
    labelsComplete: true,
    url: "https://example.invalid",
    updatedAt: "2026-08-06T00:00:00Z",
    state: { id: "todo", name: "Todo", type: "unstarted", color: "#fff", position: 1 },
    team,
    cycle: null,
    project: null,
    ...overrides,
  };
}

it("deduplicates filter options and leads with clear and none rows", () => {
  const aiko = { id: "u1", name: "Aiko" };
  const issues = [
    issue({ id: "1", assignee: aiko }),
    issue({ id: "2", assignee: aiko }),
    issue({ id: "3" }),
  ];
  const options = issueFilterOptions(issues, "assignee");
  expect(options.map((option) => option.id)).toEqual([CLEAR_VALUE, NONE_VALUE, "u1"]);
});

it("collects label options across issues", () => {
  const label = (id: string, name: string) => ({ id, name, color: "#fff", team: null });
  const issues = [
    issue({ id: "1", labels: [label("l1", "Bug"), label("l2", "Perf")] }),
    issue({ id: "2", labels: [label("l1", "Bug")] }),
  ];
  const options = issueFilterOptions(issues, "label");
  expect(options.map((option) => option.label)).toEqual([
    "Clear this filter",
    "No labels",
    "Bug",
    "Perf",
  ]);
});

it("preselects the current value in optionsWithNone and falls back to none", () => {
  const base = [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
  ];
  expect(optionsWithNone(base, "b").selectedIndex).toBe(2);
  expect(optionsWithNone(base, null).selectedIndex).toBe(0);
  expect(optionsWithNone(base, "missing").selectedIndex).toBe(0);
  expect(optionsWithNone(base, null, "Team default").options[0]).toEqual({
    id: NONE_VALUE,
    label: "Team default",
  });
});

it("labels cycles with number, name, and the active marker", () => {
  const cycle = (number: number, isActive: boolean, name: string | null): Cycle => ({
    id: `c${number}`,
    number,
    name,
    startsAt: "2026-08-01T00:00:00Z",
    endsAt: "2026-08-14T00:00:00Z",
    progress: 0,
    isActive,
    team,
  });
  expect(
    cycleOptions([cycle(24, true, "Summer"), cycle(23, false, null)]).map((o) => o.label),
  ).toEqual(["#24 Summer (active)", "#23 Untitled"]);
});
