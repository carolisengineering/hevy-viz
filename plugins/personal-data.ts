// Vite plugins that keep your synced Hevy and Apple Health data on your machine:
// served by the dev server, never copied into a build.
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

/**
 * Where `npm run sync` writes personal data. Outside public/ so builds never
 * ship it. Resolved from this file, not the working directory, so the dev
 * server finds it however it's started.
 */
export const SYNCED_DATA_FILE = fileURLToPath(new URL("../data/hevy.json", import.meta.url));

/** Where `npm run health` writes the Apple Health daily figures; same rules as above. */
export const HEALTH_DATA_FILE = fileURLToPath(new URL("../data/health.json", import.meta.url));

/** Personal files that must never sit in public/ (Vite copies all of it into the build), and where each belongs. */
const BLOCKED_PUBLIC_FILES = [
  { file: "data/hevy.json", fix: "Delete it; `npm run sync` now writes to data/hevy.json, which is never built." },
  { file: "data/health.json", fix: "Delete it; `npm run health` writes to data/health.json, which is never built." },
];

type Middleware = (req: unknown, res: ServerResponse, next: () => void) => Promise<void>;

/** Answers with `file` as JSON, or falls through to the next handler when it doesn't exist. */
export function serveJsonFile(file: string): Middleware {
  return async (_req, res, next) => {
    try {
      const body = await readFile(file);
      res.setHeader("content-type", "application/json");
      res.end(body);
    } catch {
      next(); // Not there yet: the app falls back to the sample, or shows its empty state.
    }
  };
}

/** Dev-only: serve the synced files at /data/hevy.json and /data/health.json, as if they lived in public/. */
export function servePersonalData(): Plugin {
  return {
    name: "serve-personal-data",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/data/hevy.json", serveJsonFile(SYNCED_DATA_FILE));
      server.middlewares.use("/data/health.json", serveJsonFile(HEALTH_DATA_FILE));
    },
  };
}

/**
 * Build-only: fail if public/ holds a personal data file (Hevy or Apple Health),
 * since Vite copies everything in public/ into the build.
 */
export function blockPublicPersonalData(): Plugin {
  let publicDir = "";
  return {
    name: "block-public-personal-data",
    apply: "build",
    configResolved(config) {
      publicDir = config.publicDir;
    },
    buildStart() {
      if (!publicDir) return;
      for (const { file, fix } of BLOCKED_PUBLIC_FILES) {
        if (existsSync(join(publicDir, file))) {
          this.error(`public/${file} holds personal data and would be copied into the build. ${fix}`);
        }
      }
    },
  };
}
