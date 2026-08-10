import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const targets = [
  "bun-darwin-arm64",
  "bun-darwin-x64",
  "bun-linux-arm64",
  "bun-linux-x64",
  "bun-linux-arm64-musl",
  "bun-linux-x64-musl",
  "bun-windows-x64",
] as const;
type CompileTarget = (typeof targets)[number];

function isCompileTarget(value: string): value is CompileTarget {
  return targets.some((target) => target === value);
}

function optionValue(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

const args = Bun.argv.slice(2);
const requestedTarget = optionValue(args, "--target");
if (requestedTarget !== undefined && !isCompileTarget(requestedTarget)) {
  throw new Error(
    `Unsupported target: ${requestedTarget}\nSupported targets: ${targets.join(", ")}`,
  );
}

const defaultName = requestedTarget?.startsWith("bun-windows")
  ? `linearctl-${requestedTarget.slice("bun-".length)}.exe`
  : requestedTarget === undefined
    ? "linearctl"
    : `linearctl-${requestedTarget.slice("bun-".length)}`;
const outfile = resolve(optionValue(args, "--outfile") ?? `dist/${defaultName}`);
await mkdir(dirname(outfile), { recursive: true });

const define: Record<string, string> = {};
if (requestedTarget?.includes("linux")) {
  define["process.env.OPENTUI_LIBC"] = JSON.stringify(
    requestedTarget.endsWith("-musl") ? "musl" : "glibc",
  );
}

const result = await Bun.build({
  entrypoints: [resolve("src/main.ts")],
  compile:
    requestedTarget === undefined
      ? { outfile }
      : {
          target: requestedTarget,
          outfile,
        },
  define,
  minify: true,
  sourcemap: "none",
});

if (!result.success) {
  for (const log of result.logs) {
    process.stderr.write(`${log.message}\n`);
  }
  process.exit(1);
}

process.stdout.write(`built ${outfile}\n`);
