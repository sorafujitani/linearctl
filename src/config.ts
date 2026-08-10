import * as v from "valibot";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const apiKeySchema = v.pipe(
  v.string("LINEAR_API_KEY is not set."),
  v.trim(),
  v.minLength(1, "LINEAR_API_KEY is empty."),
);

export const workspaceSlugSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1, "Workspace slug is empty."),
  v.regex(/^[a-z0-9][a-z0-9-]*$/i, "Workspace slug has an invalid format."),
);

const teamKeySchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1, "Default team key is empty."),
  v.regex(/^[a-z0-9][a-z0-9_-]*$/i, "Default team key has an invalid format."),
  v.transform((value) => value.toUpperCase()),
);

const userConfigSchema = v.strictObject({
  workspace: v.optional(workspaceSlugSchema),
  defaultTeam: v.optional(teamKeySchema),
});

export type UserConfig = v.InferOutput<typeof userConfigSchema>;

export function configFilePath(
  env: Record<string, string | undefined>,
  userHome = homedir(),
): string {
  const configHome = env["XDG_CONFIG_HOME"]?.trim() || join(userHome, ".config");
  return join(configHome, "linearctl", "config.json");
}

export function parseUserConfig(input: unknown): UserConfig {
  const result = v.safeParse(userConfigSchema, input);
  if (!result.success) {
    throw new Error(result.issues[0]?.message ?? "The config file is invalid.");
  }
  return result.output;
}

export async function loadUserConfig(
  env: Record<string, string | undefined>,
  userHome = homedir(),
): Promise<UserConfig> {
  const path = configFilePath(env, userHome);
  let contents: string;
  try {
    contents = await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return {};
    throw error;
  }
  let input: unknown;
  try {
    input = JSON.parse(contents);
  } catch {
    throw new Error(`Invalid JSON in config file: ${path}`);
  }
  try {
    return parseUserConfig(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The config file is invalid.";
    throw new Error(`Invalid config file ${path}: ${message}`);
  }
}

export function parseTeamKey(value: string): string {
  const result = v.safeParse(teamKeySchema, value);
  if (!result.success) {
    throw new Error(result.issues[0]?.message ?? "Check the team key.");
  }
  return result.output;
}

export function readApiKey(env: Record<string, string | undefined>): string {
  const result = v.safeParse(apiKeySchema, env["LINEAR_API_KEY"]);
  if (!result.success) {
    throw new Error(result.issues[0]?.message ?? "Check LINEAR_API_KEY.");
  }
  return result.output;
}

export function parseWorkspaceSlug(value: string): string {
  const result = v.safeParse(workspaceSlugSchema, value);
  if (!result.success) {
    throw new Error(result.issues[0]?.message ?? "Check the workspace slug.");
  }
  return result.output;
}
