import { afterEach, describe, expect, it } from "vitest";

import { firstContentShown, markFirstContent, resetFirstContent } from "@/lib/analytics/firstContent";

afterEach(() => resetFirstContent());

/** Lets every queued promise reaction run (a macrotask after them). */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("markFirstContent (03 SCR-007)", () => {
  it("resolves firstContentShown once, at once for a later caller", async () => {
    let calls = 0;
    void firstContentShown().then(() => {
      calls += 1;
    });

    markFirstContent();
    markFirstContent();
    await firstContentShown();
    await expect(firstContentShown()).resolves.toBeUndefined();

    expect(calls).toBe(1);
  });

  it("stays pending until marked", async () => {
    let shown = false;
    void firstContentShown().then(() => {
      shown = true;
    });

    await flush();
    expect(shown).toBe(false);

    markFirstContent();
    await flush();
    expect(shown).toBe(true);
  });
});
