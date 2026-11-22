// @vitest-environment node
import { describe, expect, it } from "vitest";

import { annotatedScreens, coverageFindings, screenIds } from "../../scripts/e2e-coverage.mjs";

const table = [{ id: "SCR-001" }, { id: "SCR-002" }, { id: "SCR-003" }];

/** A listing as `playwright test --list --reporter=json` writes it: files, describes, specs, tests. */
function listing(annotations: Record<string, string[]>) {
  return {
    suites: [
      {
        title: "feed.spec.ts",
        specs: [],
        suites: [
          {
            title: "feed",
            specs: Object.entries(annotations).map(([title, screens]) => ({
              title,
              tests: [{ annotations: screens.map((description) => ({ type: "screen", description })) }],
            })),
          },
        ],
      },
    ],
  };
}

describe("e2e-coverage.mjs (WP-33)", () => {
  it("every screen annotated passes", () => {
    const found = annotatedScreens(listing({ "the feed": ["SCR-001", "SCR-002"], "the listing": ["SCR-003"] }));
    expect(coverageFindings(screenIds(table), found)).toEqual([]);
    expect([...found.get("SCR-003")!]).toEqual(["feed.spec.ts › feed › the listing"]);
  });

  it("removing the annotation of one screen fails and names that screen", () => {
    const found = annotatedScreens(listing({ "the feed": ["SCR-001"], "the listing": ["SCR-003"] }));
    expect(coverageFindings(screenIds(table), found)).toEqual(["SCR-002 has no end-to-end test"]);
  });

  it("an annotation of a screen the table does not have fails; other annotations do not count", () => {
    const withOther = listing({ "the feed": ["SCR-001", "SCR-002", "SCR-099"], "the listing": ["SCR-003"] });
    withOther.suites[0]!.suites[0]!.specs[0]!.tests[0]!.annotations.push({ type: "issue", description: "SCR-004" });
    expect(coverageFindings(screenIds(table), annotatedScreens(withOther))).toEqual(["an annotation names SCR-099, which is not in screens.json"]);
  });
});
