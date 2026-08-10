import { describe, expect, it } from "vite-plus/test";

import {
  clampCursor,
  deleteBackward,
  deleteForward,
  insertText,
  lineEnd,
  lineStart,
  moveCursorHorizontal,
  moveCursorVertical,
  withCaret,
} from "./text-input";

describe("caret movement", () => {
  it("moves one grapheme at a time across multi-byte text", () => {
    const text = "あい🇯🇵う";
    expect(moveCursorHorizontal(text, 0, 1)).toBe(1);
    const flagStart = moveCursorHorizontal(text, 0, 2);
    expect(text.slice(flagStart, moveCursorHorizontal(text, flagStart, 1))).toBe("🇯🇵");
    expect(moveCursorHorizontal(text, text.length, 1)).toBe(text.length);
    expect(moveCursorHorizontal(text, 0, -1)).toBe(0);
  });

  it("snaps an offset inside a grapheme back to its boundary", () => {
    const text = "a🇯🇵b";
    expect(clampCursor(text, 3)).toBe(1);
    expect(clampCursor(text, -5)).toBe(0);
    expect(clampCursor(text, 999)).toBe(text.length);
  });

  it("keeps the column when moving between lines and clamps on short lines", () => {
    const text = "hello\nab\nworld";
    const start = text.indexOf("world") + 3;
    const up = moveCursorVertical(text, start, -1);
    expect(up).toBe(text.indexOf("ab") + 2);
    const upAgain = moveCursorVertical(text, up, -1);
    expect(upAgain).toBe(2);
    expect(moveCursorVertical(text, upAgain, 1)).toBe(text.indexOf("ab") + 2);
  });

  it("clamps vertical movement at the first and last line", () => {
    const text = "one\ntwo";
    expect(moveCursorVertical(text, 1, -1)).toBe(0);
    expect(moveCursorVertical(text, text.length - 1, 1)).toBe(text.length);
  });

  it("reports line boundaries around the caret", () => {
    const text = "one\ntwo\nthree";
    const inSecond = text.indexOf("two") + 1;
    expect(lineStart(text, inSecond)).toBe(text.indexOf("two"));
    expect(lineEnd(text, inSecond)).toBe(text.indexOf("two") + 3);
    expect(lineStart(text, 0)).toBe(0);
    expect(lineEnd(text, text.length)).toBe(text.length);
  });
});

describe("caret editing", () => {
  it("inserts and deletes at the caret rather than the end", () => {
    expect(insertText("ab", 1, "X")).toEqual({ text: "aXb", cursor: 2 });
    expect(insertText("ab", 1, "\n")).toEqual({ text: "a\nb", cursor: 2 });
    expect(deleteBackward("aXb", 2)).toEqual({ text: "ab", cursor: 1 });
    expect(deleteBackward("ab", 0)).toEqual({ text: "ab", cursor: 0 });
    expect(deleteForward("aXb", 1)).toEqual({ text: "ab", cursor: 1 });
    expect(deleteForward("ab", 2)).toEqual({ text: "ab", cursor: 2 });
  });

  it("deletes a whole grapheme cluster", () => {
    const text = "a🇯🇵";
    expect(deleteBackward(text, text.length)).toEqual({ text: "a", cursor: 1 });
  });
});

describe("caret rendering", () => {
  it("covers the grapheme under the caret and keeps newlines visible", () => {
    expect(withCaret("ab", 2)).toBe("ab█");
    expect(withCaret("ab", 1)).toBe("a█");
    expect(withCaret("a\nb", 1)).toBe("a█\nb");
    expect(withCaret("", 0)).toBe("█");
  });
});
