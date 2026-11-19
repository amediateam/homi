// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined) }),
}));
vi.mock("next/root-params", () => ({ locale: async () => "ru" }));

const { reportListing } = await import("@/lib/actions/reports");

type Sent = { url: string; method: string; headers: Record<string, string>; body: unknown };
let sent: Sent[] = [];
/** The `data` of the next answer; `undefined` answers an empty 200. */
let answer: unknown = { hidden: false, agent_marked: false };

beforeEach(() => {
  sent = [];
  answer = { hidden: false, agent_marked: false };
  jar.clear();
  jar.set("homi_session", "cookie-token");
  vi.stubEnv("API_URL", "https://api.test/api/v1");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL, init: RequestInit) => {
      sent.push({ url: String(url), method: String(init.method), headers: init.headers as Record<string, string>, body: init.body });
      if (answer === undefined) {
        return new Response("", { status: 200 });
      }
      return Response.json({ success: true, data: answer, meta: { source: "stub" } });
    }),
  );
});

const bodies = () => sent.map((call) => JSON.parse(String(call.body)) as unknown);

describe("reportListing (WP-26, BR-API-101)", () => {
  it("POST /listings/{number}/reports with { reason }", async () => {
    await expect(reportListing({ number: 100001, reason: "rented" }, undefined, "uz")).resolves.toEqual({
      ok: true,
      data: { hidden: false, agent_marked: false },
      meta: { source: "stub" },
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ url: "https://api.test/api/v1/listings/100001/reports", method: "POST" });
    expect(sent[0].headers.Authorization).toBe("Bearer cookie-token");
    expect(sent[0].headers["Accept-Language"]).toBe("uz");
    expect(bodies()).toEqual([{ reason: "rented" }]);
  });

  it("wrong_data carries its detail; no other reason sends a detail key", async () => {
    await reportListing({ number: 100001, reason: "wrong_data", detail: "price" });
    await reportListing({ number: 100001, reason: "agent" });
    await reportListing({ number: 100001, reason: "fraud", detail: undefined });

    expect(bodies()).toEqual([{ reason: "wrong_data", detail: "price" }, { reason: "agent" }, { reason: "fraud" }]);
    expect(String(sent[1].body)).not.toContain("detail");
    expect(String(sent[2].body)).not.toContain("detail");
  });

  it("passes on the hidden flag of the answer", async () => {
    answer = { hidden: true };

    await expect(reportListing({ number: 100001, reason: "fraud" })).resolves.toMatchObject({ ok: true, data: { hidden: true } });
  });

  it("passes on the agent_marked flag of an agent report", async () => {
    answer = { hidden: false, agent_marked: true };

    await expect(reportListing({ number: 100001, reason: "agent" })).resolves.toMatchObject({
      ok: true,
      data: { hidden: false, agent_marked: true },
    });
  });

  it("an empty success counts as not hidden and not marked", async () => {
    for (const empty of [undefined, null, {}, { hidden: "yes", agent_marked: 1 }]) {
      answer = empty;
      await expect(reportListing({ number: 100001, reason: "rented" }), JSON.stringify(empty)).resolves.toMatchObject({
        ok: true,
        data: { hidden: false, agent_marked: false },
      });
    }
  });

  it("header mode: the token of the argument", async () => {
    jar.clear();

    await reportListing({ number: 100001, reason: "agent" }, { token: "header-token" });

    expect(sent[0].headers.Authorization).toBe("Bearer header-token");
  });

  it("a refusal of the API comes back as its UiError", async () => {
    vi.mocked(fetch).mockImplementationOnce(async () => Response.json({ success: false, message: "Too many", code: "rate_limited" }, { status: 429 }));

    await expect(reportListing({ number: 100001, reason: "agent" })).resolves.toEqual({
      ok: false,
      error: "rate_limited",
      status: 429,
      code: "rate_limited",
      method: "POST",
      path: "listings/:number/reports",
    });
  });

  it("an input that fails its check makes no request: wrong_data ⇔ a detail", async () => {
    const inputs: unknown[] = [
      null,
      42,
      [],
      {},
      { number: 100001 },
      { reason: "rented" },
      { number: 0, reason: "rented" },
      { number: 1.5, reason: "rented" },
      { number: "100001", reason: "rented" },
      { number: 100001, reason: "spam" },
      { number: 100001, reason: "RENTED" },
      { number: 100001, reason: null },
      { number: 100001, reason: "wrong_data" },
      { number: 100001, reason: "wrong_data", detail: null },
      { number: 100001, reason: "wrong_data", detail: "colour" },
      { number: 100001, reason: "rented", detail: "price" },
      { number: 100001, reason: "agent", detail: "other" },
      { number: 100001, reason: "fraud", detail: null },
    ];
    for (const input of inputs) {
      await expect(reportListing(input as never), JSON.stringify(input)).resolves.toEqual({
        ok: false,
        error: "validation",
        status: 422,
        code: "validation_failed",
        method: "POST",
        path: "listings/:number/reports",
      });
    }
    expect(sent).toEqual([]);
  });

  it("every detail of wrong_data is accepted", async () => {
    for (const detail of ["price", "rooms", "place", "photos", "other"] as const) {
      await reportListing({ number: 100001, reason: "wrong_data", detail });
    }

    expect(bodies().map((body) => (body as { detail: string }).detail)).toEqual(["price", "rooms", "place", "photos", "other"]);
  });

  it("without a session makes no request", async () => {
    jar.clear();

    await expect(reportListing({ number: 100001, reason: "rented" })).resolves.toMatchObject({ ok: false, error: "unauthorized", status: 401 });
    expect(sent).toEqual([]);
  });
});
