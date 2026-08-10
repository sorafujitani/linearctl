import { expect, it, vi } from "vite-plus/test";

import {
  beginIssueRequest,
  createAppState,
  moveSelection,
  selectActiveTeam,
  setGroup,
  setQuery,
} from "./app-state";
import type { Issue, Project, Team } from "./domain";
import type { KeyEvent } from "@opentui/core";

import { openSelectedItemUrl, selectedItemUrl } from "./item-url";
import { isCreateSubmit, isEditorConfirm } from "./key-intent";
import {
  catalogListText,
  issueListContent,
  issueListRows,
  issueListText,
  listScrollOffset,
  panelWidths,
  truncateToWidth,
} from "./tui-format";

const growth: Team = { id: "growth", key: "GROW", name: "Growth Operations" };
const app: Team = { id: "app", key: "APP", name: "Product Engineering" };

function issue(id: string, identifier: string, title: string, team: Team): Issue {
  return {
    id,
    identifier,
    title,
    description: null,
    priority: 2,
    priorityLabel: "High",
    estimate: null,
    assignee: null,
    labels: [],
    labelsComplete: true,
    url: "https://example.invalid",
    updatedAt: "2026-08-06T00:00:00Z",
    state: { id: "started", name: "Running", type: "started", color: "#fff", position: 1 },
    team,
    cycle: null,
    project: null,
  };
}

it("renders grouped issues with distinct headers and indentation", () => {
  const first = issue("1", "GROW-301", "Launch the landing page test", growth);
  const second = issue("2", "GROW-304", "Recalculate onboarding performance", growth);
  const third = issue("3", "APP-103", "Design the experiment API", app);
  const state = setGroup(
    { ...createAppState(), issues: [first, second, third], selectedIssueId: first.id },
    "team",
  );

  expect(issueListText(state, 100)).toBe(
    [
      "▾ GROW · Growth Operations · 2 issues",
      "  › [Running] Launch the landing page test",
      "    [Running] Recalculate onboarding performance",
      "▾ APP · Product Engineering · 1 issue",
      "    [Running] Design the experiment API",
    ].join("\n"),
  );
});

it("truncates mixed-width text only at the end", () => {
  const value = truncateToWidth(
    "[In Review] [marketing-backend] 満足度送信 - POST /v1/offers/:id/satisfaction",
    42,
  );

  expect(value).toBe("[In Review] [marketing-backend] 満足度送…");
  expect(value.indexOf("…")).toBe(value.length - 1);
});

it("keeps status visible in ungrouped rows", () => {
  const selected = issue("1", "GROW-301", "Launch the landing page test", growth);
  const state = { ...createAppState(), issues: [selected], selectedIssueId: selected.id };
  expect(issueListText(state, 100)).toBe("› GROW-301 [Running] Launch the landing page test");
});

it("keeps ungrouped issue rows dense like fzf", () => {
  const first = issue("1", "GROW-301", "Launch the landing page test", growth);
  const second = issue("2", "GROW-304", "Recalculate onboarding performance", growth);
  const state = {
    ...createAppState(),
    issues: [first, second],
    selectedIssueId: first.id,
  };

  expect(issueListText(state, 100)).toBe(
    [
      "› GROW-301 [Running] Launch the landing page test",
      "  GROW-304 [Running] Recalculate onboarding performance",
    ].join("\n"),
  );
});

it("marks and colors the selected issue row with the accent color", () => {
  const selected = issue("1", "GROW-301", "Launch the landing page test", growth);
  const other = issue("2", "GROW-304", "Recalculate onboarding performance", growth);
  const state = {
    ...createAppState(),
    issues: [selected, other],
    selectedIssueId: selected.id,
  };

  const rows = issueListRows(state, 100);
  expect(rows.map(({ selected: isSelected }) => isSelected)).toEqual([true, false]);

  const content = issueListContent(state, 100);
  expect(content.chunks[0]?.fg?.toInts()).toEqual([122, 162, 247, 255]);
  expect(content.chunks[1]?.fg?.toInts()).toEqual([192, 202, 245, 255]);
});

it("keeps the selected row inside the visible list viewport", () => {
  expect(listScrollOffset(0, 10, 4)).toBe(0);
  expect(listScrollOffset(0, 10, 12)).toBe(3);
  expect(listScrollOffset(8, 10, 4)).toBe(4);
  expect(listScrollOffset(8, 0, 20)).toBe(8);
  expect(listScrollOffset(8, 10, null)).toBe(0);
});

it("shows loading while an issue request is pending", () => {
  const state = beginIssueRequest(
    selectActiveTeam({ ...createAppState(), teams: [app] }, app.id, "cycles"),
    1,
  );

  expect(issueListText(state, 100)).toBe("Loading issues...");
});

it("shows a current-cycle empty state without a catalog", () => {
  const state = selectActiveTeam({ ...createAppState(), teams: [app] }, app.id, "cycles");

  expect(issueListText(state, 100)).toBe("No active issues in the current cycle.");
});

it("names the team scope in the My Issues empty state", () => {
  const state = selectActiveTeam({ ...createAppState(), teams: [app] }, app.id, "my-issues");

  expect(issueListText(state, 100)).toBe("No active issues are assigned to you in this team.");
});

it("distinguishes a loaded empty view from a filtered empty view", () => {
  const empty = selectActiveTeam({ ...createAppState(), teams: [app] }, app.id, "teams");
  expect(issueListText(empty, 100)).toBe("No issues in this view.");

  const selected = issue("1", "APP-103", "Design the experiment API", app);
  const filtered = setQuery(
    {
      ...createAppState(),
      issues: [selected],
      selectedIssueId: selected.id,
    },
    "does-not-match",
  );
  expect(issueListText(filtered, 100)).toBe("No issues match the current view.");
});

it("derives stable panel widths only from the terminal width", () => {
  expect(panelWidths(80)).toEqual({ list: 33, detail: 46 });
  expect(panelWidths(120)).toEqual({ list: 49, detail: 70 });
  expect(panelWidths(120)).toEqual(panelWidths(120));
});

it("returns the selected item URL for issues, projects, and cycles", () => {
  const selected = issue("1", "GROW-301", "Launch the landing page test", growth);
  selected.cycle = { id: "cycle-1", number: 18, name: "August Experiments" };
  const project: Project = {
    id: "project-1",
    name: "Growth project",
    slugId: "growth-project",
    description: "",
    url: "https://linear.app/sample-workspace/project/growth-project",
    progress: 0,
    health: null,
    startDate: null,
    targetDate: null,
    status: { id: "planned", name: "Planned", type: "planned", color: "#fff" },
    lead: null,
    teams: [growth],
  };
  const issueState = {
    ...createAppState(),
    teams: [growth],
    issues: [selected],
    selectedIssueId: selected.id,
    projects: [project],
    cycles: [
      {
        id: "cycle-1",
        number: 18,
        name: "August Experiments",
        startsAt: "2026-08-01T00:00:00.000Z",
        endsAt: "2026-08-14T00:00:00.000Z",
        progress: 0.5,
        isActive: true,
        team: growth,
      },
    ],
  };

  expect(selectedItemUrl(issueState, "sample-workspace")).toBe("https://example.invalid");
  expect(selectedItemUrl({ ...issueState, selectedIssueId: null }, "sample-workspace")).toBeNull();
  expect(
    selectedItemUrl(
      {
        ...issueState,
        selectedIssueId: null,
        screen: { kind: "catalog", catalog: "projects" },
        activeTeamId: growth.id,
        catalogIndexes: { projects: 0 },
      },
      "sample-workspace",
    ),
  ).toBe(project.url);
  expect(
    selectedItemUrl(
      {
        ...issueState,
        selectedIssueId: null,
        screen: {
          kind: "issue-browser",
          origin: "cycles",
          scope: { kind: "current-cycle", teamId: growth.id },
        },
      },
      "sample-workspace",
    ),
  ).toBe("https://linear.app/sample-workspace/team/GROW/cycle/18");
});

it("opens the selected item URL through an injected browser opener", async () => {
  const selected = issue("1", "GROW-301", "Launch the landing page test", growth);
  const openUrl = vi.fn(async () => undefined);
  const state = { ...createAppState(), issues: [selected], selectedIssueId: selected.id };

  await expect(openSelectedItemUrl(state, "sample-workspace", openUrl)).resolves.toBe(true);
  expect(openUrl).toHaveBeenCalledWith("https://example.invalid");
  await expect(
    openSelectedItemUrl({ ...state, selectedIssueId: null }, "sample-workspace", openUrl),
  ).resolves.toBe(false);
  expect(openUrl).toHaveBeenCalledTimes(1);
});

it("renders only projects from the active team", () => {
  const project = (id: string, name: string, teams: Team[]): Project => ({
    id,
    name,
    slugId: id,
    description: "",
    url: `https://example.invalid/${id}`,
    progress: 0,
    health: null,
    startDate: null,
    targetDate: null,
    status: { id: "planned", name: "Planned", type: "planned", color: "#fff" },
    lead: null,
    teams,
  });
  const state = selectActiveTeam(
    {
      ...createAppState(),
      teams: [growth, app],
      projects: [
        project("growth-project", "Growth project", [growth]),
        project("app-project", "App project", [app]),
        project("shared-project", "Shared project", [growth, app]),
      ],
    },
    app.id,
    "projects",
  );

  expect(catalogListText(state, 100)).toBe(
    ["› [Planned] App project", "  [Planned] Shared project"].join("\n"),
  );
});

it("filters projects by query and keeps selection on the visible list", () => {
  const project = (id: string, name: string, teams: Team[]): Project => ({
    id,
    name,
    slugId: id,
    description: id.includes("shared") ? "cross-team reliability work" : "",
    url: `https://example.invalid/${id}`,
    progress: 0,
    health: null,
    startDate: null,
    targetDate: null,
    status: { id: "planned", name: "Planned", type: "planned", color: "#fff" },
    lead: null,
    teams,
  });
  let state = selectActiveTeam(
    {
      ...createAppState(),
      teams: [growth, app],
      projects: [
        project("growth-project", "Growth project", [growth]),
        project("app-project", "App checkout rewrite", [app]),
        project("shared-project", "Shared reliability", [growth, app]),
      ],
    },
    app.id,
    "projects",
  );

  state = setQuery(state, "shared");
  expect(catalogListText(state, 100)).toBe("› [Planned] Shared reliability");
  expect(state.catalogIndexes.projects).toBe(0);

  state = setQuery(state, "missing");
  expect(catalogListText(state, 100)).toBe("No projects match the current view.");

  state = setQuery(state, "");
  state = moveSelection(state, 1);
  expect(catalogListText(state, 100)).toBe(
    ["  [Planned] App checkout rewrite", "› [Planned] Shared reliability"].join("\n"),
  );
});

it("treats only modifier+Enter and Ctrl+S as create submit", () => {
  const key = (init: Partial<KeyEvent>): KeyEvent => init as KeyEvent;

  expect(isCreateSubmit(key({ name: "return" }))).toBe(false);
  expect(isCreateSubmit(key({ name: "enter" }))).toBe(false);
  expect(isCreateSubmit(key({ name: "return", ctrl: true }))).toBe(true);
  expect(isCreateSubmit(key({ name: "return", super: true }))).toBe(true);
  expect(isCreateSubmit(key({ name: "s", ctrl: true }))).toBe(true);
  expect(isCreateSubmit(key({ name: "s" }))).toBe(false);
  expect(isCreateSubmit(key({ name: "escape", ctrl: true }))).toBe(false);
});

it("leaves a text editor on modifier+Enter instead of creating", () => {
  const key = (init: Partial<KeyEvent>): KeyEvent => init as KeyEvent;

  expect(isEditorConfirm(key({ name: "return", ctrl: true }))).toBe(true);
  expect(isEditorConfirm(key({ name: "return", super: true }))).toBe(true);
  expect(isEditorConfirm(key({ name: "s", ctrl: true }))).toBe(true);
  expect(isEditorConfirm(key({ name: "escape" }))).toBe(true);
  expect(isEditorConfirm(key({ name: "return" }))).toBe(false);
  expect(isEditorConfirm(key({ name: "a" }))).toBe(false);
});
