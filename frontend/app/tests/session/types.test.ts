import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { accessReason, ME_KEYS } from "@/lib/session/types";

const contract = JSON.parse(readFileSync(join(import.meta.dirname, "../../../../docs/api/openapi.json"), "utf8")) as {
  components: { schemas: { MeResource: { required: string[] } } };
};

describe("session types", () => {
  it("Me has exactly the keys of MeResource", () => {
    expect([...ME_KEYS].sort()).toEqual([...contract.components.schemas.MeResource.required].sort());
  });

  it("an unknown or missing access reason is private", () => {
    expect(accessReason("invite")).toBe("invite");
    expect(accessReason("weird")).toBe("private");
    expect(accessReason(undefined)).toBe("private");
  });
});
