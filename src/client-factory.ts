import { readApiKey } from "./config";
import { LinearGraphqlClient, type LinearClient } from "./linear-client";
import { MockLinearClient } from "./mock-client";

export type ClientMode = "real" | "mock";

export function createClient(
  mode: ClientMode,
  env: Record<string, string | undefined>,
): LinearClient {
  if (mode === "mock") {
    return new MockLinearClient();
  }
  return new LinearGraphqlClient(readApiKey(env));
}
