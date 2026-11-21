// The bundle check of WP-33: what a production build of the Mini App must not contain. Run it after
// `NEXT_PUBLIC_APP_ENV=production next build` (`make bundle-check`, the e2e job of CI):
//
//   node scripts/check-bundle.mjs            # over .next/ of this app; exit 1 with the findings, else 0
//
// The rows of `docs/migration/wave-1/WP-33-frontend-acceptance.md` ("Bundle check"):
//   1 the development emulator (`public/__dev/telegram-emulator.js`, `homi-dev-initData`)     — WP-21
//   2 a module of `@homi/testing` (`__homiFakeTelegram`)                                        — test doubles
//   3 the gallery of WP-23 (`gallery-open-sheet-full`)                                          — development page
//   4 the scenario cookie and header names, also over `.next/server/`                           — non-production
//   5 the server-only keys of `.env.example` and the values they have in this process          — configuration
//   6 `LEGACY_` and `SERVICE_KEY`                                                                — DEC-33
//   7 `kvadro`, any case                                                                         — brand layer
//   8 `*.map` files under `.next/static/`                                                        — no public source maps
// and two source checks: the server modules start with `import "server-only"`, and `window.Telegram` is read only by
// `lib/telegram/sdk.ts`, `boot/` and `dev/`. Client output is `.next/static/` plus the prerendered pages and RSC
// payloads under `.next/server/app/`. The functions are exported for `tests/scripts/checkBundle.test.ts`.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

const APP = join(import.meta.dirname, "..");

/** Files under `dir`, recursively; none when it does not exist. */
export function filesUnder(dir) {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

const TEXT = /\.(?:js|mjs|cjs|css|html|rsc|json|txt|body|meta|map)$/;

/** The client output of a build in `next`: the static chunks and the prerendered pages and payloads. */
export function clientFiles(next) {
  const prerendered = filesUnder(join(next, "server", "app")).filter((file) => /\.(?:html|rsc|body|meta)$/.test(file));
  return [...filesUnder(join(next, "static")), ...prerendered].filter((file) => TEXT.test(file));
}

/** The server code of a build in `next`; its source maps stay on the server and hold the sources' dead branches too. */
export function serverFiles(next) {
  return filesUnder(join(next, "server")).filter((file) => TEXT.test(file) && !file.endsWith(".map"));
}

/** The keys of `.env.example` without `NEXT_PUBLIC_`: server-only configuration. */
export function serverKeys(envExample) {
  return readFileSync(envExample, "utf8")
    .split("\n")
    .map((line) => /^([A-Z][A-Z0-9_]*)=/.exec(line)?.[1])
    .filter((key) => key !== undefined && !key.startsWith("NEXT_PUBLIC_"));
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The rules over built output. `values` are the server-only keys' values in this process: only distinctive ones count
 * (eight characters or more, not a boolean), so `true` or a common host does not match by chance.
 */
export function bundleRules(keys, values) {
  const valueRules = values
    .filter((value) => value.length >= 8 && !/^(?:true|false)$/i.test(value))
    .map((value) => ({ row: 5, name: "a server-only value", pattern: new RegExp(escape(value)) }));
  return [
    { row: 1, name: "the emulator's storage key", pattern: /homi-dev-initData/ },
    { row: 2, name: "the fake Telegram of @homi/testing", pattern: /__homiFakeTelegram/ },
    { row: 3, name: "the gallery of /dev/ui", pattern: /gallery-open-sheet-full/ },
    { row: 4, name: "the stub scenario cookie", pattern: /homi_stub_scenario/, server: true },
    { row: 4, name: "the stub scenario header", pattern: /x-stub-scenario/i, server: true },
    ...keys.map((key) => ({ row: 5, name: `the server-only key ${key}`, pattern: new RegExp(`(?<![A-Z0-9_])${key}(?![A-Z0-9_])`) })),
    ...valueRules,
    { row: 6, name: "a legacy key name", pattern: /LEGACY_|SERVICE_KEY/ },
    // The legacy catalogue's key `found.kvadro` keeps its legacy name (the importer's rule 6 and `keys.json`, WP-20):
    // a key path is never shown, its value is HOMI's. Rule 5 of `25` §2 is about what the interface shows.
    { row: 7, name: "the legacy brand", pattern: /kvadro/i, ignore: /found\.kvadro|\bkvadro(?="?:)/g },
  ];
}

/** The findings of `rules` over `files` (client) and `server` (server code, rows marked `server` only). */
export function scan(rules, files, server, base) {
  const findings = [];
  const check = (file, onServer) => {
    const text = readFileSync(file, "utf8");
    for (const rule of rules) {
      if ((!onServer || rule.server) && rule.pattern.test(rule.ignore ? text.replace(rule.ignore, "") : text)) {
        findings.push(`row ${rule.row}: ${rule.name} in ${relative(base, file)}`);
      }
    }
  };
  for (const file of files) {
    check(file, false);
  }
  for (const file of server) {
    check(file, true);
  }
  return findings;
}

/** Rows 1 and 8: files that must not exist. */
export function forbiddenFiles(app, next) {
  const findings = [];
  if (existsSync(join(app, "public", "__dev", "telegram-emulator.js"))) {
    findings.push("row 1: public/__dev/telegram-emulator.js exists (run `node dev/build.mjs --clean`)");
  }
  for (const file of filesUnder(join(next, "static")).filter((name) => name.endsWith(".map"))) {
    findings.push(`row 8: a source map ${relative(app, file)}`);
  }
  return findings;
}

/** Source code of the app without tests, specs and generated output. */
function sources(app) {
  const skip = new Set(["node_modules", ".next", "tests", "e2e", "public", "scripts"]);
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(entry.name)) {
        continue;
      }
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else if (/\.(?:ts|tsx|mjs|js)$/.test(entry.name)) {
        files.push(path);
      }
    }
  };
  walk(app);
  return files;
}

/** Server modules that must start with `import "server-only"`. */
export const SERVER_MODULES = ["lib/api/server.ts", "lib/session/server.ts", "lib/reference/server.ts", "lib/actions/run.ts"];

/** The places that may read `window.Telegram`: the adapter, the boot script, the emulator. */
const TELEGRAM_READERS = /^(?:lib\/telegram\/sdk\.ts|boot\/|dev\/)/;

/** The two source checks. A line of a comment does not count. */
export function sourceFindings(app) {
  const findings = [];
  for (const name of SERVER_MODULES) {
    const path = join(app, name);
    const first = existsSync(path)
      ? readFileSync(path, "utf8")
          .split("\n")
          .find((line) => line.trim() !== "" && !/^\s*(?:\/\/|\/\*|\*)/.test(line))
      : undefined;
    if (!/^import ["']server-only["'];?$/.test(first?.trim() ?? "")) {
      findings.push(`source: ${name} does not start with import "server-only"`);
    }
  }
  for (const file of sources(app)) {
    const path = relative(app, file).split(sep).join("/");
    if (TELEGRAM_READERS.test(path)) {
      continue;
    }
    const code = readFileSync(file, "utf8")
      .split("\n")
      .filter((line) => !/^\s*(?:\/\/|\/\*|\*)/.test(line));
    if (code.some((line) => line.includes("window.Telegram"))) {
      findings.push(`source: ${path} reads window.Telegram`);
    }
  }
  return findings;
}

/**
 * Every finding of the check over the build of `app`.
 *
 * @param {string} [app]
 * @param {Record<string, string | undefined>} [env]
 */
export function checkBundle(app = APP, env = process.env) {
  const next = join(app, ".next");
  if (!existsSync(join(next, "BUILD_ID")) || !statSync(join(next, "static")).isDirectory()) {
    return [`no build in ${relative(process.cwd(), next) || next}: run NEXT_PUBLIC_APP_ENV=production pnpm build first`];
  }
  const keys = serverKeys(join(app, ".env.example"));
  const values = keys.map((key) => env[key] ?? "").filter((value) => value !== "");
  return [
    ...forbiddenFiles(app, next),
    ...scan(bundleRules(keys, values), clientFiles(next), serverFiles(next), app),
    ...sourceFindings(app),
  ];
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  if (process.env.NEXT_PUBLIC_APP_ENV !== "production") {
    console.error("check-bundle: run it with NEXT_PUBLIC_APP_ENV=production, on a build made with that value");
    process.exit(2);
  }
  const findings = checkBundle();
  if (findings.length > 0) {
    console.error(`check-bundle: ${findings.length} finding(s)\n${findings.map((finding) => `  ${finding}`).join("\n")}`);
    process.exit(1);
  }
  console.log("check-bundle: the production build holds none of the eight rows; the source checks pass");
}
