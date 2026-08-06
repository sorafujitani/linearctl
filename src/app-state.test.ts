import { describe, expect, it } from "vite-plus/test";

import type { Issue } from "./domain";
import {
  beginIssueRequest,
  closeOverlay,
  createAppState,
  drillIntoSelected,
  escapeIssueBrowser,
  finishIssueRequest,
  issueChangeForOverlay,
  moveSelection,
  moveOverlay,
  openOverlay,
  preferCatalogTeam,
  selectTopNav,
  setFilter,
  setGroup,
  toggleSelectedLabel,
  type AppState,
  type Overlay,
} from "./app-state";

const team = { id: "team-1", name: "Team", key: "TEAM" };
const issue: Issue = {
  id: "issue-1",
  identifier: "TEAM-1",
  title: "Issue",
  description: null,
  priority: 1,
  priorityLabel: "Urgent",
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
};

describe("app navigation", () => {
  it("handles 1-4 navigation, catalog drilldown, and Escape", () => {
    let state = createAppState();
    expect(state.screen).toMatchObject({ kind: "issue-browser", origin: "my-issues" });
    state = selectTopNav(state, "teams");
    state = { ...state, teams: [team] };
    expect(state.screen).toEqual({ kind: "catalog", catalog: "teams" });
    state = drillIntoSelected(state);
    expect(state.screen).toEqual({
      kind: "issue-browser",
      origin: "teams",
      scope: { kind: "team", teamId: "team-1" },
    });
    expect(escapeIssueBrowser(state).screen).toEqual({ kind: "catalog", catalog: "teams" });
    expect(selectTopNav(state, "cycles").screen).toEqual({ kind: "catalog", catalog: "cycles" });
    expect(selectTopNav(state, "projects").screen).toEqual({
      kind: "catalog",
      catalog: "projects",
    });
  });

  it("prefers the configured team without hiding other catalog entries", () => {
    const other = { id: "team-2", name: "Other", key: "OTHER" };
    const cycle = {
      id: "cycle-1",
      number: 1,
      name: "Current",
      startsAt: "2026-08-01T00:00:00Z",
      endsAt: "2026-08-14T00:00:00Z",
      progress: 0,
      isActive: true,
      team,
    };
    const project = {
      id: "project-1",
      name: "Project",
      slugId: "project",
      description: "",
      url: "https://example.invalid/project",
      progress: 0,
      health: null,
      startDate: null,
      targetDate: null,
      status: { id: "status", name: "Planned", type: "planned", color: "#fff" },
      lead: null,
      teams: [team, other],
    };
    const state = {
      ...createAppState(),
      teams: [other, team],
      cycles: [{ ...cycle, id: "other-cycle", team: other }, cycle],
      projects: [{ ...project, id: "other-project", teams: [other] }, project],
    };

    expect(preferCatalogTeam(state, "teams", "team").catalogIndexes.teams).toBe(1);
    expect(preferCatalogTeam(state, "cycles", "TEAM").catalogIndexes.cycles).toBe(1);
    expect(preferCatalogTeam(state, "projects", "TEAM").catalogIndexes.projects).toBe(1);
    expect(preferCatalogTeam(state, "teams", "missing").teams).toHaveLength(2);
  });

  it("moves issue selection in the visual order of group headers", () => {
    const started = {
      id: "started",
      name: "In Progress",
      type: "started",
      color: "#fff",
      position: 2,
    };
    const first = { ...issue, id: "issue-1", state: started };
    const second = { ...issue, id: "issue-2" };
    const third = { ...issue, id: "issue-3", state: started };
    let state: AppState = {
      ...createAppState(),
      issues: [first, second, third],
      selectedIssueId: first.id,
    };
    state = setGroup(state, "status");
    expect(moveSelection(state, 1).selectedIssueId).toBe("issue-3");
  });

  it("does not overwrite the current issue browser with a stale request", () => {
    let state = beginIssueRequest(createAppState(), 1);
    state = selectTopNav(state, "teams");
    state = finishIssueRequest(state, 1, { kind: "assigned-to-me" }, [issue]);
    expect(state.issues).toEqual([]);

    state = beginIssueRequest(selectTopNav(state, "my-issues"), 2);
    state = finishIssueRequest(state, 1, { kind: "assigned-to-me" }, [issue]);
    expect(state.issues).toEqual([]);
    state = finishIssueRequest(state, 2, { kind: "assigned-to-me" }, [issue]);
    expect(state.issues).toEqual([issue]);
  });
});

describe("app overlays", () => {
  it("replaces overlays exclusively and closes them after filter/group confirmation", () => {
    let state = openOverlay(createAppState(), { kind: "filter-field", selectedIndex: 0 });
    state = openOverlay(state, { kind: "group", selectedIndex: 0 });
    expect(state.overlay?.kind).toBe("group");
    state = moveOverlay(state, 1);
    expect(state.overlay?.selectedIndex).toBe(1);
    state = setGroup(state, "status");
    expect(state).toMatchObject({ groupBy: "status", overlay: null });
    state = setFilter(state, "assignee", "__none__");
    expect(state).toMatchObject({ filters: { assignee: "__none__" }, overlay: null });
    expect(closeOverlay(state).overlay).toBeNull();
  });

  it("treats unchanged single choices and reordered label sets as no-ops", () => {
    const labelA = { id: "label-a", name: "A", color: "#fff", team };
    const labelB = { id: "label-b", name: "B", color: "#fff", team: null };
    const current = { ...issue, labels: [labelA, labelB] };
    const single = (
      action: "status" | "assignee" | "priority" | "cycle" | "project",
      id: string,
    ): Extract<Overlay, { kind: "single-choice" }> => ({
      kind: "single-choice",
      action,
      issueId: current.id,
      options: [{ id, label: id }],
      selectedIndex: 0,
    });
    expect(issueChangeForOverlay(current, single("status", "todo"))).toBeNull();
    expect(issueChangeForOverlay(current, single("assignee", "__none__"))).toBeNull();
    expect(issueChangeForOverlay(current, single("priority", "1"))).toBeNull();
    expect(issueChangeForOverlay(current, single("cycle", "__none__"))).toBeNull();
    expect(issueChangeForOverlay(current, single("project", "__none__"))).toBeNull();
    expect(
      issueChangeForOverlay(current, {
        kind: "labels",
        issueId: current.id,
        options: [labelA, labelB],
        selectedIndex: 0,
        selectedIds: ["label-b", "label-a"],
      }),
    ).toBeNull();
    expect(issueChangeForOverlay(current, single("status", "started"))).toEqual({
      kind: "status",
      issueId: current.id,
      stateId: "started",
    });
  });

  it("edits a label multi-select with a Space-equivalent toggle", () => {
    const label = { id: "label-1", name: "Backend", color: "#fff", team };
    let state = openOverlay(createAppState(), {
      kind: "labels",
      issueId: "issue-1",
      options: [label],
      selectedIndex: 0,
      selectedIds: [],
    });
    state = toggleSelectedLabel(state);
    expect(state.overlay).toMatchObject({ kind: "labels", selectedIds: ["label-1"] });
    state = toggleSelectedLabel(state);
    expect(state.overlay).toMatchObject({ kind: "labels", selectedIds: [] });
  });
});
