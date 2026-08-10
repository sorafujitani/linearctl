import { expect, it } from "vite-plus/test";

import {
  authStatusJson,
  authStatusText,
  cycleListText,
  issueCreatedText,
  issueListJson,
  issueListText,
  issueUpdatedText,
  issueViewJson,
  issueViewText,
  projectListText,
  teamListText,
} from "./output";
import type { Cycle, Issue, Project, UpdatedIssue } from "../core/domain";

const team = { id: "team-1", name: "Engineering", key: "ENG" };
const issue: Issue = {
  id: "issue-1",
  identifier: "ENG-1",
  title: "Build CLI",
  description: null,
  priority: 2,
  priorityLabel: "High",
  estimate: null,
  assignee: { id: "user-1", name: "Sora" },
  labels: [{ id: "label-1", name: "Backend", color: "#123456", team: null }],
  labelsComplete: true,
  url: "https://linear.app/example/issue/ENG-1",
  updatedAt: "2026-08-06T00:00:00.000Z",
  state: { id: "state-1", name: "In Progress", type: "started", color: "#fff", position: 2 },
  team,
  cycle: null,
  project: null,
};
const status = {
  viewer: { id: "viewer-1", name: "Sora", email: "sora@example.invalid" },
  workspace: { id: "org-1", name: "Example", urlKey: "sample-workspace" },
};

it("formats auth status as text and JSON", () => {
  expect(authStatusText(status, "real")).toContain("Authentication: OK");
  expect(authStatusText(status, "mock")).toContain("Authentication: MOCK");
  const parsed: unknown = JSON.parse(authStatusJson(status, "mock"));
  expect(parsed).toEqual({ mode: "mock", viewer: status.viewer, workspace: status.workspace });
});

it("formats an issue list with aligned identifiers and a truncation notice", () => {
  const long = { ...issue, id: "issue-2", identifier: "ENG-1234", assignee: null };
  const text = issueListText({ issues: [issue, long], hasMore: true });
  expect(text).toContain("ENG-1     [In Progress] Build CLI  (Sora)");
  expect(text).toContain("ENG-1234  [In Progress] Build CLI");
  expect(text).toContain("more issues exist on the server");
  expect(issueListText({ issues: [], hasMore: false })).toBe("No issues in this view.\n");
});

it("serializes the issue list as stable JSON", () => {
  const parsed = JSON.parse(issueListJson({ issues: [issue], hasMore: false })) as {
    issues: Record<string, unknown>[];
    hasMore: boolean;
  };
  expect(parsed.hasMore).toBe(false);
  expect(parsed.issues[0]).toMatchObject({
    identifier: "ENG-1",
    state: "In Progress",
    assignee: "Sora",
    labels: ["Backend"],
    team: "ENG",
    cycle: null,
    project: null,
  });
});

it("formats an issue view with metadata, description, and comments", () => {
  const detailed: Issue = {
    ...issue,
    description: "Body text",
    cycle: { id: "cycle-1", number: 8, name: null },
    project: { id: "project-1", name: "Launch", slugId: "launch" },
  };
  const text = issueViewText(detailed, {
    comments: [{ id: "c1", body: "First", createdAt: "2026-08-01T00:00:00.000Z", author: null }],
    hasMore: true,
  });
  expect(text).toContain("ENG-1  Build CLI");
  expect(text).toContain("Cycle: Cycle 8");
  expect(text).toContain("Project: Launch");
  expect(text).toContain("Body text");
  expect(text).toContain("--- (bot) at 2026-08-01T00:00:00.000Z");
  expect(text).toContain("older comments exist");

  const parsed = JSON.parse(issueViewJson(detailed, { comments: [], hasMore: false })) as Record<
    string,
    unknown
  >;
  expect(parsed["identifier"]).toBe("ENG-1");
  expect(parsed["comments"]).toEqual([]);
});

it("formats team, project, and cycle listings", () => {
  expect(teamListText([issue.team, { id: "t2", name: "Platform", key: "PLATFORM" }])).toBe(
    "ENG       Engineering\nPLATFORM  Platform\n",
  );
  expect(teamListText([])).toBe("No teams found.\n");

  const project: Project = {
    id: "project-1",
    name: "Launch",
    slugId: "launch",
    description: "d",
    url: "https://linear.app/example/project/launch",
    progress: 0.5,
    health: null,
    startDate: null,
    targetDate: null,
    status: { id: "s", name: "In Progress", type: "started", color: "#fff" },
    lead: { id: "user-1", name: "Sora" },
    teams: [issue.team],
  };
  const projectText = projectListText({ projects: [project], hasMore: true });
  expect(projectText).toContain("Launch  [In Progress] 50%  teams: ENG  (lead: Sora)");
  expect(projectText).toContain("more projects exist");
  expect(projectListText({ projects: [], hasMore: false })).toBe("No active projects.\n");

  const cycle: Cycle = {
    id: "cycle-1",
    number: 8,
    name: "Sprint 8",
    startsAt: "2026-08-03T00:00:00.000Z",
    endsAt: "2026-08-16T00:00:00.000Z",
    progress: 0.25,
    isActive: true,
    team: issue.team,
  };
  expect(cycleListText([cycle])).toBe("#8  Sprint 8  2026-08-03 → 2026-08-16  25%  (active)\n");
  expect(cycleListText([])).toBe("No cycles found for this team.\n");
});

it("formats create and update results", () => {
  expect(issueCreatedText(issue)).toBe(
    "Created ENG-1: Build CLI\nhttps://linear.app/example/issue/ENG-1\n",
  );
  const updated: UpdatedIssue = {
    id: "issue-1",
    title: "Build CLI",
    description: null,
    updatedAt: "2026-08-10T00:00:00.000Z",
    state: issue.state,
    cycle: null,
    project: null,
    assignee: null,
    priority: 0,
    labels: [],
    labelsComplete: true,
  };
  const text = issueUpdatedText("ENG-1", updated);
  expect(text).toContain("Updated ENG-1: Build CLI");
  expect(text).toContain("State: In Progress");
  expect(text).toContain("Assignee: -");
  expect(text).toContain("Priority: No priority");
  expect(text).toContain("Labels: -");
});
