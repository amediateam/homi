import { execFileSync } from "node:child_process";

import { defineConfig } from "@playwright/test";

/**
 * End-to-end tests (WP-03). Without `E2E_BASE_URL` Playwright builds and starts `app` on port 3001; with it the
 * suite runs against that address (for example `https://app.homi.loc` of the local stack). Specs import `test` from
 * `@homi/testing/playwright`, whose guard fails a test that sends a request to an external host.
 *
 * - `miniapp`: the Mini App in a phone-sized Telegram webview.
 * - `landing-desktop`, `landing-phone`: declared, empty until WP-61 adds the specs and the `landing` web server.
 * - Tests tagged `@flaky` are left out of CI runs (`15` §5.5).
 * - Tests tagged `@radars-off` (WP-30, DEC-51) need an API with radars switched off (`RADAR_CREATION_ENABLED=false` in
 *   its env), unlike the default run's: they run only with `E2E_RADARS_OFF=1`, and then alone. The switch is an env
 *   value of this file because a CLI `--grep` filters in addition to the config's `grepInvert`, never instead of it.
 * - Tests tagged `@analytics` (WP-32) need a build with a PostHog key: with `E2E_ANALYTICS=1` the app is built with a
 *   fake key and the unroutable host `ANALYTICS_HOST`, which the specs answer themselves, and only those tests run.
 *   Every other run has no key, so no PostHog code is loaded at all (developer's choice of 2026-11-21: a step of the
 *   existing e2e job, not a job of its own).
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3001";
const ci = Boolean(process.env.CI);
const radarsOff = process.env.E2E_RADARS_OFF === "1";
const analytics = process.env.E2E_ANALYTICS === "1";
/** The PostHog host of the `@analytics` build: never resolvable, answered by the specs (`e2e/analytics.spec.ts`). */
const ANALYTICS_HOST = "https://posthog.e2e.invalid";

/**
 * The app server signs in through the API (WP-21): CI starts the API on stubs and sets `API_URL`; on a developer
 * machine it is the local stack, whose mkcert certificate Node trusts through `NODE_EXTRA_CA_CERTS`.
 */
function serverEnv(): Record<string, string> {
  const env: Record<string, string> = {
    API_URL: process.env.API_URL ?? "https://api.homi.loc/api/v1",
    // The map's raster fallback (WP-27): without it the CSP stops tile fetches before the guard of
    // `@homi/testing/playwright` or a spec's own route can answer them.
    CSP_TILE_HOSTS: process.env.CSP_TILE_HOSTS ?? "https://tile.openstreetmap.org",
  };
  if (analytics) {
    env.NEXT_PUBLIC_POSTHOG_KEY = "phc_e2e_fake_key";
    env.NEXT_PUBLIC_POSTHOG_HOST = ANALYTICS_HOST;
    env.CSP_ANALYTICS_HOSTS = ANALYTICS_HOST;
  }
  if (!ci && process.env.NODE_EXTRA_CA_CERTS === undefined) {
    try {
      env.NODE_EXTRA_CA_CERTS = `${execFileSync("mkcert", ["-CAROOT"], { encoding: "utf8" }).trim()}/rootCA.pem`;
    } catch {
      // No mkcert: the specs that sign in fail with 502 and say so.
    }
  }
  return env;
}

export default defineConfig({
  forbidOnly: ci,
  retries: 0,
  workers: ci ? 1 : undefined,
  reporter: ci ? [["list"], ["html", { open: "never" }]] : "list",
  grep: radarsOff ? /@radars-off/ : analytics ? /@analytics/ : undefined,
  grepInvert: radarsOff || analytics ? (ci ? /@flaky/ : undefined) : ci ? /@radars-off|@analytics|@flaky/ : /@radars-off|@analytics/,
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "miniapp",
      testDir: "./app/e2e",
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
        locale: "ru-RU",
      },
    },
    {
      name: "landing-desktop",
      testDir: "./landing/e2e",
      use: { browserName: "chromium", viewport: { width: 1366, height: 860 } },
    },
    {
      name: "landing-phone",
      testDir: "./landing/e2e",
      use: { browserName: "chromium", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm --filter app build && pnpm --filter app exec next start -p 3001",
        env: serverEnv(),
        url: baseURL,
        reuseExistingServer: !ci,
        timeout: 300_000,
      },
});
