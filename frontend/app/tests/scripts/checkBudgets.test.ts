// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { checkBudgets, percentile, readBudgets, readMeasurements } from "../../scripts/check-budgets.mjs";

const BUDGETS = {
  rows: {
    "1": { budget: "JavaScript until the feed works", run: "perf", unit: "bytes", aggregate: "max", limit: 1_000 },
    "3": { budget: "map code on the feed", run: "pr", unit: "bytes", aggregate: "max", limit: 0 },
    "4-key": { budget: "PostHog code before the first content", run: "analytics", unit: "bytes", aggregate: "max", limit: 0 },
    "7": { budget: "first card photo", run: "perf", unit: "ms", aggregate: "p75", limit: 1_500, samples: 4 },
    "9": { budget: "frames over 28 ms", run: "perf", unit: "share", aggregate: "max", limit: 0.2, strict: true },
    "8": { budget: "largest paint", run: "perf", unit: "ms", aggregate: "max", limit: 2_500, provisional: true },
  },
};

let dir: string;
let written = 0;

function measure(row: string, value: number, name = `${row}-${(written += 1)}`) {
  writeFileSync(join(dir, "perf", `${name}.json`), JSON.stringify({ row, value, project: "perf", test: name }));
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "homi-budgets-"));
  mkdirSync(join(dir, "perf"));
  writeFileSync(join(dir, "perf-budgets.json"), JSON.stringify(BUDGETS));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const check = (runs: string[]) => checkBudgets(readBudgets(join(dir, "perf-budgets.json")), readMeasurements(join(dir, "perf")), runs);

describe("check-budgets.mjs (WP-33 'Performance budget')", () => {
  it("passes a pull request's run whose rows are measured and within their limits, and reports each value", () => {
    measure("3", 0);
    measure("3", 0);

    const { findings, report } = check(["pr"]);

    expect(findings).toEqual([]);
    expect(report).toEqual(["ok   row 3 (map code on the feed): 0 bytes, max of 2; limit 0 bytes"]);
  });

  it("fails a planted oversize measurement and names the row, the value and the limit", () => {
    measure("3", 0);
    measure("3", 5_120);

    expect(check(["pr"]).findings).toEqual(["row 3 (map code on the feed): 5120 bytes, max of 2 is over the limit of 0 bytes"]);
  });

  it("fails a row the run measures but did not; a row of another run may be absent", () => {
    measure("3", 0);

    expect(check(["pr", "analytics"]).findings).toEqual(["row 4-key (PostHog code before the first content): missing — the analytics run measures it"]);
    expect(check(["pr"]).findings).toEqual([]);
  });

  it("judges a percentile row on the 75th percentile and asks for every sample", () => {
    for (const value of [1_000, 1_100, 1_400, 9_000]) {
      measure("7", value);
    }
    measure("1", 900);
    measure("8", 1_000);
    measure("9", 0.1);

    expect(check(["perf"]).findings).toEqual([]);
    expect(check(["perf"]).report).toContain("ok   row 7 (first card photo): 1400 ms, p75 of 4; limit 1500 ms");

    rmSync(join(dir, "perf"), { recursive: true });
    mkdirSync(join(dir, "perf"));
    measure("1", 900);
    measure("8", 1_000);
    measure("9", 0.1);
    measure("7", 1_000);
    expect(check(["perf"]).findings).toEqual(["row 7 (first card photo): 1 of 4 samples — the perf run takes 4"]);
  });

  it("holds a strict limit as 'under': the limit itself fails", () => {
    measure("1", 900);
    measure("8", 1_000);
    measure("9", 0.2);
    for (const value of [1, 2, 3, 4]) {
      measure("7", value);
    }

    expect(check(["perf"]).findings).toEqual(["row 9 (frames over 28 ms): 20.0 % is over the limit of 20.0 %"]);
  });

  it("fails a measurement of a row the budget does not know, and a budget row it cannot judge", () => {
    measure("11", 0, "11-typo");

    expect(check(["perf"]).findings).toContain("row 11: measured (11-typo.json) but not in the budget");

    writeFileSync(join(dir, "perf-budgets.json"), JSON.stringify({ rows: { "3": { run: "pr", unit: "bytes", aggregate: "mean", limit: 0 } } }));
    expect(() => check(["pr"])).toThrow(/row 3 needs a run/);
  });

  it("reads no measurements from a folder a run never wrote", () => {
    expect(readMeasurements(join(dir, "nothing"))).toEqual([]);
    expect(check(["pr"]).findings).toEqual(["row 3 (map code on the feed): missing — the pr run measures it"]);
  });

  it("reports a provisional row over its limit without failing; a missing one still fails (DEC-103)", () => {
    measure("1", 900);
    measure("9", 0.1);
    for (const value of [1, 2, 3, 4]) {
      measure("7", value);
    }

    expect(check(["perf"]).findings).toEqual(["row 8 (largest paint): missing — the perf run measures it"]);

    measure("8", 4_000);
    const { findings, report } = check(["perf"]);
    expect(findings).toEqual([]);
    expect(report).toContain("over row 8 (largest paint): 4000 ms; limit 2500 ms (provisional limit: reported, not judged)");
  });

  it("takes the nearest-rank percentile", () => {
    expect(percentile([5, 1, 4, 2, 3], 75)).toBe(4);
    expect(percentile([7], 75)).toBe(7);
    expect(percentile(Array.from({ length: 20 }, (_, index) => index + 1), 75)).toBe(15);
  });
});
