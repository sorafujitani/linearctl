import type { KeyEvent } from "@opentui/core";

import { printableKeyText } from "./key-intent";

export type Mode = "list" | "search" | "help";

export type SearchIntent =
  | { kind: "cancel" }
  | { kind: "commit" }
  | { kind: "clear" }
  | { kind: "backspace" }
  | { kind: "input"; text: string }
  | { kind: "none" };

export function searchIntent(key: KeyEvent): SearchIntent {
  if (key.name === "escape") return { kind: "cancel" };
  if (key.name === "return" || key.name === "enter") return { kind: "commit" };
  if (key.name === "backspace") return { kind: "backspace" };
  if (key.ctrl === true && key.name === "u") return { kind: "clear" };
  const text = printableKeyText(key);
  return text === null ? { kind: "none" } : { kind: "input", text };
}

export type HelpIntent =
  | { kind: "close" }
  | { kind: "scroll"; delta: -3 | 3 }
  | { kind: "clear" }
  | { kind: "backspace" }
  | { kind: "input"; text: string }
  | { kind: "none" };

export function helpIntent(key: KeyEvent): HelpIntent {
  if (key.name === "escape" || key.name === "?") return { kind: "close" };
  if (key.name === "up") return { kind: "scroll", delta: -3 };
  if (key.name === "down") return { kind: "scroll", delta: 3 };
  if (key.name === "backspace") return { kind: "backspace" };
  if (key.ctrl === true && key.name === "u") return { kind: "clear" };
  const text = printableKeyText(key);
  return text === null ? { kind: "none" } : { kind: "input", text };
}
