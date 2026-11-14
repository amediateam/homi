import { describe, expect, it } from "vitest";

import { SYNTHETIC_HASH, syntheticInitData } from "./initData";

describe("syntheticInitData (SEC-REQ-034)", () => {
  it("carries the fields of a Mini App launch and an obviously fake hash", () => {
    const params = new URLSearchParams(syntheticInitData());

    expect([...params.keys()].sort()).toEqual(["auth_date", "hash", "query_id", "user"]);
    expect(params.get("hash")).toBe(SYNTHETIC_HASH);
    expect(SYNTHETIC_HASH).toMatch(/^0{64}$/);
    expect(JSON.parse(params.get("user") ?? "{}")).toMatchObject({ first_name: "Test", language_code: "ru" });
  });

  it("takes user fields and a start parameter from the test", () => {
    const params = new URLSearchParams(syntheticInitData({ language_code: "uz" }, { startParam: "l_7", authDate: 1_700_000_000 }));

    expect(JSON.parse(params.get("user") ?? "{}")).toMatchObject({ language_code: "uz", first_name: "Test" });
    expect(params.get("start_param")).toBe("l_7");
    expect(params.get("auth_date")).toBe("1700000000");
  });
});
