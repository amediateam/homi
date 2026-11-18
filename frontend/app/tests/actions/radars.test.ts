// @vitest-environment node
import { defaultFilters, toRadarFilters } from "@homi/search";
import { beforeEach, describe, expect, it, vi } from "vitest";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined) }),
}));
vi.mock("next/root-params", () => ({ locale: async () => "ru" }));

const { createRadar, deleteRadar, patchRadar, relaxRadar, replaceRadar } = await import("@/lib/actions/radars");

type Sent = { url: string; method: string; headers: Record<string, string>; body: unknown };
let sent: Sent[] = [];
let answer: () => Response = () => Response.json({ success: true, data: { ok: true }, meta: { source: "stub" } });

const ID = "01JD0000000000000000000001";
const FILTERS = toRadarFilters({ ...defaultFilters(), rooms_min: 2, rooms_max: 2 });

const bodyOf = (call: Sent) => JSON.parse(String(call.body)) as Record<string, unknown>;

beforeEach(() => {
  sent = [];
  jar.clear();
  jar.set("homi_session", "cookie-token");
  answer = () => Response.json({ success: true, data: { ok: true }, meta: { source: "stub" } });
  vi.stubEnv("API_URL", "https://api.test/api/v1");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL, init: RequestInit) => {
      sent.push({ url: String(url), method: String(init.method), headers: init.headers as Record<string, string>, body: init.body });
      return answer();
    }),
  );
});

/** Every input of `inputs` answers `validation` for `method path` and none of them sends a request. */
async function expectInvalid(run: (input: never) => Promise<unknown>, inputs: unknown[], method: string, path: string) {
  for (const input of inputs) {
    await expect(run(input as never), JSON.stringify(input) ?? String(input)).resolves.toEqual({
      ok: false,
      error: "validation",
      status: 422,
      code: "validation_failed",
      method,
      path,
    });
  }
  expect(sent).toEqual([]);
}

describe("createRadar (WP-30, subscribe flow step 4)", () => {
  it("POST /radars with the filters and the entry; relaxed is left out when no chip was chosen", async () => {
    await expect(createRadar({ filters: FILTERS, entry: "few" }, undefined, "uz")).resolves.toEqual({ ok: true, data: { ok: true }, meta: { source: "stub" } });
    await createRadar({ filters: FILTERS, entry: "filters", relaxed: null });
    await createRadar({ filters: FILTERS, entry: "filters", relaxed: "price_more" });

    expect(sent.map((call) => [call.method, call.url])).toEqual([
      ["POST", "https://api.test/api/v1/radars"],
      ["POST", "https://api.test/api/v1/radars"],
      ["POST", "https://api.test/api/v1/radars"],
    ]);
    expect(sent[0].headers.Authorization).toBe("Bearer cookie-token");
    expect(sent[0].headers["Accept-Language"]).toBe("uz");
    expect(bodyOf(sent[0])).toEqual({ filters: FILTERS, entry: "few" });
    expect(bodyOf(sent[1])).toEqual({ filters: FILTERS, entry: "filters" });
    expect(bodyOf(sent[2])).toEqual({ filters: FILTERS, entry: "filters", relaxed: "price_more" });
  });

  it("every entry of the contract reaches the body, return and feed included", async () => {
    for (const entry of ["filters", "empty", "few", "prompt", "feed", "return"] as const) {
      await createRadar({ filters: FILTERS, entry });
    }

    expect(sent.map((call) => bodyOf(call).entry)).toEqual(["filters", "empty", "few", "prompt", "feed", "return"]);
  });

  it("normalises the filters again: 25 keys, unknown keys dropped, posted_days as the caller chose", async () => {
    await createRadar({ filters: { deal: "sale", city: "fergana", posted_days: 7, secret: "x" } as never, entry: "empty" });
    await createRadar({ filters: { ...FILTERS, posted_days: null }, entry: "empty" });

    const first = bodyOf(sent[0]).filters as Record<string, unknown>;
    expect(Object.keys(first)).toHaveLength(25);
    expect(first).toMatchObject({ deal: "sale", city: "fergana", posted_days: 7 });
    expect(first).not.toHaveProperty("secret");
    expect((bodyOf(sent[1]).filters as Record<string, unknown>).posted_days).toBeNull();
  });

  it("header mode: the token of the argument reaches the API", async () => {
    jar.clear();

    await createRadar({ filters: FILTERS, entry: "few" }, { token: "header-token" }, "en");

    expect(sent[0].headers.Authorization).toBe("Bearer header-token");
    expect(sent[0].headers["Accept-Language"]).toBe("en");
  });

  it("an input that fails its check makes no request", async () => {
    await expectInvalid(
      createRadar,
      [
        null,
        "radar",
        [],
        {},
        { entry: "few" },
        { filters: FILTERS },
        { filters: {}, entry: "few" },
        { filters: [], entry: "few" },
        { filters: "deal=sale", entry: "few" },
        { filters: FILTERS, entry: "home" },
        { filters: FILTERS, entry: "FEW" },
        { filters: FILTERS, entry: "few", relaxed: "" },
        { filters: FILTERS, entry: "few", relaxed: "Price" },
        { filters: FILTERS, entry: "few", relaxed: "a".repeat(33) },
        { filters: FILTERS, entry: "few", relaxed: 1 },
      ],
      "POST",
      "radars",
    );
  });

  it("without a session makes no request; a conflict comes back with its code", async () => {
    jar.clear();
    await expect(createRadar({ filters: FILTERS, entry: "few" })).resolves.toMatchObject({ ok: false, error: "unauthorized", status: 401 });
    expect(sent).toEqual([]);

    jar.set("homi_session", "cookie-token");
    answer = () => Response.json({ success: false, message: "No chat", code: "no_chat" }, { status: 409 });
    await expect(createRadar({ filters: FILTERS, entry: "few" })).resolves.toEqual({
      ok: false,
      error: "conflict",
      status: 409,
      code: "no_chat",
      method: "POST",
      path: "radars",
    });
  });
});

describe("replaceRadar (WP-30, SCR-029)", () => {
  it("PUT /radars/{id} with the filters and, when chosen, relaxed; no entry", async () => {
    await replaceRadar({ id: ID, filters: FILTERS });
    await replaceRadar({ id: ID.toLowerCase(), filters: FILTERS, relaxed: "districts_all" });

    expect(sent.map((call) => [call.method, call.url])).toEqual([
      ["PUT", `https://api.test/api/v1/radars/${ID}`],
      ["PUT", `https://api.test/api/v1/radars/${ID.toLowerCase()}`],
    ]);
    expect(bodyOf(sent[0])).toEqual({ filters: FILTERS });
    expect(bodyOf(sent[1])).toEqual({ filters: FILTERS, relaxed: "districts_all" });
  });

  it("header mode: the token of the argument", async () => {
    jar.clear();

    await replaceRadar({ id: ID, filters: FILTERS }, { token: "header-token" });

    expect(sent[0].headers.Authorization).toBe("Bearer header-token");
  });

  it("an input that fails its check makes no request", async () => {
    await expectInvalid(
      replaceRadar,
      [
        null,
        { filters: FILTERS },
        { id: ID },
        { id: "not-a-ulid", filters: FILTERS },
        { id: "8" + ID.slice(1), filters: FILTERS },
        { id: ID + "1", filters: FILTERS },
        { id: 1, filters: FILTERS },
        { id: ID, filters: {} },
        { id: ID, filters: FILTERS, relaxed: "bad code" },
      ],
      "PUT",
      "radars/:id",
    );
  });
});

describe("patchRadar (WP-30, BR-APP-048)", () => {
  it("PATCH /radars/{id} with exactly the one change", async () => {
    await patchRadar({ id: ID, active: false });
    await patchRadar({ id: ID, active: true });
    await patchRadar({ id: ID, mode: "digest" });
    await patchRadar({ id: ID, unhide: true });

    expect(sent.every((call) => call.method === "PATCH" && call.url === `https://api.test/api/v1/radars/${ID}`)).toBe(true);
    expect(sent.map(bodyOf)).toEqual([{ active: false }, { active: true }, { mode: "digest" }, { unhide: true }]);
  });

  it("header mode: the token of the argument", async () => {
    jar.clear();

    await patchRadar({ id: ID, mode: "instant" }, { token: "header-token" });

    expect(sent[0].headers.Authorization).toBe("Bearer header-token");
  });

  it("no change, two changes or a bad value makes no request", async () => {
    await expectInvalid(
      patchRadar,
      [
        null,
        { id: ID },
        { active: true },
        { id: "x", active: true },
        { id: ID, active: true, mode: "digest" },
        { id: ID, mode: "digest", unhide: true },
        { id: ID, active: "true" },
        { id: ID, active: 1 },
        { id: ID, mode: "weekly" },
        { id: ID, unhide: false },
        { id: ID, unhide: "yes" },
      ],
      "PATCH",
      "radars/:id",
    );
  });
});

describe("deleteRadar (WP-30)", () => {
  it("DELETE /radars/{id}; the answer is { ask_found }, read strictly", async () => {
    answer = () => Response.json({ success: true, data: { ask_found: true }, meta: { source: "stub" } });
    await expect(deleteRadar({ id: ID })).resolves.toEqual({ ok: true, data: { ask_found: true }, meta: { source: "stub" } });

    answer = () => Response.json({ success: true, data: { ask_found: "yes" }, meta: { source: "stub" } });
    await expect(deleteRadar({ id: ID })).resolves.toMatchObject({ ok: true, data: { ask_found: false } });

    answer = () => new Response(null, { status: 204 });
    await expect(deleteRadar({ id: ID })).resolves.toMatchObject({ ok: true, data: { ask_found: false } });

    expect(sent.map((call) => [call.method, call.url, call.body])).toEqual(
      Array.from({ length: 3 }, () => ["DELETE", `https://api.test/api/v1/radars/${ID}`, undefined]),
    );
  });

  it("header mode: the token of the argument", async () => {
    jar.clear();

    await deleteRadar({ id: ID }, { token: "header-token" });

    expect(sent[0].headers.Authorization).toBe("Bearer header-token");
  });

  it("an id that is not a ULID makes no request", async () => {
    await expectInvalid(deleteRadar, [null, {}, { id: "" }, { id: "01JD" }, { id: 42 }], "DELETE", "radars/:id");
  });

  it("a refusal comes back as its UiError", async () => {
    answer = () => Response.json({ success: false, message: "Not found", code: "not_found" }, { status: 404 });

    await expect(deleteRadar({ id: ID })).resolves.toMatchObject({ ok: false, error: "not_found", status: 404, path: "radars/:id" });
  });
});

describe("relaxRadar (WP-30, «Расширить»)", () => {
  it("POST /radars/{id}/relax with the code", async () => {
    await relaxRadar({ id: ID, code: "price_more" });

    expect(sent[0]).toMatchObject({ method: "POST", url: `https://api.test/api/v1/radars/${ID}/relax` });
    expect(bodyOf(sent[0])).toEqual({ code: "price_more" });
  });

  it("header mode: the token of the argument", async () => {
    jar.clear();

    await relaxRadar({ id: ID, code: "districts_all" }, { token: "header-token" });

    expect(sent[0].headers.Authorization).toBe("Bearer header-token");
  });

  it("a code outside ^[a-z_]{1,32}$ or a bad id makes no request", async () => {
    await expectInvalid(
      relaxRadar,
      [
        null,
        { id: ID },
        { code: "price_more" },
        { id: "x", code: "price_more" },
        { id: ID, code: "" },
        { id: ID, code: "Price" },
        { id: ID, code: "price-more" },
        { id: ID, code: "a".repeat(33) },
        { id: ID, code: 7 },
      ],
      "POST",
      "radars/:id/relax",
    );
  });

  it("the switched-off answer comes back as radars_disabled", async () => {
    answer = () => Response.json({ success: false, message: "Radars are off", code: "radars_disabled" }, { status: 403 });

    await expect(relaxRadar({ id: ID, code: "price_more" })).resolves.toMatchObject({ ok: false, error: "radars_disabled", status: 403 });
  });
});
