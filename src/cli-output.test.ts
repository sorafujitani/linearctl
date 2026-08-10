import { expect, it } from "vite-plus/test";

import { authStatusJson, authStatusText, issueListJson, issueListText } from "./cli-output";
import type { Issue } from "./domain";

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
