import { afterEach, describe, expect, it, vi } from "vitest";

import { getMessages, labelFor, labelTables, resetI18nReports } from "../src/index";

afterEach(() => resetI18nReports());

type Tree = { [key: string]: string | Tree };

function has(path: string): boolean {
  let node: string | Tree | undefined = getMessages("ru") as Tree;
  for (const segment of path.split(".")) {
    node = typeof node === "object" ? node[segment] : undefined;
  }
  return typeof node === "string";
}

describe("labelFor", () => {
  it("maps every known server value to a key that exists", () => {
    for (const [table, entries] of Object.entries(labelTables)) {
      for (const [value, key] of Object.entries(entries)) {
        expect(labelFor(table as keyof typeof labelTables, value)).toBe(key);
        expect(has(key), `${table}.${value} → ${key}`).toBe(true);
      }
    }
  });

  it("covers the values of the API", () => {
    expect(Object.keys(labelTables.type)).toEqual(["apartment", "house", "room", "commercial", "land"]);
    expect(Object.keys(labelTables.deal)).toEqual(["rent_long", "sale", "rent_daily"]);
    expect(Object.keys(labelTables.radarMode)).toEqual(["instant", "digest"]);
    expect(Object.keys(labelTables.sort)).toEqual(["new", "cheap", "expensive", "deal", "center", "ppm"]);
    expect(Object.keys(labelTables.reportReason)).toEqual(["rented", "agent", "wrong_data", "fraud"]);
    expect(Object.keys(labelTables.verdictTone)).toEqual([
      "good",
      "high",
      "same",
      "mixed",
      "no_repair",
      "suspicious",
      "check",
    ]);
    expect(Object.keys(labelTables.noAccessTitle)).toEqual(["private", "invite", "full", "blocked", "join", "paused"]);
    expect(Object.keys(labelTables.noAccessText)).toEqual(["private", "invite", "full", "blocked", "join", "paused"]);
  });

  it("gives fallback.other for an unknown value and reports it once", () => {
    const report = vi.fn();

    expect(labelFor("type", "villa", report)).toBe("fallback.other");
    expect(labelFor("type", "villa", report)).toBe("fallback.other");
    expect(labelFor("radarMode", "weekly", report)).toBe("fallback.other");

    expect(report).toHaveBeenCalledTimes(2);
    expect(report.mock.calls[0][1]).toEqual({ kind: "i18n", key: "type.villa", code: "UNKNOWN_VALUE" });
  });

  it("never builds a key from the value, even for an inherited property name", () => {
    expect(labelFor("sort", "toString")).toBe("fallback.other");
    expect(labelFor("deal", "__proto__")).toBe("fallback.other");
  });
});
