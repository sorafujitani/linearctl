import { matchesSearch } from "./domain";
import type { HelpEntry } from "./help-entry";
import { EXTRA_HELP_ENTRIES, LIST_BINDINGS } from "./keymap";

export type { HelpEntry } from "./help-entry";

/** Derived from the keymap so the help window cannot drift from the actual bindings. */
export const HELP_ENTRIES: readonly HelpEntry[] = [
  ...LIST_BINDINGS.flatMap((binding) => (binding.help === null ? [] : [binding.help])),
  ...EXTRA_HELP_ENTRIES,
];

export function filterHelpEntries(entries: readonly HelpEntry[], query: string): HelpEntry[] {
  return entries.filter((entry) =>
    matchesSearch(query, [entry.keys, entry.action, entry.description]),
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
