import { expect, it } from "vite-plus/test";

import { browserCommand } from "./open-url";

it("builds shell-free browser commands for each supported platform", () => {
  const url = "https://linear.app/sample-workspace/issue/APP-101";

  expect(browserCommand(url, "darwin")).toEqual(["open", url]);
  expect(browserCommand(url, "linux")).toEqual(["xdg-open", url]);
  expect(browserCommand(url, "win32")).toEqual([
    "rundll32.exe",
    "url.dll,FileProtocolHandler",
    url,
  ]);
});

it("rejects URLs that browsers should not receive from issue data", () => {
  expect(() => browserCommand("file:///tmp/issue", "darwin")).toThrow(
    "Unsupported URL protocol: file:",
  );
});
