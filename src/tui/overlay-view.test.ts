import { expect, it } from "vite-plus/test";

import {
  createAppState,
  openOverlay,
  setOverlayQuery,
  startOverlaySearch,
  type AppState,
  type IssueCreateDraft,
  type Overlay,
} from "./app-state";
import { overlayText, overlayTitle } from "./overlay-view";

const draft: IssueCreateDraft = {
  teamId: "team-1",
  title: "New issue",
  description: "line one\nline two",
  stateId: null,
  stateLabel: "Team default",
  assigneeId: null,
  assigneeLabel: "Unassigned",
  priority: 2,
  cycleId: null,
  cycleLabel: "Unassigned",
  projectId: null,
  projectLabel: "Unassigned",
  labelIds: [],
  labelSummary: "None",
};

function withOverlay(overlay: Overlay): AppState {
  return openOverlay(createAppState(), overlay);
}

it("names every overlay", () => {
  const cases: [Overlay, string][] = [
    [{ kind: "team-context", destination: "teams", options: [], selectedIndex: 0 }, "Choose Team"],
    [{ kind: "filter-field", selectedIndex: 0 }, "Choose Filter"],
    [
      { kind: "filter-value", dimension: "status", options: [], selectedIndex: 0 },
      "Filter by Status",
    ],
    [{ kind: "group", selectedIndex: 0 }, "Group Issues"],
    [
      { kind: "single-choice", action: "priority", issueId: "i", options: [], selectedIndex: 0 },
      "Change Priority",
    ],
    [
      { kind: "labels", issueId: "i", options: [], selectedIndex: 0, selectedIds: [] },
      "Change Labels",
    ],
    [
      { kind: "create-issue", draft, focusedField: "title", editor: "fields", cursor: 0 },
      "Create Issue",
    ],
    [
      { kind: "create-issue", draft, focusedField: "title", editor: "title", cursor: 0 },
      "Create Issue · title",
    ],
    [
      {
        kind: "create-choice",
        target: "issue",
        field: "cycle",
        draft,
        options: [],
        selectedIndex: 0,
      },
      "Set Cycle",
    ],
    [
      { kind: "create-labels", draft, options: [], selectedIndex: 0, selectedIds: [] },
      "Set Labels",
    ],
  ];
  for (const [overlay, title] of cases) expect(overlayTitle(overlay)).toBe(title);
});

it("renders single-choice options with the filter applied and the highlight marker", () => {
  const overlay: Overlay = {
    kind: "single-choice",
    action: "assignee",
    issueId: "i",
    options: [
      { id: "a", label: "Aiko Takahashi" },
      { id: "b", label: "Ren Sato" },
    ],
    selectedIndex: 0,
  };
  let state = withOverlay(overlay);
  expect(overlayText(state, overlay)).toBe("› Aiko Takahashi\n  Ren Sato");
  state = setOverlayQuery(startOverlaySearch(state), "ren");
  const filtered = overlayText(state, state.overlay!);
  expect(filtered).toContain("Filter: ren█");
  expect(filtered).toContain("› Ren Sato");
  expect(filtered).not.toContain("Aiko");
});

it("marks toggled labels and reports an empty filter result", () => {
  const label = (id: string, name: string) => ({ id, name, color: "#fff", team: null });
  const overlay: Overlay = {
    kind: "labels",
    issueId: "i",
    options: [label("l1", "Bug"), label("l2", "Perf")],
    selectedIndex: 1,
    selectedIds: ["l1"],
  };
  const state = withOverlay(overlay);
  expect(overlayText(state, overlay)).toBe("  [x] Bug\n› [ ] Perf");
  const searched = setOverlayQuery(startOverlaySearch(state), "zzz");
  expect(overlayText(searched, searched.overlay!)).toContain("No labels match the filter.");
});

it("renders the create-issue field list and the caret inside an editor", () => {
  const fields: Overlay = {
    kind: "create-issue",
    draft,
    focusedField: "priority",
    editor: "fields",
    cursor: 0,
  };
  const text = overlayText(withOverlay(fields), fields);
  expect(text).toContain("› Priority: High");
  expect(text).toContain("  Title: New issue");
  expect(text).toContain("Description: line one");

  const editor: Overlay = { ...fields, editor: "title", cursor: 3 };
  const editorText = overlayText(withOverlay(editor), editor);
  expect(editorText).toContain("Title");
  expect(editorText.split("\n")[2]).toContain("New issue".slice(0, 3));
});
