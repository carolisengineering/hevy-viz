// Where the Hevy API key comes from: the environment first, then a git-ignored .env in the repo root.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

export type KeySource = "environment" | ".env";
export interface ApiKey { key: string; source: KeySource }

/** The repo root's .env, resolved from this module's location, not the working directory. */
export const REPO_ENV_FILE = fileURLToPath(new URL("../.env", import.meta.url));

function readEnvFile(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** HEVY_API_KEY from `env` if non-empty, else from the .env file at `envFile` if non-empty, else null. Never throws for a missing .env. */
export function resolveApiKey(env: NodeJS.ProcessEnv, envFile: string): ApiKey | null {
  if (env.HEVY_API_KEY) return { key: env.HEVY_API_KEY, source: "environment" };
  const text = readEnvFile(envFile);
  // parseEnv returns the values without touching process.env.
  const key = text === null ? undefined : parseEnv(text).HEVY_API_KEY;
  return key ? { key, source: ".env" } : null;
}
