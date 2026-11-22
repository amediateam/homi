import { test, type Page } from "@playwright/test";

/**
 * Stub scenarios (WP-33, WP-10, WP-22). The app copies the cookie `homi_stub_scenario` into the API's
 * `X-Stub-Scenario` header on its four paths — the server reads of `lib/api/server.ts`, the pass-through of
 * `app/bff/[...path]/route.ts`, `bff/session` and the Server Actions — whenever `NEXT_PUBLIC_APP_ENV` is not
 * `production`. One name applies to every stub method that knows it, so a spec sets it right before the action that
 * needs it and clears it after. The scenario reaches pages and actions rendered on the server too, which a
 * `page.route` of the browser never sees: a state reached this way holds in both session modes.
 */
export const STUB_SCENARIO_COOKIE = "homi_stub_scenario";

/** Sets the scenario of the next requests, or clears it with `null`. */
export async function setScenario(page: Page, name: string | null): Promise<void> {
  const context = page.context();
  if (name === null) {
    await context.clearCookies({ name: STUB_SCENARIO_COOKIE });
    return;
  }
  const url = test.info().project.use.baseURL;
  if (!url) {
    throw new Error("setScenario: the project has no baseURL");
  }
  await context.addCookies([{ name: STUB_SCENARIO_COOKIE, value: name, url }]);
}

/** Runs `action` under the scenario `name` and clears it afterwards, also when `action` throws. */
export async function withScenario<T>(page: Page, name: string, action: () => Promise<T>): Promise<T> {
  await setScenario(page, name);
  try {
    return await action();
  } finally {
    await setScenario(page, null);
  }
}
