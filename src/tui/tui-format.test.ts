import { expect, it } from "vite-plus/test";

import { createAppState, type AppState } from "./app-state";
import type { Issue, Project } from "../core/domain";
import { catalogDetailText, commentsText, issueDetailText, scopeTitle } from "./tui-format";

const team = { id: "team-1", name: "Engineering", key: "ENG" };
const issue: Issue = {
  id: "issue-1",
  identifier: "ENG-1",
  title: "Build CLI",
  description: "Body text",
  priority: 2,
  priorityLabel: "High",
  estimate: 3,
  assignee: { id: "u1", name: "Sora" },
  labels: [{ id: "l1", name: "Backend", color: "#fff", team: null }],
  labelsComplete: true,
  url: "https://example.invalid/ENG-1",
  updatedAt: "2026-08-06T00:00:00Z",
  state: { id: "s1", name: "In Progress", type: "started", color: "#fff", position: 2 },
  team,
  cycle: { id: "c1", number: 24, name: "Summer" },
  project: { id: "p1", name: "Launch", slugId: "launch" },
};
const project: Project = {
  id: "p1",
  name: "Launch",
  slugId: "launch",
  description: "Ship it",
  url: "https://example.invalid/project",
  progress: 0.25,
  health: null,
  startDate: null,
  targetDate: null,
  status: { id: "st", name: "In Progress", type: "started", color: "#fff" },
  lead: null,
  teams: [team],
};

function state(overrides: Partial<AppState>): AppState {
  return { ...createAppState(), ...overrides };
}

it("titles every issue scope with the owning team or catalog name", () => {
  const base = state({ teams: [team], projects: [project] });
  expect(scopeTitle({ kind: "assigned-to-me" }, base)).toBe("My Issues");
  expect(scopeTitle({ kind: "assigned-to-me", teamId: team.id }, base)).toBe("ENG My Issues");
  expect(scopeTitle({ kind: "team", teamId: team.id }, base)).toBe("ENG Team Issues");
  expect(scopeTitle({ kind: "team", teamId: "unknown" }, base)).toBe("Team Issues");
  expect(scopeTitle({ kind: "current-cycle", teamId: team.id }, state({ issues: [issue] }))).toBe(
    "Summer",
  );
  expect(scopeTitle({ kind: "current-cycle", teamId: team.id }, base)).toBe("Current Cycle");
  expect(scopeTitle({ kind: "project", projectId: project.id }, base)).toBe("Launch");
});

it("renders the issue detail with every field and a fallback for no selection", () => {
  const text = issueDetailText(issue);
  expect(text).toContain("ENG-1  Build CLI");
  expect(text).toContain("Status:   In Progress");
  expect(text).toContain("Cycle:    #24 Summer");
  expect(text).toContain("Labels:   Backend");
  expect(text).toContain("Body text");
  expect(issueDetailText(undefined)).toBe("Select an issue.");
  expect(issueDetailText({ ...issue, description: "  " })).toContain("No description.");
});

it("renders the project detail with progress and drill-in hint", () => {
  const text = catalogDetailText(project);
  expect(text).toContain("Progress: 25%");
  expect(text).toContain("Health: -");
  expect(text).toContain("Press Enter to load this project's issues.");
  expect(catalogDetailText(undefined)).toBe("Select an item.");
});

it("formats comments with authors, bot fallback, and the truncation notice", () => {
  const page = {
    comments: [
      { id: "c1", body: "First", createdAt: "2026-08-05T00:00:00Z", author: "Aiko" },
      { id: "c2", body: "Second", createdAt: "2026-08-06T00:00:00Z", author: null },
    ],
    hasMore: true,
  };
  const text = commentsText(issue, page);
  expect(text).toContain("Aiko ·");
  expect(text).toContain("(bot) ·");
  expect(text).toContain("First");
  expect(text).toContain("older comments exist on the server");
  expect(commentsText(issue, { comments: [], hasMore: false })).toContain(
    "No comments on this issue.",
  );
});
