import { strict as assert } from "node:assert";
import { PasteEvent } from "@opentui/core";
import { createTestRenderer } from "@opentui/core/testing";

import {
  emptyIssueCreateDraft,
  emptyProjectCreateDraft,
  openOverlay,
  startOverlaySearch,
  type Overlay,
} from "./app-state";
import { MockLinearClient } from "../core/mock-client";
import { LinearTui } from "./tui";

// Exercise the real OpenTUI renderer in the application's Bun runtime.
const { renderer, mockInput } = await createTestRenderer({ width: 100, height: 30 });
let quit = false;
const app = new LinearTui(
  renderer,
  {
    client: new MockLinearClient(),
    workspace: { id: "test", name: "Test", urlKey: "test" },
    mode: "mock",
  },
  () => {
    quit = true;
  },
);

function show(overlay: Overlay): void {
  app["state"] = openOverlay(app["state"], overlay);
}

try {
  for (const kind of ["create-issue", "edit-issue"] as const) {
    const draft = { ...emptyIssueCreateDraft("team"), issueId: "issue", description: "前後" };
    show({ kind, draft, focusedField: "description", editor: "description", cursor: 1 });
    await mockInput.pasteBracketedText("日本語🇯🇵\r\n\tq/?\r\u001b[31m赤\u001b[0m");
    const inserted = "日本語🇯🇵\n\tq/?\n赤";
    assert.deepEqual(app["state"].overlay, {
      kind,
      draft: { ...draft, description: `前${inserted}後` },
      focusedField: "description",
      editor: "description",
      cursor: 1 + inserted.length,
    });

    draft.title = "ab";
    show({ kind, draft, focusedField: "title", editor: "title", cursor: 1 });
    await mockInput.pasteBracketedText("x\r\ny\tz");
    assert.deepEqual(app["state"].overlay, {
      kind,
      draft: { ...draft, title: "ax y zb" },
      focusedField: "title",
      editor: "title",
      cursor: 6,
    });
  }

  for (const editor of ["name", "description", "content"] as const) {
    const draft = emptyProjectCreateDraft("team");
    show({ kind: "create-project", draft, focusedField: editor, editor, cursor: 0 });
    await mockInput.pasteBracketedText("one\r\ntwo\tthree");
    assert.deepEqual(app["state"].overlay, {
      kind: "create-project",
      draft: { ...draft, [editor]: editor === "content" ? "one\ntwo\tthree" : "one two three" },
      focusedField: editor,
      editor,
      cursor: 13,
    });
  }

  for (const mode of ["search", "help", "picker"] as const) {
    app["state"] = { ...app["state"], overlay: null };
    if (mode === "picker") {
      show({ kind: "labels", issueId: "issue", options: [], selectedIndex: 0, selectedIds: [] });
      app["state"] = startOverlaySearch(app["state"]);
    } else {
      app["mode"] = mode;
    }
    await mockInput.pasteBracketedText("q ?/\r\ntext");
    const query =
      mode === "picker"
        ? app["state"].overlaySearch.query
        : mode === "help"
          ? app["helpQuery"]
          : app["state"].query;
    assert.equal(query, "q ?/ text");
    if (mode === "picker") {
      assert.equal(app["state"].overlaySearch.active, true);
      assert.deepEqual(app["state"].overlay, {
        kind: "labels",
        issueId: "issue",
        options: [],
        selectedIndex: 0,
        selectedIds: [],
      });
    } else {
      assert.equal(app["mode"], mode);
    }
  }

  for (const mode of ["list", "fields", "busy"] as const) {
    app["mode"] = "list";
    app["state"] = { ...app["state"], overlay: null };
    if (mode !== "list") {
      show({
        kind: "create-issue",
        draft: emptyIssueCreateDraft("team"),
        focusedField: "title",
        editor: mode === "busy" ? "title" : "fields",
        cursor: 0,
      });
    }
    app["busy"] = mode === "busy";
    const previous = app["state"];
    await mockInput.pasteBracketedText("qn\r\n");
    assert.equal(app["state"], previous);
  }
  app["busy"] = false;
  const previous = app["state"];
  await mockInput.pasteBracketedText("");
  renderer.keyInput.emit(
    "paste",
    new PasteEvent(new TextEncoder().encode("binary"), { kind: "binary" }),
  );
  assert.equal(app["state"], previous);
  assert.equal(quit, false);
} finally {
  renderer.destroy();
}
console.log("TUI paste checks passed");
