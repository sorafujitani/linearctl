import type { KeyEvent } from "@opentui/core";

import type { TopNav } from "./app-state";
import type { HelpEntry } from "./help-entry";
import { isSearchTrigger } from "./key-intent";

export type IssueActionKind = "status" | "assignee" | "priority" | "cycle" | "project" | "labels";

export type ListIntent =
  | { kind: "nav"; nav: TopNav }
  | { kind: "team-selector" }
  | { kind: "create" }
  | { kind: "edit" }
  | { kind: "quit" }
  | { kind: "move"; delta: -1 | 1 }
  | { kind: "activate" }
  | { kind: "back" }
  | { kind: "search" }
  | { kind: "filter" }
  | { kind: "group" }
  | { kind: "reset" }
  | { kind: "reload" }
  | { kind: "scroll-detail"; delta: -5 | 5 }
  | { kind: "open-url" }
  | { kind: "copy-url" }
  | { kind: "issue-action"; action: IssueActionKind }
  | { kind: "comments" }
  | { kind: "toggle-done" }
  | { kind: "help" };

interface ListBinding {
  /** key.name values this binding answers to. */
  readonly names: readonly string[];
  /** When true the binding only matches with Ctrl held; plain bindings ignore modifiers. */
  readonly ctrl?: true;
  readonly intent: ListIntent;
  /** Help window entry; null when another binding of the same pair documents it. */
  readonly help: HelpEntry | null;
}

/**
 * Single source for list-mode keys: matching, the help window, and the footer
 * consistency test all read this table. Order matters twice — earlier bindings
 * win when a Ctrl chord shares a letter with a plain key, and help entries
 * render in table order.
 */
export const LIST_BINDINGS: readonly ListBinding[] = [
  {
    names: ["1"],
    intent: { kind: "nav", nav: "my-issues" },
    help: { keys: "1", action: "Open My Issues", description: "Issues assigned to you" },
  },
  {
    names: ["2"],
    intent: { kind: "nav", nav: "teams" },
    help: { keys: "2", action: "Open Team Issues", description: "Issues in the active team" },
  },
  {
    names: ["3"],
    intent: { kind: "nav", nav: "cycles" },
    help: {
      keys: "3",
      action: "Open Current Cycle",
      description: "Open the active team's current-cycle issues",
    },
  },
  {
    names: ["4"],
    intent: { kind: "nav", nav: "projects" },
    help: {
      keys: "4",
      action: "Open Projects",
      description: "Browse the active team's projects and their issues",
    },
  },
  {
    names: ["t"],
    intent: { kind: "team-selector" },
    help: {
      keys: "t",
      action: "Change team",
      description: "Choose the team used by every main view",
    },
  },
  {
    names: ["down", "j"],
    intent: { kind: "move", delta: 1 },
    help: { keys: "j / Down", action: "Move down", description: "Select the next item" },
  },
  {
    names: ["up", "k"],
    intent: { kind: "move", delta: -1 },
    help: { keys: "k / Up", action: "Move up", description: "Select the previous item" },
  },
  {
    names: ["return", "enter"],
    intent: { kind: "activate" },
    help: {
      keys: "Enter",
      action: "Open or confirm",
      description: "Open a scope or confirm a picker",
    },
  },
  {
    names: ["escape"],
    intent: { kind: "back" },
    help: {
      keys: "Esc",
      action: "Go back or cancel",
      description: "Close the open picker or form, or leave a project's issue list",
    },
  },
  {
    names: ["/", "／"],
    intent: { kind: "search" },
    help: {
      keys: "/",
      action: "Search or filter",
      description: "Search the current list, or filter the options of an open picker",
    },
  },
  {
    names: ["f"],
    intent: { kind: "filter" },
    help: {
      keys: "f",
      action: "Filter issues",
      description: "Filter by status, assignee, or other fields",
    },
  },
  {
    names: ["g"],
    intent: { kind: "group" },
    help: {
      keys: "g",
      action: "Group issues",
      description: "Group by status, assignee, or other fields",
    },
  },
  {
    names: ["x"],
    intent: { kind: "reset" },
    help: { keys: "x", action: "Reset view", description: "Clear search, filters, and grouping" },
  },
  {
    names: ["n"],
    intent: { kind: "create" },
    help: {
      keys: "n",
      action: "Create issue or project",
      description: "Open the create form for issues, or a project in Projects",
    },
  },
  {
    names: ["e"],
    intent: { kind: "edit" },
    help: {
      keys: "e",
      action: "Edit issue",
      description: "Edit the selected issue title and Markdown description",
    },
  },
  {
    names: ["r"],
    intent: { kind: "reload" },
    help: { keys: "r", action: "Reload", description: "Reload the current catalog or issue scope" },
  },
  {
    names: ["d"],
    ctrl: true,
    intent: { kind: "scroll-detail", delta: 5 },
    help: {
      keys: "PgDn / Ctrl+D",
      action: "Scroll detail down",
      description: "Scroll the detail panel when a description is long",
    },
  },
  { names: ["pagedown"], intent: { kind: "scroll-detail", delta: 5 }, help: null },
  {
    names: ["u"],
    ctrl: true,
    intent: { kind: "scroll-detail", delta: -5 },
    help: {
      keys: "PgUp / Ctrl+U",
      action: "Scroll detail up",
      description: "Scroll the detail panel back toward the top",
    },
  },
  { names: ["pageup"], intent: { kind: "scroll-detail", delta: -5 }, help: null },
  {
    names: ["o"],
    intent: { kind: "open-url" },
    help: {
      keys: "o",
      action: "Open URL",
      description: "Open the selected issue, project, or cycle in your browser",
    },
  },
  {
    names: ["u"],
    intent: { kind: "copy-url" },
    help: {
      keys: "u",
      action: "Copy URL",
      description: "Copy the selected issue, project, or cycle link",
    },
  },
  {
    names: ["s"],
    intent: { kind: "issue-action", action: "status" },
    help: { keys: "s", action: "Change status", description: "Update the selected issue status" },
  },
  {
    names: ["a"],
    intent: { kind: "issue-action", action: "assignee" },
    help: {
      keys: "a",
      action: "Change assignee",
      description: "Assign a member of the issue team, or unassign",
    },
  },
  {
    names: ["y"],
    intent: { kind: "issue-action", action: "priority" },
    help: {
      keys: "y",
      action: "Change priority",
      description: "Update the selected issue priority",
    },
  },
  {
    names: ["c"],
    intent: { kind: "issue-action", action: "cycle" },
    help: {
      keys: "c",
      action: "Change cycle",
      description: "Assign one of the issue team's cycles, past or upcoming, or remove it",
    },
  },
  {
    names: ["v"],
    intent: { kind: "comments" },
    help: {
      keys: "v",
      action: "View comments",
      description: "Show the selected issue's comments in the detail panel",
    },
  },
  {
    names: ["d"],
    intent: { kind: "toggle-done" },
    help: {
      keys: "d",
      action: "Toggle done issues",
      description: "Include or hide completed and canceled issues",
    },
  },
  {
    names: ["p"],
    intent: { kind: "issue-action", action: "project" },
    help: {
      keys: "p",
      action: "Change project",
      description: "Choose an active project that includes the issue team",
    },
  },
  {
    names: ["l"],
    intent: { kind: "issue-action", action: "labels" },
    help: {
      keys: "l",
      action: "Change labels",
      description: "Toggle workspace or issue-team labels, then confirm",
    },
  },
  {
    names: ["?"],
    intent: { kind: "help" },
    help: { keys: "?", action: "Open help", description: "Type to search this help window" },
  },
  {
    names: ["q"],
    intent: { kind: "quit" },
    help: { keys: "q", action: "Quit", description: "Exit linearctl" },
  },
];

/** Help entries with no list-mode binding (handled before dispatch or in other modes). */
export const EXTRA_HELP_ENTRIES: readonly HelpEntry[] = [
  { keys: "Ctrl+C", action: "Quit immediately", description: "Exit from any screen" },
];

export function listIntent(key: KeyEvent): ListIntent | null {
  const binding = LIST_BINDINGS.find(
    (candidate) =>
      candidate.names.includes(key.name) && (candidate.ctrl === undefined || key.ctrl === true),
  );
  if (binding !== undefined) return binding.intent;
  return isSearchTrigger(key) ? { kind: "search" } : null;
}

// Both lines must survive an 80-column terminal; keys that do not fit go in ? help.
export const ISSUE_BROWSER_CONTROLS =
  "s/a/y/c/p/l change · e edit · n new · v comments · d done · / search · ? help";

export const CATALOG_CONTROLS =
  "Enter open · n new project · / search · o open · u copy · x reset · ? help";
