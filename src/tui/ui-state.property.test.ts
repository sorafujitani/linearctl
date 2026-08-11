import fc from "fast-check";
import { expect, it } from "vite-plus/test";
import type { KeyEvent } from "@opentui/core";

import { helpIntent, searchIntent } from "./ui-state";

const runs = { numRuns: 500 };

/** The plain shape the intent functions read; KeyEvent is a class, so build fields then cast. */
interface KeyFields {
  name: string;
  sequence: string;
  raw: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  super: boolean;
}

function keyEvent(fields: Partial<KeyFields>): KeyEvent {
  return {
    name: "",
    sequence: "",
    raw: "",
    ctrl: false,
    meta: false,
    shift: false,
    super: false,
    ...fields,
  } as unknown as KeyEvent;
}

/** name/sequence pairs a terminal actually emits; guessing them apart hides real regressions. */
const REAL_PAIRS: readonly [string, string][] = [
  ["escape", "\x1b"],
  ["return", "\r"],
  ["enter", "\r"],
  ["backspace", "\x7f"],
  ["delete", "\x1b[3~"],
  ["tab", "\t"],
  ["up", "\x1b[A"],
  ["down", "\x1b[B"],
  ["left", "\x1b[D"],
  ["right", "\x1b[C"],
  ["home", "\x1b[H"],
  ["end", "\x1b[F"],
  ["pageup", "\x1b[5~"],
  ["pagedown", "\x1b[6~"],
  ["insert", "\x1b[2~"],
  ["space", " "],
  ["a", "a"],
  ["u", "u"],
  ["?", "?"],
  ["/", "/"],
  ["あ", "あ"],
  ["🇯🇵", "🇯🇵"],
];

const modifiersArb = fc.record({
  ctrl: fc.boolean(),
  meta: fc.boolean(),
  shift: fc.boolean(),
  super: fc.boolean(),
});

const realKeyArb: fc.Arbitrary<KeyFields> = fc
  .tuple(fc.constantFrom(...REAL_PAIRS), modifiersArb)
  .map(([[name, sequence], modifiers]) => ({ name, sequence, raw: sequence, ...modifiers }));

/** Names and sequences crossed freely: only good for checking the functions stay total. */
const scrambledKeyArb: fc.Arbitrary<KeyFields> = fc
  .tuple(
    fc.constantFrom(...REAL_PAIRS.map(([name]) => name), ""),
    fc.constantFrom(...REAL_PAIRS.map(([, sequence]) => sequence), "", "\x00"),
    modifiersArb,
  )
  .map(([name, sequence, modifiers]) => ({ name, sequence, raw: sequence, ...modifiers }));

const anyKeyArb = fc.oneof(
  { weight: 3, arbitrary: realKeyArb },
  { weight: 2, arbitrary: scrambledKeyArb },
);

const SEARCH_KINDS = ["cancel", "commit", "clear", "backspace", "input", "none"];
const HELP_KINDS = ["close", "scroll", "clear", "backspace", "input", "none"];

const CONTROL = /\p{C}/u;

it("maps every key event to a known search intent", () => {
  fc.assert(
    fc.property(anyKeyArb, (fields) => {
      expect(SEARCH_KINDS).toContain(searchIntent(keyEvent(fields)).kind);
    }),
    runs,
  );
});

it("maps every key event to a known help intent", () => {
  fc.assert(
    fc.property(anyKeyArb, (fields) => {
      const intent = helpIntent(keyEvent(fields));
      expect(HELP_KINDS).toContain(intent.kind);
      if (intent.kind === "scroll") expect([-3, 3]).toContain(intent.delta);
    }),
    runs,
  );
});

it("lets escape out of search and help whatever the modifiers are", () => {
  fc.assert(
    fc.property(anyKeyArb, (fields) => {
      const escape = keyEvent({ ...fields, name: "escape" });
      expect(searchIntent(escape)).toEqual({ kind: "cancel" });
      expect(helpIntent(escape)).toEqual({ kind: "close" });
    }),
    runs,
  );
});

it("never treats a modified key as typed text", () => {
  fc.assert(
    fc.property(anyKeyArb, (fields) => {
      if (!fields.ctrl && !fields.meta) return;
      const key = keyEvent(fields);
      expect(searchIntent(key).kind).not.toBe("input");
      expect(helpIntent(key).kind).not.toBe("input");
    }),
    runs,
  );
});

it("only feeds printable text into the search query", () => {
  fc.assert(
    fc.property(realKeyArb, (fields) => {
      const intent = searchIntent(keyEvent(fields));
      if (intent.kind !== "input") return;
      expect(intent.text).toBe(fields.sequence);
      expect(intent.text.length).toBeGreaterThan(0);
      expect(CONTROL.test(intent.text)).toBe(false);
      expect(intent.text.startsWith("\x1b")).toBe(false);
    }),
    runs,
  );
});

it("feeds printable text into the help filter", () => {
  fc.assert(
    fc.property(realKeyArb, (fields) => {
      const intent = helpIntent(keyEvent(fields));
      if (intent.kind !== "input") return;
      expect(intent.text).toBe(fields.sequence);
      expect(intent.text.length).toBeGreaterThan(0);
      expect(CONTROL.test(intent.text)).toBe(false);
      expect(intent.text.startsWith("\x1b")).toBe(false);
    }),
    runs,
  );
});

it("scrolls help only on the arrow keys", () => {
  fc.assert(
    fc.property(realKeyArb, (fields) => {
      const intent = helpIntent(keyEvent(fields));
      if (intent.kind === "scroll") {
        expect(["up", "down"]).toContain(fields.name);
        expect(intent.delta).toBe(fields.name === "up" ? -3 : 3);
        return;
      }
      expect(["up", "down"]).not.toContain(fields.name);
    }),
    runs,
  );
});

it("reserves ctrl+u for clearing the query in both modes", () => {
  fc.assert(
    fc.property(anyKeyArb, (fields) => {
      const clear = keyEvent({ ...fields, name: "u", ctrl: true, meta: false });
      expect(searchIntent(clear)).toEqual({ kind: "clear" });
      expect(helpIntent(clear)).toEqual({ kind: "clear" });
    }),
    runs,
  );
});

it("only accepts text in help mode that search mode would also accept", () => {
  fc.assert(
    // Scrambled name/sequence pairs disagree for reasons no terminal produces.
    fc.property(realKeyArb, (fields) => {
      const key = keyEvent(fields);
      const help = helpIntent(key);
      if (help.kind !== "input") return;
      expect(searchIntent(key)).toEqual({ kind: "input", text: help.text });
    }),
    runs,
  );
});

// Regression case found by the properties above.

it("keeps tab out of the help filter", () => {
  expect(helpIntent(keyEvent({ name: "tab", sequence: "\t", raw: "\t" }))).toEqual({
    kind: "none",
  });
});
