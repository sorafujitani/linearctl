import { expect, it } from "vite-plus/test";
import type { KeyEvent } from "@opentui/core";

import { HELP_ENTRIES } from "./help";
import { CATALOG_CONTROLS, ISSUE_BROWSER_CONTROLS, LIST_BINDINGS, listIntent } from "./keymap";

function key(name: string, overrides: Partial<KeyEvent> = {}): KeyEvent {
  return {
    name,
    sequence: name,
    raw: name,
    ctrl: false,
    meta: false,
    shift: false,
    ...overrides,
  } as KeyEvent;
}

it("maps every list key to its intent", () => {
  expect(listIntent(key("1"))).toEqual({ kind: "nav", nav: "my-issues" });
  expect(listIntent(key("4"))).toEqual({ kind: "nav", nav: "projects" });
  expect(listIntent(key("j"))).toEqual({ kind: "move", delta: 1 });
  expect(listIntent(key("up"))).toEqual({ kind: "move", delta: -1 });
  expect(listIntent(key("enter"))).toEqual({ kind: "activate" });
  expect(listIntent(key("escape"))).toEqual({ kind: "back" });
  expect(listIntent(key("s"))).toEqual({ kind: "issue-action", action: "status" });
  expect(listIntent(key("l"))).toEqual({ kind: "issue-action", action: "labels" });
  expect(listIntent(key("v"))).toEqual({ kind: "comments" });
  expect(listIntent(key("?"))).toEqual({ kind: "help" });
  expect(listIntent(key("z"))).toBeNull();
});

it("routes Ctrl chords to detail scrolling while plain keys keep their meaning", () => {
  expect(listIntent(key("u", { ctrl: true }))).toEqual({ kind: "scroll-detail", delta: -5 });
  expect(listIntent(key("u"))).toEqual({ kind: "copy-url" });
  expect(listIntent(key("d", { ctrl: true }))).toEqual({ kind: "scroll-detail", delta: 5 });
  expect(listIntent(key("d"))).toEqual({ kind: "toggle-done" });
  expect(listIntent(key("pageup"))).toEqual({ kind: "scroll-detail", delta: -5 });
  expect(listIntent(key("pagedown"))).toEqual({ kind: "scroll-detail", delta: 5 });
});

it("treats a fullwidth slash sequence as search", () => {
  expect(listIntent(key("／"))).toEqual({ kind: "search" });
  expect(listIntent(key("unknown", { sequence: "/" }))).toEqual({ kind: "search" });
});

it("documents every binding in the help window exactly once", () => {
  const documented = LIST_BINDINGS.flatMap((binding) =>
    binding.help === null ? [] : [binding.help.keys],
  );
  expect(new Set(documented).size).toBe(documented.length);
  for (const keys of documented) {
    expect(HELP_ENTRIES.some((entry) => entry.keys === keys)).toBe(true);
  }
});

it("mentions only bound keys in the footer control lines", () => {
  const boundNames = new Set(LIST_BINDINGS.flatMap((binding) => binding.names));
  const aliases = new Map([["Enter", "enter"]]);
  for (const controls of [ISSUE_BROWSER_CONTROLS, CATALOG_CONTROLS]) {
    expect(controls.length).toBeLessThanOrEqual(80);
    for (const token of controls.split(" · ")) {
      const label = token.split(" ")[0]!;
      const parts = label === "/" ? ["/"] : (aliases.get(label) ?? label).split("/");
      for (const part of parts) {
        expect(boundNames.has(part), `footer key "${part}" has no binding`).toBe(true);
      }
    }
  }
});
