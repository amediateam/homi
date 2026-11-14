import { describe, expect, it } from "vitest";

/** The root setup file (`vitest.setup.ts`) must stop a unit test before it reaches the network (DEC-33). */
describe("network guard of the unit tests", () => {
  it("rejects an unmocked fetch without sending it", async () => {
    // Port 9 (discard) on the loopback: a real fetch fails here too, but with a different error.
    await expect(fetch("http://127.0.0.1:9/never")).rejects.toThrow(
      "Unmocked fetch in a unit test: http://127.0.0.1:9/never",
    );
  });
});
