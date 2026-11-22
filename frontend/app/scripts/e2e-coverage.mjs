// Screens without an end-to-end test (WP-33). Every test carries an annotation `{ type: "screen", description:
// "SCR-0NN" }` for each screen it proves; this script reads the screen table `docs/migration/data/screens.json` and the
// annotations of `playwright test --list --reporter=json`, and fails when a screen has no test or an annotation names
// a screen the table does not have.
//
//   node app/scripts/e2e-coverage.mjs                 # from frontend/: lists every test of every run (E2E_LIST_ALL=1)
//   node app/scripts/e2e-coverage.mjs --json list.json # reads a saved listing instead (used by the unit test)
//
// The listing takes every tag (`E2E_LIST_ALL=1` in `frontend/playwright.config.ts`), so the screens proved only by
// the `@radars-off` or `@analytics` runs count too. The functions are exported for `tests/scripts/e2eCoverage.test.ts`.
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND = join(import.meta.dirname, "..", "..");
const SCREENS = join(FRONTEND, "..", "docs", "migration", "data", "screens.json");

/** The screen identifiers of the table. */
export function screenIds(table) {
  return table.map((screen) => screen.id).filter((id) => typeof id === "string");
}

/** Every `screen` annotation of a JSON listing, as `id → test titles`. */
export function annotatedScreens(listing) {
  const found = new Map();
  const walk = (suite, titles) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        for (const annotation of test.annotations ?? []) {
          if (annotation.type === "screen" && typeof annotation.description === "string") {
            const tests = found.get(annotation.description) ?? new Set();
            tests.add([...titles, spec.title].filter(Boolean).join(" › "));
            found.set(annotation.description, tests);
          }
        }
      }
    }
    for (const child of suite.suites ?? []) {
      walk(child, [...titles, child.title]);
    }
  };
  for (const suite of listing.suites ?? []) {
    walk(suite, [suite.title]);
  }
  return found;
}

/** The findings: screens without a test, then annotations of unknown screens. */
export function coverageFindings(ids, found) {
  const known = new Set(ids);
  return [
    ...ids.filter((id) => !found.has(id)).map((id) => `${id} has no end-to-end test`),
    ...[...found.keys()].filter((id) => !known.has(id)).map((id) => `an annotation names ${id}, which is not in screens.json`),
  ];
}

function listing() {
  const json = process.argv.indexOf("--json");
  if (json !== -1) {
    return JSON.parse(readFileSync(process.argv[json + 1], "utf8"));
  }
  const out = execFileSync("pnpm", ["exec", "playwright", "test", "--list", "--reporter=json", "--project=miniapp-cookie"], {
    cwd: FRONTEND,
    encoding: "utf8",
    env: { ...process.env, E2E_LIST_ALL: "1" },
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(out.slice(out.indexOf("{")));
}

/** Whether this file was started as the script. Node resolves symlinks for the main module, so the started path is
 * compared by its real path: through a symlinked checkout the guard would otherwise be false, and the script would print
 * nothing and exit 0. */
function startedAsScript() {
  try {
    return process.argv[1] !== undefined && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (startedAsScript()) {
  const ids = screenIds(JSON.parse(readFileSync(SCREENS, "utf8")));
  const found = annotatedScreens(listing());
  const findings = coverageFindings(ids, found);
  if (findings.length > 0) {
    console.error(`e2e-coverage: ${findings.length} finding(s)\n${findings.map((finding) => `  ${finding}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`e2e-coverage: all ${ids.length} screens have an end-to-end test`);
}
