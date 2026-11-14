import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The API stub fixtures, shared with the backend: `backend/resources/fixtures/v1/<area>/<name>.json` (WP-10). Built
 * with `node:path`: Vite rewrites `new URL(…, import.meta.url)` into an asset address.
 */
const store = join(dirname(fileURLToPath(import.meta.url)), "../../../../backend/resources/fixtures/v1");

const validName = /^[a-z0-9_-]+(\/[a-z0-9_.-]+)*$/i;

/**
 * Reads an API stub fixture by name, for example `fixture("me/default")`. Throws on a name that does not exist, so a
 * renamed fixture fails the test instead of feeding it `undefined`.
 */
export function fixture<T = unknown>(name: string): T {
  if (!validName.test(name) || name.split("/").includes("..")) {
    throw new Error(`Invalid API fixture name "${name}": use <area>/<name>, for example "me/default"`);
  }
  const file = join(store, `${name}.json`);
  if (!existsSync(file)) {
    throw new Error(`Unknown API fixture "${name}": backend/resources/fixtures/v1/${name}.json does not exist`);
  }
  return JSON.parse(readFileSync(file, "utf8")) as T;
}
