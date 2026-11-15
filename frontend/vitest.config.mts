import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Unit and component tests of the frontend workspace (WP-03): one project per app and workspace package. Each
 * package runs its own project with `vitest run --config <this file> --project <name>` (Vitest looks for a config
 * only in the working directory); `pnpm test` at the root runs them all.
 *
 * - Time zone: UTC unless the caller sets `TZ` (CI runs `@homi/utils` and `@homi/testing` a second time with
 *   `TZ=Asia/Tashkent`, `15` §3.10). Set here, before the test processes start, so they inherit it.
 * - Network: `vitest.setup.ts` makes every unmocked `fetch` reject (DEC-33).
 * - Only synchronous Server Components and Client Components are unit-tested; async Server Components are covered
 *   end to end (Next.js Vitest guide).
 * - Tests tagged `flaky` are quarantined (`15` §5.5): skipped in every run, so they show in the skipped count.
 */
process.env.TZ ||= "UTC";

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));
const setupFiles = [path("./vitest.setup.ts")];

function app(name: "app" | "landing" | "arm") {
  return {
    plugins: [react()],
    // `server-only` is resolved by Next.js itself and is not installed (data-security.md); tests load an empty module.
    resolve: { tsconfigPaths: true, alias: { "server-only": path("./server-only.test-stub.ts") } },
    test: {
      name,
      root: path(`./${name}`),
      environment: "jsdom" as const,
      include: ["**/*.test.{ts,tsx}"],
      exclude: ["node_modules/**", ".next/**", "e2e/**"],
      setupFiles,
    },
  };
}

function workspacePackage(name: string, environment: "node" | "jsdom") {
  return {
    plugins: environment === "jsdom" ? [react()] : [],
    test: {
      name: `@homi/${name}`,
      root: path(`./packages/${name}`),
      environment,
      include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
      setupFiles,
    },
  };
}

export default defineConfig({
  test: {
    projects: [
      app("app"),
      app("landing"),
      app("arm"),
      workspacePackage("ui", "jsdom"),
      workspacePackage("i18n", "node"),
      workspacePackage("search", "node"),
      workspacePackage("testing", "jsdom"),
      workspacePackage("config", "node"),
      workspacePackage("types", "node"),
      workspacePackage("utils", "node"),
      workspacePackage("api-client", "node"),
    ],
    tags: [{ name: "flaky", description: "Quarantined (15 §5.5): reported as skipped", skip: true }],
    passWithNoTests: true,
    unstubGlobals: true,
    restoreMocks: true,
  },
});
