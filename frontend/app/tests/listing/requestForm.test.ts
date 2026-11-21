import { describe, expect, it } from "vitest";

import { EMPTY_DRAFT, pickWho, requestBody, stepPeople } from "@/features/listing/contact/requestForm";

describe("the request form (WP-83, SCR-061, fix of LB-APP-077)", () => {
  it("a chip sets its count while the stepper is untouched", () => {
    expect(pickWho(EMPTY_DRAFT, "family").people).toBe(3);
    expect(pickWho(pickWho(EMPTY_DRAFT, "family"), "one").people).toBe(1);
  });

  it("a stepper changed by hand keeps its count over a later chip, within 1 … 20", () => {
    const stepped = stepPeople(pickWho(EMPTY_DRAFT, "couple"), 2);
    expect(stepped.people).toBe(4);
    expect(pickWho(stepped, "one").people).toBe(4);
    expect(stepPeople({ ...EMPTY_DRAFT, people: 20 }, 1).people).toBe(20);
    expect(stepPeople(EMPTY_DRAFT, -1).people).toBe(1);
  });

  it("the body: none without a who; trimmed texts, empty ones null, cut to their bounds", () => {
    expect(requestBody(EMPTY_DRAFT)).toBeNull();
    expect(requestBody({ ...pickWho(EMPTY_DRAFT, "students"), moveIn: "  ", message: ` ${"ы".repeat(600)} ` })).toEqual({
      who: "students",
      people: 2,
      move_in: null,
      message: "ы".repeat(500),
    });
  });
});
