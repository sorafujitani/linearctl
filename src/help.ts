export interface HelpEntry {
  keys: string;
  action: string;
  description: string;
}

export const HELP_ENTRIES: readonly HelpEntry[] = [
  { keys: "1", action: "Open My Issues", description: "Issues assigned to you" },
  { keys: "2", action: "Open Teams", description: "Browse a team, then open its issues" },
  {
    keys: "3",
    action: "Open Cycles",
    description: "Browse each team's current cycle and its issues",
  },
  {
    keys: "4",
    action: "Open Projects",
    description: "Browse active projects and their issues",
  },
  { keys: "j / Down", action: "Move down", description: "Select the next item" },
  { keys: "k / Up", action: "Move up", description: "Select the previous item" },
  { keys: "Enter", action: "Open or confirm", description: "Open a scope or confirm a picker" },
  {
    keys: "Esc",
    action: "Go back or cancel",
    description: "Close the current view without writing",
  },
  { keys: "/", action: "Search issues", description: "Search issue text in the current scope" },
  {
    keys: "f",
    action: "Filter issues",
    description: "Filter by status, assignee, or other fields",
  },
  { keys: "g", action: "Group issues", description: "Group by status, assignee, or other fields" },
  { keys: "x", action: "Reset view", description: "Clear search, filters, and grouping" },
  { keys: "r", action: "Reload", description: "Reload the current catalog or issue scope" },
  { keys: "u", action: "Copy issue URL", description: "Copy the selected issue link" },
  { keys: "s", action: "Change status", description: "Update the selected issue status" },
  {
    keys: "a",
    action: "Change assignee",
    description: "Assign a member of the issue team, or unassign",
  },
  { keys: "y", action: "Change priority", description: "Update the selected issue priority" },
  {
    keys: "c",
    action: "Change cycle",
    description: "Assign or remove the issue team's current cycle",
  },
  {
    keys: "p",
    action: "Change project",
    description: "Choose an active project that includes the issue team",
  },
  {
    keys: "l",
    action: "Change labels",
    description: "Toggle workspace or issue-team labels, then confirm",
  },
  { keys: "?", action: "Open help", description: "Type to search this help window" },
  { keys: "q", action: "Quit", description: "Exit linearctl" },
  { keys: "Ctrl+C", action: "Quit immediately", description: "Exit from any screen" },
];

export function filterHelpEntries(entries: readonly HelpEntry[], query: string): HelpEntry[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (normalized.length === 0) return [...entries];
  return entries.filter((entry) =>
    [entry.keys, entry.action, entry.description].some((value) =>
      value.toLocaleLowerCase().includes(normalized),
    ),
  );
}

export function helpText(entries: readonly HelpEntry[], query: string): string {
  const filtered = filterHelpEntries(entries, query);
  if (filtered.length === 0) return "No matching commands.";
  return filtered
    .map(
      (entry) => `${entry.keys.padEnd(10)} ${entry.action}\n${" ".repeat(11)}${entry.description}`,
    )
    .join("\n\n");
}
