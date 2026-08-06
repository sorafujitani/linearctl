import { describe, expect, it } from "vite-plus/test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  configFilePath,
  loadUserConfig,
  parseTeamKey,
  parseUserConfig,
  parseWorkspaceSlug,
  readApiKey,
} from "./config";

describe("readApiKey", () => {
  it("trims and returns LINEAR_API_KEY", () => {
    expect(readApiKey({ LINEAR_API_KEY: "  test-key-not-real  " })).toBe("test-key-not-real");
  });

  it("rejects missing and empty values", () => {
    expect(() => readApiKey({})).toThrow("LINEAR_API_KEY");
    expect(() => readApiKey({ LINEAR_API_KEY: "   " })).toThrow("LINEAR_API_KEY");
  });
});

describe("parseWorkspaceSlug", () => {
  it("accepts slugs that can be used as a Linear urlKey", () => {
    expect(parseWorkspaceSlug(" fs0414 ")).toBe("fs0414");
    expect(parseWorkspaceSlug("my-workspace")).toBe("my-workspace");
  });

  it("rejects whitespace and unsupported symbols", () => {
    expect(() => parseWorkspaceSlug("bad slug")).toThrow("invalid format");
    expect(() => parseWorkspaceSlug("@bad")).toThrow("invalid format");
  });
});

describe("user config", () => {
  it("uses XDG_CONFIG_HOME or the standard home config directory", () => {
    expect(configFilePath({ XDG_CONFIG_HOME: "/tmp/linear-config" }, "/home/test")).toBe(
      "/tmp/linear-config/linearctl/config.json",
    );
    expect(configFilePath({}, "/home/test")).toBe("/home/test/.config/linearctl/config.json");
  });

  it("validates known fields and normalizes the default team key", () => {
    expect(parseUserConfig({ workspace: "fs0414", defaultTeam: "app" })).toEqual({
      workspace: "fs0414",
      defaultTeam: "APP",
    });
    expect(parseTeamKey(" plat ")).toBe("PLAT");
    expect(() => parseUserConfig({ apiKey: "must-not-be-stored" })).toThrow();
  });

  it("loads an optional JSON config and rejects invalid JSON", async () => {
    const root = await mkdtemp(join(tmpdir(), "linearctl-config-"));
    try {
      const directory = join(root, "linearctl");
      await mkdir(directory, { recursive: true });
      await writeFile(
        join(directory, "config.json"),
        JSON.stringify({ workspace: "fs0414", defaultTeam: "grow" }),
      );
      await expect(loadUserConfig({ XDG_CONFIG_HOME: root })).resolves.toEqual({
        workspace: "fs0414",
        defaultTeam: "GROW",
      });
      await writeFile(join(directory, "config.json"), "{");
      await expect(loadUserConfig({ XDG_CONFIG_HOME: root })).rejects.toThrow("Invalid JSON");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
