// Where the Hevy API key comes from: the environment first, then a git-ignored .env in the repo root.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

export type KeySource = "environment" | ".env";
export interface ApiKey { key: string; source: KeySource }

/** The repo root's .env, resolved from this module's location, not the working directory. */
export const REPO_ENV_FILE = fileURLToPath(new URL("../.env", import.meta.url));

function readEnvFile(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/** A key fetch would refuse to send. Its message never contains the key. */
export class MalformedKeyError extends Error {
  readonly source: KeySource;
  constructor(source: KeySource) {
    const where = source === "environment" ? "the HEVY_API_KEY environment variable" : ".env";
    super(`The Hevy API key in ${where} has a line break or other invalid character in it. Copy it again from Hevy → Settings → Developer.`);
    this.name = "MalformedKeyError";
    this.source = source;
  }
}

/** fetch strips outer HTTP whitespace from a header value, then throws, quoting the value, if a CR, LF or NUL is left. */
function checked(apiKey: ApiKey): ApiKey {
  if (/[\0\n\r]/.test(apiKey.key.replace(/^[\t\n\r ]+|[\t\n\r ]+$/g, ""))) throw new MalformedKeyError(apiKey.source);
  return apiKey;
}

/**
 * HEVY_API_KEY from `env` if non-empty, else from the .env file at `envFile` if non-empty, else null. Never throws for a
 * missing .env; throws MalformedKeyError for a key with a CR, LF or NUL inside.
 */
export function resolveApiKey(env: NodeJS.ProcessEnv, envFile: string): ApiKey | null {
  if (env.HEVY_API_KEY) return checked({ key: env.HEVY_API_KEY, source: "environment" });
  // Some Windows editors start the file with a byte-order mark, which would otherwise become part of the first name.
  const text = readEnvFile(envFile)?.replace(/^\uFEFF/, "");
  // parseEnv returns the values without touching process.env.
  const key = text === undefined ? undefined : parseEnv(text).HEVY_API_KEY;
  return key ? checked({ key, source: ".env" }) : null;
}
