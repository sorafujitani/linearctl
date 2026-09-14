import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vite-plus/test";

it("handles terminal paste across editors and searches without executing shortcuts", async () => {
  const { stdout } = await promisify(execFile)("bun", [
    fileURLToPath(new URL("./paste.check.ts", import.meta.url)),
  ]);
  expect(stdout).toContain("TUI paste checks passed");
}, 15_000);
