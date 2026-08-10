import {
  visibleOverlayLabels,
  visibleOverlayOptions,
  type AppState,
  type CreateIssueField,
  type CreateProjectField,
  type EditIssueField,
  type Overlay,
} from "./app-state";
import type { IssueChange } from "../core/domain";
import { ISSUE_DIMENSIONS, type IssueDimension, type IssueGroupDimension } from "./issue-list";
import { PRIORITIES } from "./issue-options";
import { withCaret } from "./text-input";
import { unreachable } from "../core/unreachable";

export const ISSUE_ACTION_LABELS: Record<
  Exclude<IssueChange["kind"], "content" | "title" | "description">,
  string
> = {
  status: "Status",
  assignee: "Assignee",
  priority: "Priority",
  cycle: "Cycle",
  project: "Project",
  labels: "Labels",
};

export const DIMENSION_LABELS: Record<IssueDimension, string> = {
  status: "Status",
  assignee: "Assignee",
  priority: "Priority",
  team: "Team",
  cycle: "Cycle",
  project: "Project",
  label: "Label",
};

function overlaySearchLine(state: AppState): string[] {
  const { active, query } = state.overlaySearch;
  if (!active && query.length === 0) return [];
  return [active ? `Filter: ${query}█` : `Filter: ${query}`, ""];
}

const SINGLE_LINE_EDITOR_HINT =
  "←/→ move · Home/End · Enter next field · Cmd/Ctrl+Enter confirm · Esc back";
const MULTILINE_EDITOR_HINT =
  "↑↓←→ move · Home/End · Enter newline · Cmd/Ctrl+Enter confirm field · Esc back";

function editorPanel(title: string, value: string, cursor: number, hint: string): string {
  return [title, "", withCaret(value, cursor), "", hint].join("\n");
}

function previewLine(markdown: string): string {
  return markdown.trim().length === 0 ? "(empty markdown)" : markdown.split("\n")[0]!.slice(0, 48);
}

export function overlayText(state: AppState, overlay: Overlay): string {
  if (overlay.kind === "team-context") {
    if (overlay.options.length === 0) return "No teams are available in this workspace.";
    return optionListText(state, overlay.selectedIndex);
  }
  if (overlay.kind === "filter-field") {
    return ISSUE_DIMENSIONS.map(
      (dimension, index) =>
        `${index === overlay.selectedIndex ? "›" : " "} ${DIMENSION_LABELS[dimension]}`,
    ).join("\n");
  }
  if (overlay.kind === "group") {
    const groups: IssueGroupDimension[] = ["none", ...ISSUE_DIMENSIONS];
    return groups
      .map(
        (group, index) =>
          `${index === overlay.selectedIndex ? "›" : " "} ${group === "none" ? "None" : DIMENSION_LABELS[group]}`,
      )
      .join("\n");
  }
  if (overlay.kind === "labels" || overlay.kind === "create-labels") {
    const labels = visibleOverlayLabels(state);
    const rows =
      labels.length === 0
        ? ["No labels match the filter."]
        : labels.map(
            (label, index) =>
              `${index === overlay.selectedIndex ? "›" : " "} ${overlay.selectedIds.includes(label.id) ? "[x]" : "[ ]"} ${label.name}`,
          );
    return [...overlaySearchLine(state), ...rows].join("\n");
  }
  if (overlay.kind === "create-choice") {
    return optionListText(state, overlay.selectedIndex);
  }
  if (overlay.kind === "edit-issue") {
    if (overlay.editor === "title") {
      return editorPanel("Title", overlay.draft.title, overlay.cursor, SINGLE_LINE_EDITOR_HINT);
    }
    if (overlay.editor === "description") {
      return editorPanel(
        "Description (Markdown)",
        overlay.draft.description,
        overlay.cursor,
        MULTILINE_EDITOR_HINT,
      );
    }
    const mark = (field: EditIssueField) => (overlay.focusedField === field ? "›" : " ");
    return [
      `${mark("title")} Title: ${overlay.draft.title || "(required)"}`,
      `${mark("description")} Description: ${previewLine(overlay.draft.description)}`,
      `${mark("submit")} Save changes`,
      "",
      "j/k move · Enter edit/save · Cmd/Ctrl+Enter save · Esc cancel",
    ].join("\n");
  }
  if (overlay.kind === "create-issue") {
    if (overlay.editor === "title") {
      return editorPanel("Title", overlay.draft.title, overlay.cursor, SINGLE_LINE_EDITOR_HINT);
    }
    if (overlay.editor === "description") {
      return editorPanel(
        "Description (Markdown)",
        overlay.draft.description,
        overlay.cursor,
        MULTILINE_EDITOR_HINT,
      );
    }
    const mark = (field: CreateIssueField) => (overlay.focusedField === field ? "›" : " ");
    return [
      `${mark("title")} Title: ${overlay.draft.title || "(required)"}`,
      `${mark("description")} Description: ${previewLine(overlay.draft.description)}`,
      `${mark("status")} Status: ${overlay.draft.stateLabel}`,
      `${mark("assignee")} Assignee: ${overlay.draft.assigneeLabel}`,
      `${mark("priority")} Priority: ${PRIORITIES.find((item) => item.id === String(overlay.draft.priority))?.label ?? "No priority"}`,
      `${mark("cycle")} Cycle: ${overlay.draft.cycleLabel}`,
      `${mark("project")} Project: ${overlay.draft.projectLabel}`,
      `${mark("labels")} Labels: ${overlay.draft.labelSummary}`,
      `${mark("submit")} Create issue`,
      "",
      "j/k move · Enter edit/open · Cmd/Ctrl+Enter create · Esc cancel",
    ].join("\n");
  }
  if (overlay.kind === "create-project") {
    if (overlay.editor === "name") {
      return editorPanel("Name", overlay.draft.name, overlay.cursor, SINGLE_LINE_EDITOR_HINT);
    }
    if (overlay.editor === "description") {
      return editorPanel(
        "Summary (short plain text)",
        overlay.draft.description,
        overlay.cursor,
        SINGLE_LINE_EDITOR_HINT,
      );
    }
    if (overlay.editor === "content") {
      return editorPanel(
        "Content (Markdown)",
        overlay.draft.content,
        overlay.cursor,
        MULTILINE_EDITOR_HINT,
      );
    }
    const mark = (field: CreateProjectField) => (overlay.focusedField === field ? "›" : " ");
    return [
      `${mark("name")} Name: ${overlay.draft.name || "(required)"}`,
      `${mark("description")} Summary: ${overlay.draft.description || "(optional)"}`,
      `${mark("content")} Content: ${previewLine(overlay.draft.content)}`,
      `${mark("lead")} Lead: ${overlay.draft.leadLabel}`,
      `${mark("submit")} Create project`,
      "",
      "j/k move · Enter edit/open · Cmd/Ctrl+Enter create · Esc cancel",
    ].join("\n");
  }
  return optionListText(state, overlay.selectedIndex);
}

export function optionListText(state: AppState, selectedIndex: number): string {
  const options = visibleOverlayOptions(state);
  const rows =
    options.length === 0
      ? ["No options match the filter."]
      : options.map((option, index) => `${index === selectedIndex ? "›" : " "} ${option.label}`);
  return [...overlaySearchLine(state), ...rows].join("\n");
}

export function overlayTitle(overlay: Overlay): string {
  switch (overlay.kind) {
    case "team-context":
      return "Choose Team";
    case "filter-field":
      return "Choose Filter";
    case "filter-value":
      return `Filter by ${DIMENSION_LABELS[overlay.dimension]}`;
    case "group":
      return "Group Issues";
    case "labels":
      return "Change Labels";
    case "single-choice":
      return `Change ${ISSUE_ACTION_LABELS[overlay.action]}`;
    case "create-issue":
      return overlay.editor === "fields" ? "Create Issue" : `Create Issue · ${overlay.editor}`;
    case "edit-issue":
      return overlay.editor === "fields" ? "Edit Issue" : `Edit Issue · ${overlay.editor}`;
    case "create-project":
      return overlay.editor === "fields" ? "Create Project" : `Create Project · ${overlay.editor}`;
    case "create-choice":
      return `Set ${overlay.field[0]!.toUpperCase()}${overlay.field.slice(1)}`;
    case "create-labels":
      return "Set Labels";
    default:
      return unreachable(overlay);
  }
}
