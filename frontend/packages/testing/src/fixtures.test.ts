import { describe, expect, it } from "vitest";

import { fixture } from "./fixtures";

/** The fixture store `backend/resources/fixtures/v1/<area>/<name>.json` is created by WP-10. */
describe("fixture()", () => {
  it("fails loudly on an unknown name", () => {
    expect(() => fixture("nothing/here")).toThrow('Unknown API fixture "nothing/here"');
  });

  it("reads a fixture of the store (WP-11)", () => {
    expect(fixture("me/default")).toMatchObject({ locale: "ru", city: "tashkent", theme: "auto" });
    expect(fixture("reference/default.uz")).toMatchObject({ cities: [{ code: "tashkent", name: "Toshkent" }, {}, {}] });
  });

  it("refuses a name that leaves the fixture store", () => {
    expect(() => fixture("../../../.env")).toThrow("Invalid API fixture name");
  });
});
