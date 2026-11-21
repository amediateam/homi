import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { JOURNAL_EVENTS, track } from "@/lib/analytics/events";

const ROOT = join(__dirname, "..", "..");
const SOURCES = ["app", "features", "lib"];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("the journal's call sites (WP-32, 03 §3.3)", () => {
  const code = SOURCES.flatMap((dir) => files(join(ROOT, dir)))
    .filter((path) => !path.endsWith(join("lib", "analytics", "events.ts")))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
  const called = new Set([...code.matchAll(/\btrack\(\s*"([a-z_]+)"/g)].map((match) => match[1]));

  it("each of the 21 legacy events and the owner form's (WP-81) is tracked somewhere outside the tests", () => {
    expect(JOURNAL_EVENTS).toHaveLength(23);
    expect(JOURNAL_EVENTS.filter((name) => !called.has(name))).toEqual([]);
  });

  it("no other name is tracked", () => {
    expect([...called].filter((name) => !(JOURNAL_EVENTS as readonly string[]).includes(name))).toEqual([]);
  });

  it("an unknown name does not type-check", () => {
    // @ts-expect-error — not a journal event
    const unknown = () => track("not_an_event");
    expect(typeof unknown).toBe("function");
  });
});
