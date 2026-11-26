// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined) }),
  headers: async () => new Headers(),
}));
vi.mock("next/root-params", () => ({ locale: async () => "ru" }));

const { getContact, prepareShare, translate } = await import("@/lib/actions/listing");

type Sent = { url: string; method: string; headers: Record<string, string>; body: unknown };
let sent: Sent[] = [];
let answer: unknown = null;

beforeEach(() => {
  sent = [];
  answer = null;
  jar.clear();
  jar.set("homi_session", "cookie-token");
  vi.stubEnv("API_URL", "https://api.test/api/v1");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL, init: RequestInit) => {
      sent.push({ url: String(url), method: String(init.method), headers: init.headers as Record<string, string>, body: init.body });
      return Response.json({ success: true, data: answer, meta: { source: "stub" } });
    }),
  );
});

/** Inputs that are not `{ number }` with a positive safe integer. */
const INVALID: unknown[] = [null, 42, "42", [], {}, { number: 0 }, { number: -1 }, { number: 1.5 }, { number: "42" }, { number: Number.NaN }, { number: 2 ** 53 }];

describe("getContact (WP-26, DEC-52)", () => {
  it("POST /listings/{number}/contact, with no body, as the session's user", async () => {
    answer = { call_url: "https://api.homi.loc/call/stub-token-100001", expires_at: "2026-11-17T12:10:00Z", phone: "+998000000067", phone_display: "+998 00 000-00-67" };

    await expect(getContact({ number: 100001 }, undefined, "uz")).resolves.toEqual({ ok: true, data: answer, meta: { source: "stub" } });

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ url: "https://api.test/api/v1/listings/100001/contact", method: "POST", body: undefined });
    expect(sent[0].headers.Authorization).toBe("Bearer cookie-token");
    expect(sent[0].headers["Accept-Language"]).toBe("uz");
  });

  it("header mode: the token of the argument", async () => {
    jar.clear();

    await getContact({ number: 100001 }, { token: "header-token" }, "en");

    expect(sent[0].headers.Authorization).toBe("Bearer header-token");
  });

  it("a refusal of the API comes back as its UiError", async () => {
    vi.mocked(fetch).mockImplementationOnce(async () => Response.json({ success: false, message: "No contact", code: "contact_unavailable" }, { status: 404 }));

    await expect(getContact({ number: 100015 })).resolves.toEqual({
      ok: false,
      error: "not_found",
      status: 404,
      code: "contact_unavailable",
      method: "POST",
      path: "listings/:number/contact",
    });
  });

  it("without a session makes no request", async () => {
    jar.clear();

    await expect(getContact({ number: 100001 })).resolves.toMatchObject({ ok: false, error: "unauthorized", status: 401 });
    expect(sent).toEqual([]);
  });
});

describe("translate and prepareShare (WP-26)", () => {
  it("translate: POST /listings/{number}/translation in the locale of the call", async () => {
    answer = { text: "2 xonali kvartira", locale: "uz" };

    await expect(translate({ number: 100001 }, undefined, "uz")).resolves.toEqual({ ok: true, data: answer, meta: { source: "stub" } });

    expect(sent.map((call) => [call.method, call.url, call.headers["Accept-Language"]])).toEqual([
      ["POST", "https://api.test/api/v1/listings/100001/translation", "uz"],
    ]);
  });

  it("prepareShare: POST /listings/{number}/share", async () => {
    answer = { prepared_message_id: "stub-prepared-100001", expires_at: "2026-11-17T13:00:00Z" };

    await expect(prepareShare({ number: 100001 })).resolves.toEqual({ ok: true, data: answer, meta: { source: "stub" } });

    expect(sent.map((call) => [call.method, call.url])).toEqual([["POST", "https://api.test/api/v1/listings/100001/share"]]);
  });

  it("an unknown locale falls back to ru", async () => {
    await translate({ number: 100001 }, undefined, "de");

    expect(sent[0].headers["Accept-Language"]).toBe("ru");
  });
});

describe("the input check of the three actions", () => {
  it("an input that fails its check makes no request and answers validation", async () => {
    const actions = [
      [getContact, "listings/:number/contact"],
      [translate, "listings/:number/translation"],
      [prepareShare, "listings/:number/share"],
    ] as const;
    for (const [action, path] of actions) {
      for (const input of INVALID) {
        await expect(action(input as never), `${path} ${JSON.stringify(input)}`).resolves.toEqual({
          ok: false,
          error: "validation",
          status: 422,
          code: "validation_failed",
          method: "POST",
          path,
        });
      }
    }
    expect(sent).toEqual([]);
  });
});
