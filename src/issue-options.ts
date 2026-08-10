import type { SelectOption } from "./app-state";
import { PRIORITY_LABELS, type Cycle, type Issue } from "./domain";
import { NONE_VALUE, type IssueDimension } from "./issue-list";
import { unreachable } from "./unreachable";

export const CLEAR_VALUE = "__clear__";

export const PRIORITIES: SelectOption[] = PRIORITY_LABELS.map((label, priority) => ({
  id: String(priority),
  label,
}));

export function uniqueOptions(options: readonly SelectOption[]): SelectOption[] {
  return [...new Map(options.map((option) => [option.id, option])).values()];
}

/** Preselect helper: options plus a leading "none" row, with the current value highlighted. */
export function optionsWithNone(
  options: readonly SelectOption[],
  currentId: string | null,
  noneLabel = "Unassigned",
): { options: SelectOption[]; selectedIndex: number } {
  const all = [{ id: NONE_VALUE, label: noneLabel }, ...options];
  return {
    options: all,
    selectedIndex: Math.max(
      0,
      all.findIndex((option) => option.id === (currentId ?? NONE_VALUE)),
    ),
  };
}

/**
 * Keeps the currently assigned value pickable even when the bounded read
 * window missed it; otherwise the highlight silently lands on "Unassigned"
 * and Enter clears the relation.
 */
export function ensureOption(
  options: SelectOption[],
  current: SelectOption | null,
): SelectOption[] {
  if (current === null || options.some((option) => option.id === current.id)) return options;
  return [current, ...options];
}

export function cycleOptions(cycles: readonly Cycle[]): SelectOption[] {
  return cycles.map((cycle) => ({
    id: cycle.id,
    label: `#${cycle.number} ${cycle.name ?? "Untitled"}${cycle.isActive ? " (active)" : ""}`,
  }));
}

export function issueFilterOptions(
  issues: readonly Issue[],
  dimension: IssueDimension,
): SelectOption[] {
  const clear = { id: CLEAR_VALUE, label: "Clear this filter" };
  switch (dimension) {
    case "status":
      return [
        clear,
        ...uniqueOptions(issues.map((issue) => ({ id: issue.state.id, label: issue.state.name }))),
      ];
    case "assignee":
      return [
        clear,
        { id: NONE_VALUE, label: "Unassigned" },
        ...uniqueOptions(
          issues.flatMap((issue) =>
            issue.assignee === null ? [] : [{ id: issue.assignee.id, label: issue.assignee.name }],
          ),
        ),
      ];
    case "priority":
      return [clear, ...PRIORITIES];
    case "team":
      return [
        clear,
        ...uniqueOptions(
          issues.map((issue) => ({
            id: issue.team.id,
            label: `${issue.team.key} · ${issue.team.name}`,
          })),
        ),
      ];
    case "cycle":
      return [
        clear,
        { id: NONE_VALUE, label: "Unassigned" },
        ...uniqueOptions(
          issues.flatMap((issue) =>
            issue.cycle === null
              ? []
              : [
                  {
                    id: issue.cycle.id,
                    label: `#${issue.cycle.number} ${issue.cycle.name ?? "Untitled"}`,
                  },
                ],
          ),
        ),
      ];
    case "project":
      return [
        clear,
        { id: NONE_VALUE, label: "Unassigned" },
        ...uniqueOptions(
          issues.flatMap((issue) =>
            issue.project === null ? [] : [{ id: issue.project.id, label: issue.project.name }],
          ),
        ),
      ];
    case "label":
      return [
        clear,
        { id: NONE_VALUE, label: "No labels" },
        ...uniqueOptions(
          issues.flatMap((issue) =>
            issue.labels.map((label) => ({ id: label.id, label: label.name })),
          ),
        ),
      ];
    default:
      return unreachable(dimension);
  }
}
