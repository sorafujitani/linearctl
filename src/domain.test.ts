import { expect, it } from "vite-plus/test";

import { matchesSearch, sortWorkflowStates } from "./domain";

it("matches case-insensitive substrings and passes everything on an empty query", () => {
  expect(matchesSearch("august", ["Cycle August", "other"])).toBe(true);
  expect(matchesSearch("AUGUST", ["cycle august"])).toBe(true);
  expect(matchesSearch("missing", ["Cycle August"])).toBe(false);
  expect(matchesSearch("  ", [])).toBe(true);
  expect(matchesSearch("a", [])).toBe(false);
});

it("sorts workflow states by position without mutating the input", () => {
  const states = [
    { id: "2", name: "Done", type: "completed", color: "#fff", position: 2 },
    { id: "1", name: "Todo", type: "unstarted", color: "#fff", position: 1 },
  ];
  expect(sortWorkflowStates(states).map((item) => item.id)).toEqual(["1", "2"]);
  expect(states[0]?.id).toBe("2");
});
