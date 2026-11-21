/**
 * Stub scenarios (`25` §9, WP-10): outside production the value of the cookie `homi_stub_scenario` travels to the
 * API as `X-Stub-Scenario`, so an end-to-end test can reach the error and empty states of a server-rendered page
 * (WP-22). `NEXT_PUBLIC_APP_ENV` is inlined at build time, so a production build never forwards it. The cached
 * reference calls never forward it.
 */
const FORWARDS = process.env.NEXT_PUBLIC_APP_ENV !== "production";

/**
 * The names are empty in a production build, so the minifier leaves neither in its output (WP-33 bundle check, row 4):
 * an empty cookie name reads nothing.
 */
export const STUB_SCENARIO_COOKIE = FORWARDS ? "homi_stub_scenario" : "";
export const STUB_SCENARIO_HEADER = FORWARDS ? "X-Stub-Scenario" : "";

const SCENARIO = /^[a-z0-9_]{1,40}$/;

/** The scenario to forward, or `null` in production and for anything that is not a scenario name. */
export function stubScenario(value: string | null | undefined): string | null {
  if (process.env.NEXT_PUBLIC_APP_ENV === "production") {
    return null;
  }
  return typeof value === "string" && SCENARIO.test(value) ? value : null;
}

/** The header to add to an API request; empty when there is nothing to forward. */
export function stubScenarioHeaders(value: string | null | undefined): Record<string, string> {
  const scenario = stubScenario(value);
  return scenario === null ? {} : { [STUB_SCENARIO_HEADER]: scenario };
}
