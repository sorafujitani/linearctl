import { describe, expect, it } from "vite-plus/test";

import { MockLinearClient } from "../core/mock-client";
import { buildCreateInput, buildIssueChanges, parsePriority } from "./mutate";

const client = new MockLinearClient();

async function appTeam() {
  const teams = await client.getTeams();
  const team = teams.find((candidate) => candidate.key === "APP");
  if (team === undefined) throw new Error("APP team missing from the mock fixture");
  return team;
}

describe("parsePriority", () => {
  it("accepts numbers, labels, and none", () => {
    expect(parsePriority("0")).toBe(0);
    expect(parsePriority("4")).toBe(4);
    expect(parsePriority("Urgent")).toBe(1);
    expect(parsePriority("high")).toBe(2);
    expect(parsePriority("none")).toBe(0);
  });

  it("rejects out-of-range and unknown values", () => {
    expect(() => parsePriority("5")).toThrow("Invalid priority");
    expect(() => parsePriority("critical")).toThrow("Invalid priority");
  });
});

describe("buildCreateInput", () => {
  it("resolves state, assignee, labels, and project names against the team", async () => {
    const team = await appTeam();
    const input = await buildCreateInput(client, team, {
      title: "New issue",
      description: "Body",
      state: "in progress",
      assignee: "Aiko Takahashi",
      priority: "high",
      label: "Bug, Mobile",
      cycle: "current",
      project: "Mobile Experience Renewal",
    });
    expect(input.teamId).toBe(team.id);
    expect(input.title).toBe("New issue");
    expect(input.priority).toBe(2);
    expect(input.stateId).not.toBeNull();
    expect(input.assigneeId).toBe("mock-user-aiko");
    expect(input.labelIds).toHaveLength(2);
    expect(input.cycleId).not.toBeNull();
    expect(input.projectId).not.toBeNull();
    const created = await client.createIssue(input);
    expect(created.state.name).toBe("In Progress");
    expect(created.labels.map((label) => label.name).sort()).toEqual(["Bug", "Mobile"]);
  });

  it("defaults optional fields when only the title is given", async () => {
    const team = await appTeam();
    const input = await buildCreateInput(client, team, { title: "Bare" });
    expect(input).toMatchObject({
      title: "Bare",
      description: "",
      stateId: null,
      assigneeId: null,
      priority: 0,
      cycleId: null,
      projectId: null,
      labelIds: [],
    });
  });

  it("rejects names that do not resolve within the team", async () => {
    const team = await appTeam();
    await expect(
      buildCreateInput(client, team, { title: "x", state: "Nonexistent" }),
    ).rejects.toThrow("State in team APP not found");
    await expect(
      buildCreateInput(client, team, { title: "x", assignee: "Ren Sato" }),
    ).rejects.toThrow("Member of team APP not found");
    await expect(buildCreateInput(client, team, { title: "x", cycle: "999" })).rejects.toThrow(
      "Cycle #999 not found",
    );
  });
});

describe("buildIssueChanges", () => {
  it("sends only the given content field so the other cannot be overwritten", async () => {
    const issue = await client.getIssue("APP-101");
    expect(await buildIssueChanges(client, issue, { title: "Renamed" })).toEqual([
      { kind: "title", issueId: issue.id, title: "Renamed" },
    ]);
    expect(await buildIssueChanges(client, issue, { description: "New body" })).toEqual([
      { kind: "description", issueId: issue.id, description: "New body" },
    ]);
    expect(
      await buildIssueChanges(client, issue, { title: "Renamed", description: "New body" }),
    ).toEqual([{ kind: "content", issueId: issue.id, title: "Renamed", description: "New body" }]);
  });

  it("builds one bounded change per field", async () => {
    const issue = await client.getIssue("APP-101");
    const changes = await buildIssueChanges(client, issue, {
      state: "Done",
      assignee: "none",
      priority: "low",
      cycle: "none",
      project: "none",
      label: "none",
    });
    expect(changes.map((change) => change.kind)).toEqual([
      "status",
      "assignee",
      "priority",
      "cycle",
      "project",
      "labels",
    ]);
    expect(changes).toContainEqual({ kind: "assignee", issueId: issue.id, assigneeId: null });
    expect(changes).toContainEqual({ kind: "priority", issueId: issue.id, priority: 4 });
    expect(changes).toContainEqual({ kind: "labels", issueId: issue.id, labelIds: [] });
  });

  it("rejects an empty --label value instead of clearing every label", async () => {
    const issue = await client.getIssue("APP-101");
    await expect(buildIssueChanges(client, issue, { label: "" })).rejects.toThrow(
      '--label requires label names, or "none" to clear',
    );
    await expect(buildIssueChanges(client, issue, { label: " , " })).rejects.toThrow(
      '--label requires label names, or "none" to clear',
    );
  });

  it("rejects labels owned by another team", async () => {
    const issue = await client.getIssue("APP-101");
    await expect(buildIssueChanges(client, issue, { label: "Infrastructure" })).rejects.toThrow(
      "Label for team APP not found",
    );
  });

  it("rejects ambiguous names instead of picking the first match", async () => {
    class DuplicateMemberClient extends MockLinearClient {
      override async getTeamMembers() {
        return [
          { id: "mock-user-a", name: "Yuki Tanaka" },
          { id: "mock-user-b", name: "Yuki Tanaka" },
        ];
      }
    }
    const duplicated = new DuplicateMemberClient();
    const issue = await duplicated.getIssue("APP-101");
    await expect(buildIssueChanges(duplicated, issue, { assignee: "Yuki Tanaka" })).rejects.toThrow(
      "is ambiguous",
    );
  });

  it("refuses to replace labels when the label read was incomplete", async () => {
    const issue = await client.getIssue("APP-101");
    await expect(
      buildIssueChanges(client, { ...issue, labelsComplete: false }, { label: "Bug" }),
    ).rejects.toThrow("unseen labels");
  });
});
