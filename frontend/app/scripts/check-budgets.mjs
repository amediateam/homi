// The performance budget check of WP-33: compares what a Playwright run measured (`test-results/perf/*.json`, written
// by the specs of `e2e/perf/` through `e2e/support/perf.ts`) with the limits of `perf-budgets.json`. Run it right
// after the run that measured, because Playwright empties `test-results/` at the start of every run:
//
//   node scripts/check-budgets.mjs --runs pr              # after a pull request's run: rows 3, 4, 5 and 6
//   node scripts/check-budgets.mjs --runs pr,perf         # after the manual run (`full`, DEC-100): also 1, 2, 7 to 10
//   node scripts/check-budgets.mjs --runs analytics       # after the analytics run: row 4 with a key
//   node scripts/check-budgets.mjs --runs perf --results <dir> --budgets <file>
//
// Every row of the named runs must have been measured ("missing" is a row those runs measure and did not, or measured
// fewer times than its `samples`), every measured row must be within its limit, and a measurement of a row the budget
// does not know fails. A row marked `provisional` (a timing limit not yet measured on the machine that judges it,
// DEC-103) is reported, over its limit too, without failing. The report lists every measured value, so the run's log
// carries the numbers a new limit is taken from. Exit 1 with findings, 2 on a wrong call, else 0. The functions are
// exported for `tests/scripts/checkBudgets.test.ts`.
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const APP = join(import.meta.dirname, "..");
export const RUNS = ["pr", "perf", "analytics"];
const AGGREGATES = ["max", "p75"];

/**
 * The budget file: `{ rows: { [row]: { budget, run, unit, aggregate, limit, strict?, samples?, … } } }`. Throws on a
 * row that cannot be judged, so a typo in the file fails the check instead of passing it.
 *
 * @param {string} file
 */
export function readBudgets(file) {
  const budgets = JSON.parse(readFileSync(file, "utf8"));
  for (const [row, budget] of Object.entries(budgets.rows ?? {})) {
    if (!RUNS.includes(budget.run) || !AGGREGATES.includes(budget.aggregate) || typeof budget.limit !== "number" || typeof budget.unit !== "string") {
      throw new Error(`${relative(process.cwd(), file)}: row ${row} needs a run (${RUNS.join(", ")}), an aggregate (${AGGREGATES.join(", ")}), a numeric limit and a unit`);
    }
  }
  return budgets;
}

/**
 * The measurements under `dir`, one JSON file each (`{ row, value, project, test, … }`); none when it does not exist.
 *
 * @param {string} dir
 */
export function readMeasurements(dir) {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => ({ file: name, ...JSON.parse(readFileSync(join(dir, name), "utf8")) }));
}

/**
 * The nearest-rank percentile `p` (0 to 100) of `values`.
 *
 * @param {number[]} values
 * @param {number} p
 */
export function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

/**
 * @param {number[]} values
 * @param {string} how
 */
export function aggregate(values, how) {
  return how === "p75" ? percentile(values, 75) : Math.max(...values);
}

const format = (value, unit) => (unit === "share" ? `${(value * 100).toFixed(1)} %` : `${Number.isInteger(value) ? value : value.toFixed(1)} ${unit}`);

/**
 * Judges `measurements` against `budgets` for a check after the runs `runs`.
 *
 * @param {{ rows: Record<string, { budget?: string, run: string, unit: string, aggregate: string, limit: number, strict?: boolean, samples?: number, provisional?: boolean }> }} budgets
 * @param {{ row: string, value: number, file?: string }[]} measurements
 * @param {string[]} runs
 * @returns {{ findings: string[], report: string[] }}
 */
export function checkBudgets(budgets, measurements, runs) {
  const findings = [];
  const report = [];
  const byRow = new Map();
  for (const measurement of measurements) {
    const row = String(measurement.row);
    if (!(row in budgets.rows)) {
      findings.push(`row ${row}: measured (${measurement.file ?? "a measurement"}) but not in the budget`);
      continue;
    }
    if (typeof measurement.value !== "number" || !Number.isFinite(measurement.value)) {
      findings.push(`row ${row}: a measurement without a number (${measurement.file ?? "a measurement"})`);
      continue;
    }
    byRow.set(row, [...(byRow.get(row) ?? []), measurement.value]);
  }
  for (const [row, budget] of Object.entries(budgets.rows)) {
    const values = byRow.get(row) ?? [];
    const name = budget.budget === undefined ? `row ${row}` : `row ${row} (${budget.budget})`;
    if (values.length === 0) {
      if (runs.includes(budget.run)) {
        findings.push(`${name}: missing — the ${budget.run} run measures it`);
      }
      continue;
    }
    const value = aggregate(values, budget.aggregate);
    const within = budget.strict === true ? value < budget.limit : value <= budget.limit;
    const provisional = budget.provisional === true;
    const of = values.length === 1 ? "" : `, ${budget.aggregate} of ${values.length}`;
    const mark = within ? "ok  " : provisional ? "over" : "OVER";
    const note = provisional ? " (provisional limit: reported, not judged)" : "";
    report.push(`${mark} ${name}: ${format(value, budget.unit)}${of}; limit ${budget.strict === true ? "under " : ""}${format(budget.limit, budget.unit)}${note}`);
    if (!within && !provisional) {
      findings.push(`${name}: ${format(value, budget.unit)}${of} is over the limit of ${format(budget.limit, budget.unit)}`);
    }
    if (budget.samples !== undefined && values.length < budget.samples && runs.includes(budget.run)) {
      findings.push(`${name}: ${values.length} of ${budget.samples} samples — the ${budget.run} run takes ${budget.samples}`);
    }
  }
  return { findings, report };
}

/** `--runs a,b`, `--results <dir>`, `--budgets <file>`. */
function options(argv) {
  const value = (flag) => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };
  const runs = (value("--runs") ?? "").split(",").filter((run) => run !== "");
  return {
    runs,
    results: value("--results") ?? join(APP, "..", "test-results", "perf"),
    budgets: value("--budgets") ?? join(APP, "perf-budgets.json"),
  };
}

/** Whether this file is the script node runs, also when it was started through a symbolic link. */
function isMain() {
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1] ?? "")).href;
  } catch {
    return false;
  }
}

if (isMain()) {
  const { runs, results, budgets } = options(process.argv.slice(2));
  if (runs.length === 0 || runs.some((run) => !RUNS.includes(run))) {
    console.error(`check-budgets: name the runs that measured, from ${RUNS.join(", ")}: --runs pr,perf`);
    process.exit(2);
  }
  const { findings, report } = checkBudgets(readBudgets(budgets), readMeasurements(results), runs);
  console.log(`check-budgets: ${relative(process.cwd(), results) || results} after the run(s) ${runs.join(", ")}`);
  for (const line of report) {
    console.log(`  ${line}`);
  }
  if (findings.length > 0) {
    console.error(`check-budgets: ${findings.length} finding(s)\n${findings.map((finding) => `  ${finding}`).join("\n")}`);
    process.exit(1);
  }
  console.log("check-budgets: every row these runs measure is measured and within its limit");
}
