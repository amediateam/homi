import { describe, expect, it } from "vitest";

import { cleanSource, errorMessage, errorName, errorSource, limit } from "@/lib/errors/sanitize";

describe("the fields of app_error (WP-32, 03 §1.6, §3.4)", () => {
  it("name: error.name, else the typeof of the thrown value; odd characters removed; at most 40", () => {
    expect(errorName(new TypeError("x"))).toBe("TypeError");
    expect(errorName("a thrown string")).toBe("string");
    expect(errorName({ name: "Chunk Load<Error>" })).toBe("ChunkLoadError");
    expect(errorName({})).toBe("object");
    expect(errorName(undefined)).toBe("undefined");
    expect(errorName({ name: "N".repeat(60) })).toHaveLength(40);
  });

  it("message: of an Error or a thrown string, scrubbed, at most 300", () => {
    expect(errorMessage(new Error("call +998901234567"))).toBe("call +998***");
    expect(errorMessage("boom")).toBe("boom");
    expect(errorMessage(42)).toBe("");
    expect(errorMessage(new Error("m".repeat(400)))).toHaveLength(300);
  });

  it("source: the given one, else the first address of the stack, with :line:col kept and the query and hash removed", () => {
    const error = new Error("x");
    error.stack = "Error: x\n    at f (https://app.homi.uz/_next/static/chunks/a.js?v=3#frag:12:34)\n    at g (https://app.homi.uz/b.js:1:2)";
    expect(errorSource(error)).toBe("https://app.homi.uz/_next/static/chunks/a.js:12:34");

    const bare = new Error("y");
    bare.stack = "Error: y\n    at https://app.homi.uz/c.js?x=1";
    expect(errorSource(bare)).toBe("https://app.homi.uz/c.js");

    expect(errorSource(error, "https://app.homi.uz/given.js?q=1:5:6")).toBe("https://app.homi.uz/given.js:5:6");
    expect(errorSource("thrown string")).toBe("");
    expect(cleanSource(`https://app.homi.uz/${"p".repeat(400)}.js`)).toHaveLength(300);
  });

  it("limit: strings cut, anything else empty", () => {
    expect(limit("abcdef", 3)).toBe("abc");
    expect(limit(5, 3)).toBe("");
    expect(limit(undefined, 3)).toBe("");
  });
});
