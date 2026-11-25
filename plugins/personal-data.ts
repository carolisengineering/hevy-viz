// Vite plugins that keep your synced Hevy data on your machine: served by the
// dev server, never copied into a build.
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
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

/** Where the synced file lived before it moved out of public/. */
const LEGACY_PUBLIC_FILE = "data/hevy.json";

/** Dev-only: serve the synced file at /data/hevy.json, as if it lived in public/. */
export function servePersonalData(): Plugin {
  return {
    name: "serve-personal-data",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/data/hevy.json", async (_req, res, next) => {
        try {
          const body = await readFile(SYNCED_DATA_FILE);
          res.setHeader("content-type", "application/json");
          res.end(body);
        } catch {
          next(); // Not synced yet: the app falls back to the sample.
        }
      });
    },
  };
}

/**
 * Build-only: fail if public/ still holds a synced file from before it moved,
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
      if (publicDir && existsSync(join(publicDir, LEGACY_PUBLIC_FILE))) {
        this.error(
          `public/${LEGACY_PUBLIC_FILE} holds personal workout data and would be copied into the build. ` +
            `Delete it; \`npm run sync\` now writes to data/hevy.json, which is never built.`,
        );
      }
    },
  };
}
