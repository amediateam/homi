import { describe, expect, it } from "vitest";

import { isListingDetails, listingKey, placeLine, toRecord } from "@/features/listing/listingData";
import { failureOf } from "@/lib/api/errors";

import { detailsOf } from "../helpers/details";
import { previewOf } from "../helpers/listing";

describe("detailsOf", () => {
  it("holds the texts as the API masks them: no run of the stub number's digits (DEC-52)", () => {
    const strings: string[] = [];
    JSON.stringify(detailsOf(), (_, value: unknown) => {
      if (typeof value === "string") {
        strings.push(value);
      }
      return value;
    });
    const runs = strings.flatMap((value) => value.match(/\d(?:[ \-.()]{0,2}\d)*/g) ?? []).map((run) => run.replace(/\D/g, ""));

    expect(runs.filter((run) => run.length >= 7 && "998000000067".includes(run))).toEqual([]);
    expect(detailsOf().original.text).toContain("+998 ** *** ** 67");
  });
});

describe("listingKey", () => {
  it("is a string key per number", () => {
    expect(listingKey(100001)).toBe("listing:100001");
  });
});

describe("isListingDetails", () => {
  it("tells the details from a preview by their facts", () => {
    expect(isListingDetails(detailsOf())).toBe(true);
    expect(isListingDetails(detailsOf({ facts: [] }))).toBe(true);
    expect(isListingDetails(previewOf())).toBe(false);
  });
});

describe("toRecord", () => {
  it("wraps the details with the answer's source", () => {
    const details = detailsOf();

    expect(toRecord({ ok: true, data: details, meta: { source: "stub" } })).toEqual({
      ok: true,
      data: { listing: details, source: "stub" },
      meta: { source: "stub" },
    });
  });

  it("leaves the source out when the answer has none", () => {
    const record = toRecord({ ok: true, data: detailsOf(), meta: {} });

    expect(record.ok && "source" in record.data).toBe(false);
  });

  it("turns a preview body into a server failure", () => {
    expect(toRecord({ ok: true, data: previewOf(), meta: { source: "stub" } })).toEqual({
      ok: false,
      error: "server",
      status: 500,
      method: "GET",
      path: "listings/:number",
    });
  });

  it("passes a failure on as it is", () => {
    const failure = failureOf({ method: "GET", path: "listings/:number" }, { status: 404, code: "not_found" });

    expect(toRecord(failure)).toBe(failure);
  });
});

describe("placeLine", () => {
  it("joins the district and the landmark", () => {
    expect(placeLine(previewOf())).toBe("Юнусабад · Мегапланет");
    expect(placeLine(previewOf({ landmark: null }))).toBe("Юнусабад");
  });

  it("takes the place when the district is unknown", () => {
    expect(placeLine(previewOf({ district: null, place: "центр города", landmark: null }))).toBe("центр города");
    expect(placeLine(previewOf({ district: null, place: "центр города" }))).toBe("центр города · Мегапланет");
    expect(placeLine(previewOf({ district: null, place: null }))).toBe("Мегапланет");
  });

  it("is null when nothing is known", () => {
    expect(placeLine(previewOf({ district: null, place: null, landmark: null }))).toBeNull();
    expect(placeLine(previewOf({ district: null, place: "", landmark: "" }))).toBeNull();
  });
});
