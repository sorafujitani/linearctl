import { describe, expect, it } from "vite-plus/test";

import { filterHelpEntries, HELP_ENTRIES, helpText } from "./help";

describe("searchable help", () => {
  it("returns every command for an empty query without sharing the input array", () => {
    const result = filterHelpEntries(HELP_ENTRIES, "");
    expect(result).toEqual(HELP_ENTRIES);
    expect(result).not.toBe(HELP_ENTRIES);
  });

  it("searches keys, actions, and descriptions case-insensitively", () => {
    expect(filterHelpEntries(HELP_ENTRIES, "ASSIGNEE").map((entry) => entry.keys)).toEqual([
      "f",
      "g",
      "a",
    ]);
    expect(filterHelpEntries(HELP_ENTRIES, "Ctrl+C")).toHaveLength(1);
    expect(filterHelpEntries(HELP_ENTRIES, "cycle link").map((entry) => entry.keys)).toEqual(["u"]);
    expect(filterHelpEntries(HELP_ENTRIES, "change team").map((entry) => entry.keys)).toEqual([
      "t",
    ]);
  });

  it("renders a useful empty state", () => {
    expect(helpText(HELP_ENTRIES, "not-a-command")).toBe("No matching commands.");
  });
});
