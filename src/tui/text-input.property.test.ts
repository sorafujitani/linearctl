import fc from "fast-check";
import { expect, it } from "vite-plus/test";

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

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function boundaries(text: string): number[] {
  const offsets = [0];
  for (const { index, segment } of segmenter.segment(text)) {
    offsets.push(index + segment.length);
  }
  return offsets;
}

function graphemeCount(value: string): number {
  return boundaries(value).length - 1;
}

/** Line bounds computed independently of the module so the properties can judge it. */
function lineStartOracle(text: string, position: number): number {
  return position === 0 ? 0 : text.lastIndexOf("\n", position - 1) + 1;
}

function lineEndOracle(text: string, position: number): number {
  const next = text.indexOf("\n", position);
  return next < 0 ? text.length : next;
}

function columnOf(text: string, position: number): number {
  return graphemeCount(text.slice(lineStartOracle(text, position), position));
}

const CURATED = [
  "",
  "a",
  "\n",
  "\n\n",
  "\nsecond",
  "ab\n",
  "a🇯🇵b",
  "あい🇯🇵う",
  "hello\nab\nworld",
  "👨‍👩‍👧‍👦x",
  "éf",
  "ab\r\ncd",
  "🇯🇵a\nabcdef",
];

const CARET = "█";

const textArb = fc
  .oneof(
    { weight: 4, arbitrary: fc.string({ unit: "grapheme", maxLength: 24 }) },
    {
      weight: 3,
      arbitrary: fc
        .array(fc.string({ unit: "grapheme-ascii", maxLength: 6 }), { maxLength: 4 })
        .map((lines) => lines.join("\n")),
    },
    { weight: 3, arbitrary: fc.constantFrom(...CURATED) },
  )
  .map((text) => text.replaceAll(CARET, ""));

/** Cursors drawn from the text's own length so interior offsets stay well represented. */
const textCursorArb = textArb.chain((text) =>
  fc.tuple(fc.constant(text), fc.integer({ min: -4, max: text.length + 4 })),
);

const insertArb = fc.oneof(
  { weight: 4, arbitrary: fc.string({ unit: "grapheme", minLength: 1, maxLength: 4 }) },
  { weight: 3, arbitrary: fc.string({ maxLength: 8 }) },
  {
    weight: 3,
    arbitrary: fc.constantFrom("\n", "a\nb", "́", "️", "‍", "🇺", "🇯🇵", "👍"),
  },
);

const graphemeArb = fc.oneof(
  { weight: 3, arbitrary: fc.string({ unit: "grapheme", minLength: 1, maxLength: 1 }) },
  { weight: 2, arbitrary: fc.constantFrom("a", "\n", "あ", "🇯🇵", "👨‍👩‍👧‍👦", "é", "́", "🇺") },
);

const runs = { numRuns: 500 };

it("clamps every cursor onto a grapheme boundary inside the text", () => {
  fc.assert(
    fc.property(textCursorArb, ([text, cursor]) => {
      const clamped = clampCursor(text, cursor);
      expect(boundaries(text)).toContain(clamped);
      expect(clamped).toBeGreaterThanOrEqual(0);
      expect(clamped).toBeLessThanOrEqual(text.length);
    }),
    runs,
  );
});

it("clamps idempotently", () => {
  fc.assert(
    fc.property(textCursorArb, ([text, cursor]) => {
      const once = clampCursor(text, cursor);
      expect(clampCursor(text, once)).toBe(once);
    }),
    runs,
  );
});

it("moves the caret between grapheme boundaries and reverses one step exactly", () => {
  fc.assert(
    fc.property(textCursorArb, ([text, cursor]) => {
      const offsets = boundaries(text);
      const start = clampCursor(text, cursor);
      const forward = moveCursorHorizontal(text, start, 1);
      const backward = moveCursorHorizontal(text, start, -1);
      expect(offsets).toContain(forward);
      expect(offsets).toContain(backward);
      expect(forward).toBeGreaterThanOrEqual(start);
      expect(backward).toBeLessThanOrEqual(start);
      if (start < text.length) expect(moveCursorHorizontal(text, forward, -1)).toBe(start);
      if (start > 0) expect(moveCursorHorizontal(text, backward, 1)).toBe(start);
    }),
    runs,
  );
});

it("clamps caret movement at both ends of the text", () => {
  fc.assert(
    fc.property(textArb, fc.integer({ min: 1, max: 60 }), (text, delta) => {
      expect(moveCursorHorizontal(text, 0, -delta)).toBe(0);
      expect(moveCursorHorizontal(text, text.length, delta)).toBe(text.length);
    }),
    runs,
  );
});

it("keeps the caret inside the line containing it", () => {
  fc.assert(
    fc.property(textCursorArb, ([text, cursor]) => {
      const position = clampCursor(text, cursor);
      const start = lineStart(text, cursor);
      const end = lineEnd(text, cursor);
      expect(start).toBe(lineStartOracle(text, position));
      expect(end).toBe(lineEndOracle(text, position));
      expect(text.slice(start, end)).not.toContain("\n");
    }),
    runs,
  );
});

it("inserts text at the caret without touching the rest of the buffer", () => {
  fc.assert(
    fc.property(textCursorArb, insertArb, ([text, cursor], insert) => {
      const position = clampCursor(text, cursor);
      const next = insertText(text, cursor, insert);
      const expectedText = `${text.slice(0, position)}${insert}${text.slice(position)}`;
      expect(next.text).toBe(expectedText);
      expect(boundaries(next.text)).toContain(next.cursor);
      expect(next.cursor).toBeGreaterThanOrEqual(position + insert.length);
    }),
    runs,
  );
});

it("undoes a one-grapheme insert with a backspace", () => {
  fc.assert(
    fc.property(textCursorArb, graphemeArb, ([text, cursor], insert) => {
      const position = clampCursor(text, cursor);
      const inserted = insertText(text, cursor, insert);
      // A merged cluster cannot be undone without deleting the neighbouring text too.
      const offsets = boundaries(inserted.text);
      const insertedEnd = position + insert.length;
      if (!offsets.includes(position) || !offsets.includes(insertedEnd)) return;
      const undone = deleteBackward(inserted.text, inserted.cursor);
      expect(undone.text).toBe(text);
      expect(undone.cursor).toBe(position);
    }),
    runs,
  );
});

it("deletes at most one grapheme and leaves the caret on a boundary", () => {
  fc.assert(
    fc.property(textCursorArb, ([text, cursor]) => {
      const position = clampCursor(text, cursor);
      const back = deleteBackward(text, cursor);
      const forward = deleteForward(text, cursor);
      for (const state of [back, forward]) {
        expect(state.text.length).toBeLessThanOrEqual(text.length);
        expect(boundaries(state.text)).toContain(state.cursor);
      }
      expect(back.cursor).toBe(moveCursorHorizontal(text, position, -1));
      expect(back.text).toBe(`${text.slice(0, back.cursor)}${text.slice(position)}`);
      expect(forward.cursor).toBe(position);
      expect(forward.text).toBe(
        `${text.slice(0, position)}${text.slice(moveCursorHorizontal(text, position, 1))}`,
      );
      expect(graphemeCount(text) - graphemeCount(back.text)).toBeLessThanOrEqual(1);
      expect(graphemeCount(text) - graphemeCount(forward.text)).toBeLessThanOrEqual(1);
    }),
    runs,
  );
});

it("moves vertically to a boundary, monotonically, and does nothing at delta zero", () => {
  fc.assert(
    fc.property(textCursorArb, fc.integer({ min: 1, max: 4 }), ([text, cursor], steps) => {
      const position = clampCursor(text, cursor);
      expect(moveCursorVertical(text, cursor, 0)).toBe(position);
      const down = moveCursorVertical(text, cursor, steps);
      const up = moveCursorVertical(text, cursor, -steps);
      expect(boundaries(text)).toContain(down);
      expect(boundaries(text)).toContain(up);
      expect(down).toBeGreaterThanOrEqual(position);
      expect(up).toBeLessThanOrEqual(position);
    }),
    runs,
  );
});

it("keeps the visual column when stepping one line up or down", () => {
  fc.assert(
    fc.property(textCursorArb, ([text, cursor]) => {
      const position = clampCursor(text, cursor);
      const column = columnOf(text, position);
      const end = lineEndOracle(text, position);
      const start = lineStartOracle(text, position);

      const down = moveCursorVertical(text, position, 1);
      if (end === text.length) expect(down).toBe(text.length);
      else {
        const nextStart = end + 1;
        const nextEnd = lineEndOracle(text, nextStart);
        expect(lineStartOracle(text, down)).toBe(nextStart);
        expect(columnOf(text, down)).toBe(
          Math.min(column, graphemeCount(text.slice(nextStart, nextEnd))),
        );
      }

      const up = moveCursorVertical(text, position, -1);
      if (start === 0) expect(up).toBe(0);
      else {
        const previousStart = lineStartOracle(text, start - 1);
        expect(lineStartOracle(text, up)).toBe(previousStart);
        expect(columnOf(text, up)).toBe(
          Math.min(column, graphemeCount(text.slice(previousStart, start - 1))),
        );
      }
    }),
    runs,
  );
});

it("renders the caret once without changing the line count", () => {
  fc.assert(
    fc.property(textCursorArb, ([text, cursor]) => {
      const rendered = withCaret(text, cursor);
      expect(rendered.split(CARET).length).toBe(2);
      expect(rendered.split("\n").length).toBe(text.split("\n").length);
    }),
    runs,
  );
});

it("appends the caret when it sits past the last grapheme", () => {
  fc.assert(
    fc.property(textArb, fc.integer({ min: 0, max: 40 }), (text, overshoot) => {
      expect(withCaret(text, text.length + overshoot)).toBe(`${text}${CARET}`);
    }),
    runs,
  );
});

// Regression cases found by the properties above.

it("keeps the caret at offset 0 when the first line is empty", () => {
  expect(lineStart("\nsecond", 0)).toBe(0);
});

it("moves up out of the second line when the first line is empty", () => {
  expect(moveCursorVertical("\nsecond", 3, -1)).toBe(0);
});

it("keeps the line count when the caret covers a CRLF break", () => {
  const text = "ab\r\ncd";
  expect(withCaret(text, 2).split("\n").length).toBe(text.split("\n").length);
});

it("leaves the caret on a boundary after inserting a regional indicator", () => {
  const inserted = insertText("🇯🇵", 0, "🇺");
  expect(boundaries(inserted.text)).toContain(inserted.cursor);
});
