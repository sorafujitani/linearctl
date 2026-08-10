const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export interface TextState {
  readonly text: string;
  readonly cursor: number;
}

/** Offsets where the caret may sit: every grapheme boundary plus the end of the text. */
function boundaries(text: string): number[] {
  const offsets = [0];
  for (const { index, segment } of segmenter.segment(text)) {
    offsets.push(index + segment.length);
  }
  return offsets;
}

export function clampCursor(text: string, cursor: number): number {
  if (cursor <= 0) return 0;
  if (cursor >= text.length) return text.length;
  const offsets = boundaries(text);
  let best = 0;
  for (const offset of offsets) {
    if (offset <= cursor) best = offset;
    else break;
  }
  return best;
}

export function moveCursorHorizontal(text: string, cursor: number, delta: number): number {
  const offsets = boundaries(text);
  const current = offsets.indexOf(clampCursor(text, cursor));
  const next = Math.min(Math.max(current + delta, 0), offsets.length - 1);
  return offsets[next] ?? 0;
}

export function lineStart(text: string, cursor: number): number {
  const position = clampCursor(text, cursor);
  const previous = text.lastIndexOf("\n", position - 1);
  return previous < 0 ? 0 : previous + 1;
}

export function lineEnd(text: string, cursor: number): number {
  const position = clampCursor(text, cursor);
  const next = text.indexOf("\n", position);
  return next < 0 ? text.length : next;
}

/** Caret column measured in graphemes so multi-byte text moves one visual step at a time. */
function column(text: string, cursor: number): number {
  const start = lineStart(text, cursor);
  return boundaries(text.slice(start, clampCursor(text, cursor))).length - 1;
}

function offsetForColumn(text: string, start: number, end: number, target: number): number {
  const offsets = boundaries(text.slice(start, end));
  const index = Math.min(target, offsets.length - 1);
  return start + (offsets[index] ?? 0);
}

export function moveCursorVertical(text: string, cursor: number, delta: number): number {
  if (delta === 0) return clampCursor(text, cursor);
  const target = column(text, cursor);
  let position = clampCursor(text, cursor);
  let clamped = false;
  for (let step = 0; step < Math.abs(delta); step += 1) {
    if (delta < 0) {
      const start = lineStart(text, position);
      if (start === 0) {
        position = 0;
        clamped = true;
        break;
      }
      position = lineStart(text, start - 1);
    } else {
      const end = lineEnd(text, position);
      if (end === text.length) {
        position = text.length;
        clamped = true;
        break;
      }
      position = end + 1;
    }
  }
  if (clamped) return position;
  return offsetForColumn(text, lineStart(text, position), lineEnd(text, position), target);
}

export function insertText(text: string, cursor: number, insert: string): TextState {
  const position = clampCursor(text, cursor);
  return {
    text: `${text.slice(0, position)}${insert}${text.slice(position)}`,
    cursor: position + insert.length,
  };
}

export function deleteBackward(text: string, cursor: number): TextState {
  const position = clampCursor(text, cursor);
  if (position === 0) return { text, cursor: 0 };
  const previous = moveCursorHorizontal(text, position, -1);
  return { text: `${text.slice(0, previous)}${text.slice(position)}`, cursor: previous };
}

export function deleteForward(text: string, cursor: number): TextState {
  const position = clampCursor(text, cursor);
  if (position === text.length) return { text, cursor: position };
  const next = moveCursorHorizontal(text, position, 1);
  return { text: `${text.slice(0, position)}${text.slice(next)}`, cursor: position };
}

/** Renders the caret as a block that replaces the grapheme under it, keeping line widths stable. */
export function withCaret(text: string, cursor: number, caret = "█"): string {
  const position = clampCursor(text, cursor);
  if (position === text.length) return `${text}${caret}`;
  const next = moveCursorHorizontal(text, position, 1);
  const covered = text.slice(position, next);
  return covered === "\n"
    ? `${text.slice(0, position)}${caret}${text.slice(position)}`
    : `${text.slice(0, position)}${caret}${text.slice(next)}`;
}
