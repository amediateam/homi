// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { checkBundle, SERVER_MODULES } from "../../scripts/check-bundle.mjs";

let app: string;
/** The legacy brand, spelt in parts: the brand-word scan of `tests/i18n/brand-words.test.ts` covers this file too. */
const LEGACY = ["kva", "dro"].join("");

function put(path: string, text: string) {
  const file = join(app, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}

/** A clean build: one client chunk, one server chunk that may name the scenario cookie no more, the server modules. */
function cleanBuild() {
  put(".env.example", "NEXT_PUBLIC_APP_ENV=\nAPI_URL=\nCSP_TILE_HOSTS=\n");
  put(".next/BUILD_ID", "x");
  put(".next/static/chunks/main.js", 'const api = "NEXT_PUBLIC_API_URL"; console.log(api);');
  put(".next/server/app/page.js", "export const page = 1;");
  for (const name of SERVER_MODULES as string[]) {
    put(name, 'import "server-only";\n\nexport const x = 1;\n');
  }
  put("lib/telegram/sdk.ts", "export const sdk = () => window.Telegram;\n");
  put("lib/telegram/types.ts", "/**\n * The part of `window.Telegram.WebApp` HOMI uses.\n */\nexport type T = 1;\n");
}

beforeEach(() => {
  app = mkdtempSync(join(tmpdir(), "homi-bundle-"));
  cleanBuild();
});

afterEach(() => {
  rmSync(app, { recursive: true, force: true });
});

describe("check-bundle.mjs (WP-33)", () => {
  it("a clean build passes", () => {
    expect(checkBundle(app, {})).toEqual([]);
  });

  it("a planted forbidden string in a client chunk fails and names its row and file", () => {
    put(".next/static/chunks/leak.js", `document.cookie = "homi_stub_scenario=empty"; const brand = "${LEGACY.toUpperCase()}";`);
    expect(checkBundle(app, {})).toEqual([
      "row 4: the stub scenario cookie in .next/static/chunks/leak.js",
      "row 7: the legacy brand in .next/static/chunks/leak.js",
    ]);
  });

  it("the scenario header in server code fails; a server-only key name there does not, nor a server source map", () => {
    put(".next/server/app/route.js", 'headers["X-Stub-Scenario"] = v; const url = process.env.API_URL;');
    put(".next/server/app/route.js.map", '{"sourcesContent":["const c = \\"homi_stub_scenario\\""]}');
    expect(checkBundle(app, {})).toEqual(["row 4: the stub scenario header in .next/server/app/route.js"]);
  });

  it("the legacy catalogue key of the found survey is no brand word; its value, or the word anywhere else, is", () => {
    put(".next/static/chunks/messages.js", `const m={found:{${LEGACY}:"Да, через HOMI"}};t("found.${LEGACY}");const r={"${LEGACY}":"x"};`);
    expect(checkBundle(app, {})).toEqual([]);
    put(".next/static/chunks/value.js", `const m={found:{${LEGACY}:"Да, через ${LEGACY}²"}};`);
    expect(checkBundle(app, {})).toEqual(["row 7: the legacy brand in .next/static/chunks/value.js"]);
  });

  it("a server-only key or its value in client output fails; a short value does not count", () => {
    put(".next/static/chunks/env.js", 'const a = "API_URL"; const b = "https://api.secret.example/api/v1"; const c = "on";');
    expect(checkBundle(app, { API_URL: "https://api.secret.example/api/v1", CSP_TILE_HOSTS: "on" })).toEqual([
      "row 5: the server-only key API_URL in .next/static/chunks/env.js",
      "row 5: a server-only value in .next/static/chunks/env.js",
    ]);
  });

  it("the emulator file, a source map, the fake, the gallery and a legacy key name fail", () => {
    put("public/__dev/telegram-emulator.js", "");
    put(".next/static/chunks/a.js.map", "{}");
    put(".next/static/chunks/b.js", 'window.__homiFakeTelegram; "gallery-open-sheet-full"; "LEGACY_KEY"; "homi-dev-initData"');
    expect(checkBundle(app, {})).toEqual([
      "row 1: public/__dev/telegram-emulator.js exists (run `node dev/build.mjs --clean`)",
      "row 8: a source map .next/static/chunks/a.js.map",
      "row 1: the emulator's storage key in .next/static/chunks/b.js",
      "row 2: the fake Telegram of @homi/testing in .next/static/chunks/b.js",
      "row 3: the gallery of /dev/ui in .next/static/chunks/b.js",
      "row 6: a legacy key name in .next/static/chunks/b.js",
    ]);
  });

  it("the source checks: a server module without server-only, window.Telegram outside the adapter", () => {
    put("lib/api/server.ts", "export const x = 1;\n");
    put("features/feed/Leak.tsx", "export const leak = () => window.Telegram?.WebApp;\n");
    expect(checkBundle(app, {})).toEqual([
      'source: lib/api/server.ts does not start with import "server-only"',
      "source: features/feed/Leak.tsx reads window.Telegram",
    ]);
  });

  it("no build at all is a finding of its own", () => {
    rmSync(join(app, ".next"), { recursive: true });
    expect(checkBundle(app, {})).toEqual([expect.stringMatching(/^no build in .*: run NEXT_PUBLIC_APP_ENV=production pnpm build first$/)]);
  });
});
