import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import brandWords from "@homi/i18n/brand-words.json";
import { describe, expect, it } from "vitest";

/**
 * No legacy brand word under `frontend/app` outside `lib/brand` (WP-20, DEC-40). Build output, dependencies, test
 * reports and local env files are not sources and are skipped.
 */
const appRoot = join(import.meta.dirname, "../..");
const SKIP_DIRS = new Set(["node_modules", ".next", "test-results", "playwright-report", "coverage"]);
const TEXT = /\.(tsx?|mts|mjs|js|json|css|md|svg|txt|html)$|^\.env\.example$/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return SKIP_DIRS.has(name) || relative(appRoot, path) === join("lib", "brand") ? [] : files(path);
    }
    return TEXT.test(name) && !name.startsWith(".env.local") && name !== "tsconfig.tsbuildinfo" ? [path] : [];
  });
}

describe("brand words", () => {
  it("appear nowhere under frontend/app outside lib/brand", () => {
    const patterns = brandWords.patterns.map((pattern) => new RegExp(pattern, "iu"));
    const sources = files(appRoot);
    const hits = sources.filter((path) => patterns.some((pattern) => pattern.test(readFileSync(path, "utf8"))));

    expect(sources.length).toBeGreaterThan(50);
    expect(hits.map((path) => relative(appRoot, path))).toEqual([]);
  });
});
