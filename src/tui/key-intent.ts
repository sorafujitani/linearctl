import type { KeyEvent } from "@opentui/core";

export function isSearchTrigger(key: KeyEvent): boolean {
  if (key.ctrl || key.meta) return false;
  return key.name === "/" || key.name === "／" || key.sequence === "/" || key.sequence === "／";
}

/**
 * Create submit is deliberately modifier+Enter so plain Enter can stay "activate the current thing"
 * everywhere. Cmd+Enter only reaches us when the terminal speaks the kitty keyboard protocol, so
 * Ctrl+Enter and Ctrl+S are kept as portable aliases.
 */
export function isCreateSubmit(key: KeyEvent): boolean {
  if (key.name === "return" || key.name === "enter") {
    return key.ctrl === true || key.super === true;
  }
  return key.ctrl === true && key.name === "s";
}

/**
 * Inside a text editor, modifier+Enter confirms that field instead of creating: the create key must
 * not fire while a description is still half-written. Esc leaves the same way, keeping the text.
 */
export function isEditorConfirm(key: KeyEvent): boolean {
  return isCreateSubmit(key) || key.name === "escape";
}

export function printableKeyText(key: KeyEvent): string | null {
  if (key.ctrl || key.meta) return null;
  if (
    key.name === "return" ||
    key.name === "enter" ||
    key.name === "escape" ||
    key.name === "tab" ||
    key.name === "backspace" ||
    key.name === "delete" ||
    key.name === "up" ||
    key.name === "down" ||
    key.name === "left" ||
    key.name === "right" ||
    key.name === "home" ||
    key.name === "end" ||
    key.name === "pageup" ||
    key.name === "pagedown" ||
    key.name === "insert"
  ) {
    return null;
  }
  if (key.sequence.length === 0) return null;
  if (key.sequence.startsWith("\x1b") && key.sequence === key.raw) return null;
  return key.sequence;
}
