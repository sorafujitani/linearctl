import { exists } from "node:fs/promises";
import { resolve } from "node:path";

const candidates =
  process.platform === "win32"
    ? [resolve("dist/linearctl.exe"), resolve("dist/linearctl")]
    : [resolve("dist/linearctl")];

const binary = await (async (): Promise<string> => {
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  throw new Error("dist/linearctl does not exist. Run vp run build first.");
})();

const cleanEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => entry[1] !== undefined && entry[0] !== "LINEAR_API_KEY",
  ),
);
cleanEnvironment["XDG_CONFIG_HOME"] = resolve("test-fixtures/config");

async function run(args: readonly string[]): Promise<string> {
  const process = Bun.spawn([binary, ...args], {
    env: cleanEnvironment,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(
      `Smoke test failed (${args.join(" ")}): ${stderr.trim() || `exit ${exitCode}`}`,
    );
  }
  return stdout;
}

const version = await run(["--version"]);
if (!version.startsWith("linearctl ")) {
  throw new Error(`Unexpected version output: ${version.trim()}`);
}

const auth = await run(["auth", "status", "--mock", "--workspace", "sample-workspace"]);
if (!auth.includes("Authentication: MOCK") || !auth.includes("(sample-workspace)")) {
  throw new Error(`Unexpected mock authentication output: ${auth.trim()}`);
}

const issueList = await run(["issue", "list", "--mock", "--team", "APP", "--json"]);
const issuePayload = JSON.parse(issueList) as { issues: { identifier: string }[] };
if (!issuePayload.issues.some((issue) => issue.identifier.startsWith("APP-"))) {
  throw new Error(`Unexpected mock issue list output: ${issueList.slice(0, 200)}`);
}

const issueView = await run(["issue", "view", "APP-101", "--mock", "--comments", "--json"]);
const viewPayload = JSON.parse(issueView) as { identifier: string; comments: unknown[] };
if (viewPayload.identifier !== "APP-101" || !Array.isArray(viewPayload.comments)) {
  throw new Error(`Unexpected mock issue view output: ${issueView.slice(0, 200)}`);
}

const teamList = await run(["team", "list", "--mock"]);
if (!teamList.includes("APP")) {
  throw new Error(`Unexpected mock team list output: ${teamList.trim()}`);
}

const created = await run([
  "issue",
  "create",
  "--mock",
  "--team",
  "APP",
  "--title",
  "Smoke issue",
  "--priority",
  "high",
]);
if (!created.startsWith("Created APP-")) {
  throw new Error(`Unexpected mock issue create output: ${created.trim()}`);
}

const updated = await run(["issue", "update", "APP-101", "--mock", "--state", "Done"]);
if (!updated.includes("State: Done")) {
  throw new Error(`Unexpected mock issue update output: ${updated.trim()}`);
}

process.stdout.write(`smoke test passed: ${version.trim()} / mock workspace sample-workspace\n`);
