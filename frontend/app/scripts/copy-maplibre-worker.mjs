// Copies MapLibre's worker and the shared module it imports into public/maplibre/<version>/ (WP-27). Runs from
// `predev` and `prebuild`; the output is gitignored. The bundler cannot serve the worker itself: Turbopack emits
// `maplibre-gl-worker.mjs` as a hashed asset without its `./maplibre-gl-shared.mjs` sibling, so the worker fails
// on its first import (maplibre-gl 6.11.2 `docs/index.md`, "Next.js"). `gl/library.ts` points `setWorkerUrl` at the
// copy. The version in the path lets the production track cache `/maplibre/` for a long time.
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const FILES = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

const require = createRequire(import.meta.url);
// The package exports only "." and "./dist/*", so resolve a dist file rather than its package.json.
const dist = dirname(require.resolve("maplibre-gl/dist/maplibre-gl-worker.mjs"));
const pkgDir = dirname(dist);
const { version } = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
const root = join(import.meta.dirname, "../public/maplibre");

mkdirSync(root, { recursive: true });
for (const entry of readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name !== version)) {
  rmSync(join(root, entry.name), { recursive: true, force: true });
}
mkdirSync(join(root, version), { recursive: true });
for (const file of FILES) {
  copyFileSync(join(dist, file), join(root, version, file));
}
