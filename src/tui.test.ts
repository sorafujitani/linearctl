import { expect, it } from "vite-plus/test";

import { createAppState, selectActiveTeam, setGroup } from "./app-state";
import type { Cycle, Issue, Project, Team } from "./domain";
import {
  catalogListText,
  issueListText,
  panelWidths,
  selectedIssueUrl,
  truncateToWidth,
} from "./tui";

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

it("renders grouped issues with distinct headers, indentation, and spacing", () => {
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
      "",
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

it("derives stable panel widths only from the terminal width", () => {
  expect(panelWidths(80)).toEqual({ list: 33, detail: 46 });
  expect(panelWidths(120)).toEqual({ list: 49, detail: 70 });
  expect(panelWidths(120)).toEqual(panelWidths(120));
});

it("returns the selected issue URL only from an issue browser", () => {
  const selected = issue("1", "GROW-301", "Launch the landing page test", growth);
  const issueState = {
    ...createAppState(),
    issues: [selected],
    selectedIssueId: selected.id,
  };
  expect(selectedIssueUrl(issueState)).toBe("https://example.invalid");
  expect(selectedIssueUrl({ ...issueState, selectedIssueId: null })).toBeNull();
  expect(
    selectedIssueUrl({
      ...issueState,
      screen: { kind: "catalog", catalog: "cycles" },
    }),
  ).toBeNull();
});

it("renders only cycles and projects from the active team", () => {
  const cycle = (id: string, team: Team): Cycle => ({
    id,
    number: 24,
    name: "August",
    startsAt: "2026-08-01T00:00:00Z",
    endsAt: "2026-08-14T00:00:00Z",
    progress: 0.5,
    isActive: true,
    team,
  });
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
      cycles: [cycle("growth-cycle", growth), cycle("app-cycle", app)],
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
  expect(catalogListText({ ...state, screen: { kind: "catalog", catalog: "cycles" } }, 100)).toBe(
    "› #24 August",
  );
});
