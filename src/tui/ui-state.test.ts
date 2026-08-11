import { expect, it } from "vite-plus/test";
import type { KeyEvent } from "@opentui/core";

import { helpIntent, searchIntent } from "./ui-state";

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

it("interprets search-mode keys including spaces and multibyte input", () => {
  expect(searchIntent(key("escape"))).toEqual({ kind: "cancel" });
  expect(searchIntent(key("enter"))).toEqual({ kind: "commit" });
  expect(searchIntent(key("backspace"))).toEqual({ kind: "backspace" });
  expect(searchIntent(key("u", { ctrl: true }))).toEqual({ kind: "clear" });
  expect(searchIntent(key("space", { sequence: " " }))).toEqual({ kind: "input", text: " " });
  expect(searchIntent(key("あ", { sequence: "あ" }))).toEqual({ kind: "input", text: "あ" });
  expect(searchIntent(key("up"))).toEqual({ kind: "none" });
  expect(searchIntent(key("a", { ctrl: true }))).toEqual({ kind: "none" });
});

it("interprets help-mode keys with scrolling and printable input", () => {
  expect(helpIntent(key("escape"))).toEqual({ kind: "close" });
  expect(helpIntent(key("?"))).toEqual({ kind: "close" });
  expect(helpIntent(key("up"))).toEqual({ kind: "scroll", delta: -3 });
  expect(helpIntent(key("down"))).toEqual({ kind: "scroll", delta: 3 });
  expect(helpIntent(key("backspace"))).toEqual({ kind: "backspace" });
  expect(helpIntent(key("u", { ctrl: true }))).toEqual({ kind: "clear" });
  expect(helpIntent(key("f", { sequence: "f" }))).toEqual({ kind: "input", text: "f" });
  expect(helpIntent(key("f", { meta: true, sequence: "f" }))).toEqual({ kind: "none" });
});
