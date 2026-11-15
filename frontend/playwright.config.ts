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
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3001";
const ci = Boolean(process.env.CI);

/**
 * The app server signs in through the API (WP-21): CI starts the API on stubs and sets `API_URL`; on a developer
 * machine it is the local stack, whose mkcert certificate Node trusts through `NODE_EXTRA_CA_CERTS`.
 */
function serverEnv(): Record<string, string> {
  const env: Record<string, string> = { API_URL: process.env.API_URL ?? "https://api.homi.loc/api/v1" };
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
  grepInvert: ci ? /@flaky/ : undefined,
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
