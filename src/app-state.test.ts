import { describe, expect, it } from "vite-plus/test";

import type { Issue } from "./domain";
import {
  applyCreatedIssue,
  applyIssueUpdate,
  cancelOverlaySearch,
  applyCreatedProject,
  beginIssueRequest,
  closeOverlay,
  createAppState,
  drillIntoSelected,
  emptyIssueCreateDraft,
  emptyProjectCreateDraft,
  escapeIssueBrowser,
  finishIssueRequest,
  issueChangeForOverlay,
  issueCreateInputFromDraft,
  issueEditDraft,
  moveSelection,
  moveOverlay,
  openTeamSelector,
  openOverlay,
  projectCreateInputFromDraft,
  scopedProjects,
  selectActiveTeam,
  selectedOverlayOption,
  setOverlayQuery,
  startOverlaySearch,
  selectTopNav,
  setFilter,
  setGroup,
  toggleSelectedLabel,
  visibleOverlayLabels,
  visibleOverlayOptions,
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
    let state = selectActiveTeam({ ...createAppState(), teams: [team] }, team.id);
    expect(state.screen).toMatchObject({ kind: "issue-browser", origin: "my-issues" });
    state = selectTopNav(state, "teams");
    expect(state.screen).toEqual({
      kind: "issue-browser",
      origin: "teams",
      scope: { kind: "team", teamId: "team-1" },
    });
    expect(escapeIssueBrowser(state).screen).toEqual(state.screen);
    expect(selectTopNav(state, "cycles").screen).toEqual({
      kind: "issue-browser",
      origin: "cycles",
      scope: { kind: "current-cycle", teamId: "team-1" },
    });
    expect(selectTopNav(state, "projects").screen).toEqual({
      kind: "catalog",
      catalog: "projects",
    });
  });

  it("uses one active team for My Issues, cycles, and projects", () => {
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
    let state: AppState = {
      ...createAppState(),
      teams: [other, team],
      cycles: [{ ...cycle, id: "other-cycle", team: other }, cycle],
      projects: [{ ...project, id: "other-project", teams: [other] }, project],
    };

    state = selectActiveTeam(state, team.id);
    expect(state.screen).toEqual({
      kind: "issue-browser",
      origin: "my-issues",
      scope: { kind: "assigned-to-me", teamId: team.id },
    });
    expect(scopedProjects(state).map((item) => item.id)).toEqual(["project-1"]);

    state = selectTopNav(state, "projects");
    state = drillIntoSelected(state);
    expect(state.screen).toEqual({
      kind: "issue-browser",
      origin: "projects",
      scope: { kind: "project", projectId: "project-1" },
    });
    state = escapeIssueBrowser(state);

    state = openTeamSelector(state, "projects");
    expect(state.overlay).toMatchObject({
      kind: "team-context",
      destination: "projects",
      selectedIndex: 1,
    });
    expect(selectTopNav({ ...state, activeTeamId: null }, "cycles").overlay).toMatchObject({
      kind: "team-context",
      destination: "cycles",
    });

    state = selectActiveTeam(state, other.id, "cycles");
    expect(state.screen).toEqual({
      kind: "issue-browser",
      origin: "cycles",
      scope: { kind: "current-cycle", teamId: other.id },
    });
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
    let state = beginIssueRequest(
      selectActiveTeam({ ...createAppState(), teams: [team] }, team.id),
      1,
    );
    const assignedScope = { kind: "assigned-to-me", teamId: team.id } as const;
    state = selectTopNav(state, "teams");
    state = finishIssueRequest(state, 1, assignedScope, { issues: [issue], hasMore: false });
    expect(state.issues).toEqual([]);

    state = beginIssueRequest(selectTopNav(state, "my-issues"), 2);
    state = finishIssueRequest(state, 1, assignedScope, { issues: [issue], hasMore: false });
    expect(state.issues).toEqual([]);
    state = finishIssueRequest(state, 2, assignedScope, { issues: [issue], hasMore: false });
    expect(state.issues).toEqual([issue]);
  });

  it("keeps pendingIssueRequest while a view switch is in flight", () => {
    let state = selectActiveTeam({ ...createAppState(), teams: [team] }, team.id, "teams");
    expect(state.pendingIssueRequest).toBeNull();
    state = beginIssueRequest(state, 3);
    expect(state.pendingIssueRequest).toEqual({
      id: 3,
      scope: { kind: "team", teamId: team.id },
    });
    state = finishIssueRequest(
      state,
      3,
      { kind: "team", teamId: team.id },
      { issues: [issue], hasMore: true },
    );
    expect(state.pendingIssueRequest).toBeNull();
    expect(state.issues).toEqual([issue]);
    expect(state.issuesHasMore).toBe(true);
  });
});

describe("app overlays", () => {
  it("builds a content update from an edit draft and applies the response", () => {
    const draft = issueEditDraft({ ...issue, description: "Old body" });
    let state = openOverlay(
      { ...createAppState(), issues: [{ ...issue, description: "Old body" }] },
      {
        kind: "edit-issue",
        draft,
        focusedField: "title",
        editor: "fields",
        cursor: 0,
      },
    );

    expect(issueChangeForOverlay(state, state.issues[0]!)).toBeNull();
    if (state.overlay?.kind !== "edit-issue") throw new Error("edit overlay is missing");
    state = openOverlay(state, {
      ...state.overlay,
      draft: { ...state.overlay.draft, title: "  Edited issue  ", description: "## New body" },
    });
    expect(issueChangeForOverlay(state, state.issues[0]!)).toEqual({
      kind: "content",
      issueId: issue.id,
      title: "Edited issue",
      description: "## New body",
    });

    state = applyIssueUpdate(state, {
      id: issue.id,
      title: "Edited issue",
      description: "## New body",
      updatedAt: "2026-08-10T00:00:00Z",
      state: issue.state,
      cycle: issue.cycle,
      project: issue.project,
      assignee: issue.assignee,
      priority: issue.priority,
      labels: issue.labels,
      labelsComplete: true,
    });
    expect(state.issues[0]).toMatchObject({
      title: "Edited issue",
      description: "## New body",
      updatedAt: "2026-08-10T00:00:00Z",
    });
    expect(state.overlay).toBeNull();
  });

  it("replaces overlays exclusively and closes them after filter/group confirmation", () => {
    let state = openOverlay(createAppState(), { kind: "filter-field", selectedIndex: 0 });
    state = openOverlay(state, { kind: "group", selectedIndex: 0 });
    expect(state.overlay?.kind).toBe("group");
    state = moveOverlay(state, 1);
    expect(
      state.overlay && "selectedIndex" in state.overlay ? state.overlay.selectedIndex : null,
    ).toBe(1);
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
    const withOverlay = (overlay: Overlay): AppState =>
      openOverlay({ ...createAppState(), issues: [current] }, overlay);

    expect(issueChangeForOverlay(withOverlay(single("status", "todo")), current)).toBeNull();
    expect(issueChangeForOverlay(withOverlay(single("assignee", "__none__")), current)).toBeNull();
    expect(issueChangeForOverlay(withOverlay(single("priority", "1")), current)).toBeNull();
    expect(issueChangeForOverlay(withOverlay(single("cycle", "__none__")), current)).toBeNull();
    expect(issueChangeForOverlay(withOverlay(single("project", "__none__")), current)).toBeNull();
    expect(
      issueChangeForOverlay(
        withOverlay({
          kind: "labels",
          issueId: current.id,
          options: [labelA, labelB],
          selectedIndex: 0,
          selectedIds: ["label-b", "label-a"],
        }),
        current,
      ),
    ).toBeNull();
    expect(issueChangeForOverlay(withOverlay(single("status", "started")), current)).toEqual({
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

describe("create drafts", () => {
  it("builds create payloads and inserts created records into state", () => {
    const draft = emptyIssueCreateDraft(team.id);
    draft.title = "New issue";
    draft.description = "## Body";
    draft.priority = 2;
    draft.labelIds = ["label-1"];
    expect(issueCreateInputFromDraft(draft)).toMatchObject({
      teamId: team.id,
      title: "New issue",
      description: "## Body",
      priority: 2,
      labelIds: ["label-1"],
    });

    let state = selectActiveTeam({ ...createAppState(), teams: [team] }, team.id, "teams");
    const createdIssue = { ...issue, id: "issue-2", identifier: "TEAM-2", title: "New issue" };
    state = applyCreatedIssue(state, createdIssue);
    expect(state.issues[0]?.id).toBe("issue-2");
    expect(state.selectedIssueId).toBe("issue-2");
    expect(state.overlay).toBeNull();

    const projectDraft = emptyProjectCreateDraft(team.id);
    projectDraft.name = "Ops";
    projectDraft.content = "# md";
    expect(projectCreateInputFromDraft(projectDraft)).toEqual({
      name: "Ops",
      description: "",
      content: "# md",
      teamIds: [team.id],
      leadId: null,
    });

    const project = {
      id: "project-1",
      name: "Ops",
      slugId: "ops",
      description: "",
      url: "https://example.invalid/ops",
      progress: 0,
      health: null,
      startDate: null,
      targetDate: null,
      status: { id: "planned", name: "Planned", type: "planned", color: "#fff" },
      lead: null,
      teams: [team],
    };
    state = selectActiveTeam({ ...state, projects: [] }, team.id, "projects");
    state = applyCreatedProject(state, project);
    expect(state.projects[0]?.id).toBe("project-1");
    expect(state.catalogIndexes.projects).toBe(0);
  });

  it("moves create-issue form focus across fields", () => {
    let state = openOverlay(createAppState(), {
      kind: "create-issue",
      draft: emptyIssueCreateDraft(team.id),
      focusedField: "title",
      editor: "fields",
      cursor: 0,
    });
    state = moveOverlay(state, 1);
    expect(state.overlay).toMatchObject({ kind: "create-issue", focusedField: "description" });
    state = moveOverlay(state, 20);
    expect(state.overlay).toMatchObject({ kind: "create-issue", focusedField: "submit" });
  });

  it("moves edit-issue form focus across title, description, and save", () => {
    let state = openOverlay(createAppState(), {
      kind: "edit-issue",
      draft: issueEditDraft(issue),
      focusedField: "title",
      editor: "fields",
      cursor: 0,
    });
    state = moveOverlay(state, 1);
    expect(state.overlay).toMatchObject({ kind: "edit-issue", focusedField: "description" });
    state = moveOverlay(state, 20);
    expect(state.overlay).toMatchObject({ kind: "edit-issue", focusedField: "submit" });
  });
});

describe("overlay search", () => {
  const options = [
    { id: "p1", label: "REST API migration" },
    { id: "p2", label: "Zombie offer handling" },
    { id: "p3", label: "REST API cleanup" },
  ];

  function projectPicker(): AppState {
    return openOverlay(createAppState(), {
      kind: "create-choice",
      target: "issue",
      field: "project",
      draft: emptyIssueCreateDraft(team.id),
      options,
      selectedIndex: 0,
    });
  }

  it("filters picker options and resolves the selection from the filtered list", () => {
    let state = startOverlaySearch(projectPicker());
    expect(state.overlaySearch.active).toBe(true);

    state = setOverlayQuery(state, "rest");
    expect(visibleOverlayOptions(state).map((option) => option.id)).toEqual(["p1", "p3"]);

    state = moveOverlay(state, 1);
    expect(selectedOverlayOption(state)?.id).toBe("p3");

    state = cancelOverlaySearch(state);
    expect(state.overlaySearch).toEqual({ active: false, query: "" });
    expect(visibleOverlayOptions(state)).toHaveLength(3);
    expect(selectedOverlayOption(state)?.id).toBe("p1");
  });

  it("clamps the highlight when the filter shrinks the list", () => {
    let state = moveOverlay(startOverlaySearch(projectPicker()), 2);
    expect(selectedOverlayOption(state)?.id).toBe("p3");

    state = setOverlayQuery(state, "zombie");
    expect(visibleOverlayOptions(state)).toHaveLength(1);
    expect(selectedOverlayOption(state)?.id).toBe("p2");
  });

  it("toggles the label under the filtered highlight", () => {
    const backend = { id: "label-b", name: "Backend", color: "#fff", team: null };
    const frontend = { id: "label-f", name: "Frontend", color: "#fff", team: null };
    let state = openOverlay(createAppState(), {
      kind: "create-labels",
      draft: emptyIssueCreateDraft(team.id),
      options: [backend, frontend],
      selectedIndex: 0,
      selectedIds: [],
    });

    state = setOverlayQuery(startOverlaySearch(state), "front");
    expect(visibleOverlayLabels(state).map((label) => label.id)).toEqual(["label-f"]);

    state = toggleSelectedLabel(state);
    expect(state.overlay).toMatchObject({ selectedIds: ["label-f"] });
  });

  it("resets the filter when a different overlay opens", () => {
    const state = setOverlayQuery(startOverlaySearch(projectPicker()), "rest");
    const reopened = openOverlay(state, { kind: "group", selectedIndex: 0 });
    expect(reopened.overlaySearch).toEqual({ active: false, query: "" });
  });
});
