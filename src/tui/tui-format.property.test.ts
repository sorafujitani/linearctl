import fc from "fast-check";
import stringWidth from "string-width";
import { expect, it } from "vite-plus/test";

import { createAppState, visibleIssues, type AppState } from "./app-state";
import { ISSUE_DIMENSIONS, type IssueGroupDimension } from "./issue-list";
import type { Issue, IssueComment } from "../core/domain";
import {
  catalogDetailText,
  commentsText,
  formatDate,
  formatProgress,
  issueDetailText,
  issueListRows,
  listScrollOffset,
  panelWidths,
  selectableTextRows,
  truncateToWidth,
} from "./tui-format";

const runs = { numRuns: 300 };
const ELLIPSIS = "…";

const CURATED_TEXT = [
  "",
  "ENG-1 Build CLI",
  "あいうえお",
  "a🇯🇵b",
  "👨‍👩‍👧‍👦 family",
  "éclair",
  "wide　space",
];

const displayTextArb = fc.oneof(
  { weight: 4, arbitrary: fc.string({ unit: "grapheme", maxLength: 30 }) },
  { weight: 2, arbitrary: fc.string({ unit: "grapheme-ascii", maxLength: 30 }) },
  { weight: 2, arbitrary: fc.constantFrom(...CURATED_TEXT) },
);

const filledTextArb = displayTextArb.map((value) => (value === "" ? "body" : value));

/** Widths clustered around the string's own width so off-by-one truncation shows up. */
const textWidthArb = displayTextArb.chain((value) => {
  const width = stringWidth(value);
  return fc.tuple(
    fc.constant(value),
    fc.oneof(
      { weight: 3, arbitrary: fc.integer({ min: Math.max(-2, width - 3), max: width + 3 }) },
      { weight: 2, arbitrary: fc.integer({ min: -3, max: 60 }) },
    ),
  );
});

const issueArb: fc.Arbitrary<Issue> = fc.record({
  id: fc.string({ unit: "grapheme-ascii", minLength: 1, maxLength: 6 }),
  identifier: fc.constantFrom("ENG-1", "ENG-22", "OPS-7"),
  title: displayTextArb,
  description: fc.option(displayTextArb, { nil: null }),
  priority: fc.integer({ min: 0, max: 4 }),
  priorityLabel: fc.constantFrom("No priority", "Urgent", "High", "Medium", "Low"),
  estimate: fc.option(fc.integer({ min: 0, max: 13 }), { nil: null }),
  assignee: fc.option(
    fc.record({ id: fc.constantFrom("u1", "u2"), name: fc.constantFrom("Sora", "Rin") }),
    { nil: null },
  ),
  // Linear never repeats a label on one issue, so keep ids unique here too.
  labels: fc.uniqueArray(
    fc.record({
      id: fc.constantFrom("l1", "l2"),
      name: fc.constantFrom("Backend", "Bug"),
      color: fc.constant("#fff"),
      team: fc.constant(null),
    }),
    { maxLength: 2, selector: (label) => label.id },
  ),
  labelsComplete: fc.boolean(),
  url: fc.constant("https://example.invalid/ENG-1"),
  updatedAt: fc.constantFrom("2026-08-06T00:00:00Z", "not-a-date", ""),
  state: fc.record({
    id: fc.constantFrom("s1", "s2"),
    name: fc.constantFrom("Todo", "In Progress", "Done"),
    type: fc.constantFrom("unstarted", "started", "completed"),
    color: fc.constant("#fff"),
    position: fc.integer({ min: 0, max: 5 }),
  }),
  team: fc.record({
    id: fc.constantFrom("team-1", "team-2"),
    name: fc.constantFrom("Engineering", "Ops"),
    key: fc.constantFrom("ENG", "OPS"),
  }),
  cycle: fc.option(
    fc.record({
      id: fc.constantFrom("c1", "c2"),
      number: fc.integer({ min: 1, max: 40 }),
      name: fc.option(fc.constantFrom("Summer", "Fall"), { nil: null }),
    }),
    { nil: null },
  ),
  project: fc.option(
    fc.record({
      id: fc.constantFrom("p1", "p2"),
      name: fc.constantFrom("Launch", "Cleanup"),
      slugId: fc.constantFrom("launch", "cleanup"),
    }),
    { nil: null },
  ),
});

const groupByArb: fc.Arbitrary<IssueGroupDimension> = fc.constantFrom<IssueGroupDimension[]>(
  "none",
  ...ISSUE_DIMENSIONS,
);

/** Kept small on purpose: a failing case prints these three fields, not a whole AppState. */
const listSeedArb = fc.record({
  issues: fc.uniqueArray(issueArb, { minLength: 1, maxLength: 6, selector: (issue) => issue.id }),
  groupBy: groupByArb,
  selectedIndex: fc.nat({ max: 8 }),
});

function listState(seed: {
  issues: Issue[];
  groupBy: IssueGroupDimension;
  selectedIndex: number;
}): AppState {
  const selected = seed.issues[seed.selectedIndex % seed.issues.length];
  return {
    ...createAppState(),
    issues: seed.issues,
    groupBy: seed.groupBy,
    selectedIssueId: selected === undefined ? null : selected.id,
  };
}

it("never renders a truncated string wider than the budget", () => {
  fc.assert(
    fc.property(textWidthArb, ([value, width]) => {
      const available = Math.max(0, Math.floor(width));
      expect(stringWidth(truncateToWidth(value, width))).toBeLessThanOrEqual(available);
    }),
    runs,
  );
});

it("truncates idempotently", () => {
  fc.assert(
    fc.property(textWidthArb, ([value, width]) => {
      const once = truncateToWidth(value, width);
      expect(truncateToWidth(once, width)).toBe(once);
    }),
    runs,
  );
});

it("keeps a truncated string a prefix of the original plus an ellipsis", () => {
  fc.assert(
    fc.property(textWidthArb, ([value, width]) => {
      const result = truncateToWidth(value, width);
      if (result === value || result === "") return;
      expect(result.endsWith(ELLIPSIS)).toBe(true);
      expect(value.startsWith(result.slice(0, -ELLIPSIS.length))).toBe(true);
    }),
    runs,
  );
});

it("returns the input untouched when it already fits", () => {
  fc.assert(
    fc.property(textWidthArb, ([value, width]) => {
      if (stringWidth(value) > Math.max(0, Math.floor(width))) return;
      expect(truncateToWidth(value, width)).toBe(value);
    }),
    runs,
  );
});

it("truncates as late as the budget allows", () => {
  fc.assert(
    fc.property(textWidthArb, ([value, width]) => {
      const available = Math.max(0, Math.floor(width));
      const result = truncateToWidth(value, width);
      if (result === value || result === "") return;
      const kept = result.slice(0, -ELLIPSIS.length);
      const nextGrapheme = [...new Intl.Segmenter().segment(value.slice(kept.length))][0]?.segment;
      expect(nextGrapheme).toBeDefined();
      expect(
        stringWidth(kept) + stringWidth(nextGrapheme ?? "") + stringWidth(ELLIPSIS),
      ).toBeGreaterThan(available);
    }),
    runs,
  );
});

it("truncates monotonically as the budget grows", () => {
  fc.assert(
    fc.property(
      displayTextArb,
      fc.integer({ min: -3, max: 60 }),
      fc.integer({ min: -3, max: 60 }),
      (value, a, b) => {
        const [narrow, wide] = a <= b ? [a, b] : [b, a];
        expect(stringWidth(truncateToWidth(value, narrow))).toBeLessThanOrEqual(
          stringWidth(truncateToWidth(value, wide)),
        );
      },
    ),
    runs,
  );
});

it("splits the terminal into two panels that exactly fill the usable width", () => {
  fc.assert(
    fc.property(fc.integer({ min: -10, max: 400 }), (terminalWidth) => {
      const { list, detail } = panelWidths(terminalWidth);
      expect(list).toBeGreaterThanOrEqual(1);
      expect(detail).toBeGreaterThanOrEqual(1);
      expect(list + detail).toBe(Math.max(Math.floor(terminalWidth) - 1, 2));
    }),
    runs,
  );
});

it("formats progress as a whole percentage", () => {
  fc.assert(
    fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (value) => {
      const text = formatProgress(value);
      expect(text).toMatch(/^\d+%$/);
      expect(Number.parseInt(text, 10)).toBeGreaterThanOrEqual(0);
      expect(Number.parseInt(text, 10)).toBeLessThanOrEqual(100);
    }),
    runs,
  );
});

it("echoes unparseable dates instead of showing Invalid Date", () => {
  fc.assert(
    fc.property(
      fc.oneof(
        { weight: 2, arbitrary: fc.option(fc.string({ maxLength: 12 }), { nil: null }) },
        {
          weight: 3,
          arbitrary: fc.date({ noInvalidDate: true }).map((date) => date.toISOString()),
        },
      ),
      (value) => {
        const text = formatDate(value);
        expect(text).not.toContain("Invalid Date");
        if (value === null) {
          expect(text).toBe("-");
          return;
        }
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) expect(text).toBe(value);
        else expect(text).toBe(parsed.toLocaleString());
      },
    ),
    runs,
  );
});

it("scrolls the list by the smallest step that reveals the selected line", () => {
  fc.assert(
    fc.property(
      fc.nat({ max: 200 }),
      fc.integer({ min: -2, max: 40 }),
      fc.option(fc.nat({ max: 200 }), { nil: null }),
      (currentOffset, viewportHeight, selectedLine) => {
        const offset = listScrollOffset(currentOffset, viewportHeight, selectedLine);
        if (selectedLine === null) {
          expect(offset).toBe(0);
          return;
        }
        if (viewportHeight <= 0) {
          expect(offset).toBe(currentOffset);
          return;
        }
        if (selectedLine < currentOffset) expect(offset).toBe(selectedLine);
        else if (selectedLine >= currentOffset + viewportHeight) {
          expect(offset).toBe(selectedLine - viewportHeight + 1);
        } else expect(offset).toBe(currentOffset);
        expect(selectedLine).toBeGreaterThanOrEqual(offset);
        expect(selectedLine).toBeLessThan(offset + viewportHeight);
      },
    ),
    runs,
  );
});

it("round-trips selectable rows back into their source text", () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.oneof(
          fc.string({ unit: "grapheme", maxLength: 12 }),
          fc.constantFrom("› x", "  › x", "x › y", "\t› x", "›", " ›", ""),
        ),
        { maxLength: 6 },
      ),
      (lines) => {
        const content = lines.join("\n");
        const rows = selectableTextRows(content);
        expect(rows.map((row) => row.text).join("\n")).toBe(content);
        expect(rows.length).toBe(content.split("\n").length);
        for (const row of rows) {
          expect(row.selected).toBe(row.text.replace(/^\s+/, "").startsWith("›"));
        }
      },
    ),
    runs,
  );
});

it("fits every issue row in the panel", () => {
  fc.assert(
    fc.property(listSeedArb, fc.integer({ min: 0, max: 60 }), (seed, width) => {
      for (const row of issueListRows(listState(seed), width)) {
        expect(stringWidth(row.text)).toBeLessThanOrEqual(width);
      }
    }),
    runs,
  );
});

it("lists every visible issue exactly once and marks only the selected one", () => {
  fc.assert(
    fc.property(listSeedArb, (seed) => {
      const state = listState(seed);
      // Wide enough that no row is truncated, so group headers stay recognisable.
      const rows = issueListRows(state, 200);
      const issueRows = rows.filter((row) => !row.text.startsWith("▾"));
      expect(issueRows.length).toBe(visibleIssues(state).length);
      const selected = rows.filter((row) => row.selected);
      expect(selected.length).toBe(1);
      expect(selected[0]?.text).toContain("›");
    }),
    runs,
  );
});

it("renders a detail body for any issue", () => {
  fc.assert(
    fc.property(issueArb, (issue) => {
      const text = issueDetailText(issue);
      expect(text).toContain(issue.identifier);
      expect(text).toContain(issue.state.name);
      expect(text).toContain(issue.assignee?.name ?? "Unassigned");
      expect(text).toContain(issue.project?.name ?? "Unassigned");
      expect(text).toContain(formatDate(issue.updatedAt));
      expect(text.split("\n").length).toBeGreaterThan(10);
    }),
    runs,
  );
});

it("falls back when nothing is selected", () => {
  expect(issueDetailText(undefined)).toBe("Select an issue.");
  expect(catalogDetailText(undefined)).toBe("Select an item.");
});

const commentArb: fc.Arbitrary<IssueComment> = fc.record({
  id: fc.constantFrom("cm1", "cm2"),
  body: filledTextArb,
  createdAt: fc.constantFrom("2026-08-06T00:00:00Z", "nope"),
  author: fc.option(fc.constantFrom("Sora", "Rin"), { nil: null }),
});

it("always keeps the issue header at the top of the comments view", () => {
  fc.assert(
    fc.property(
      issueArb,
      fc.record({ comments: fc.array(commentArb, { maxLength: 3 }), hasMore: fc.boolean() }),
      (issue, page) => {
        const text = commentsText(issue, page);
        expect(text.startsWith(`${issue.identifier}  ${issue.title}`)).toBe(true);
        if (page.comments.length === 0) {
          expect(text).toContain("No comments on this issue.");
          return;
        }
        for (const comment of page.comments) {
          expect(text).toContain(comment.body);
          expect(text).toContain(comment.author ?? "(bot)");
          expect(text).toContain(formatDate(comment.createdAt));
        }
        expect(text.includes("older comments exist on the server.")).toBe(page.hasMore);
      },
    ),
    runs,
  );
});

it("never leaves the catalog detail empty", () => {
  fc.assert(
    fc.property(
      fc.record({
        id: fc.constantFrom("p1", "p2"),
        name: displayTextArb,
        slugId: fc.constantFrom("launch", "cleanup"),
        description: displayTextArb,
        url: fc.constant("https://example.invalid/project"),
        progress: fc.double({ min: 0, max: 1, noNaN: true }),
        health: fc.option(fc.constantFrom("onTrack", "atRisk"), { nil: null }),
        startDate: fc.constant(null),
        targetDate: fc.constant(null),
        status: fc.record({
          id: fc.constant("st"),
          name: fc.constantFrom("In Progress", "Backlog"),
          type: fc.constantFrom("started", "backlog"),
          color: fc.constant("#fff"),
        }),
        lead: fc.constant(null),
        teams: fc.array(
          fc.record({
            id: fc.constantFrom("team-1", "team-2"),
            name: fc.constantFrom("Engineering", "Ops"),
            key: fc.constantFrom("ENG", "OPS"),
          }),
          { maxLength: 2 },
        ),
      }),
      (project) => {
        const text = catalogDetailText(project);
        expect(text).toContain(project.status.name);
        expect(text).toContain(formatProgress(project.progress));
        expect(text).toContain(project.health ?? "-");
      },
    ),
    runs,
  );
});
