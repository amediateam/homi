// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined) }),
}));
vi.mock("next/root-params", () => ({ locale: async () => "ru" }));

const { updateSettings } = await import("@/lib/actions/settings");
const { referenceCode } = await import("@/lib/actions/validate");

const settings = { locale: "uz", currency: "USD", theme: "auto", city: "samarkand", quiet_hours: null, digest_hours: [9, 19], options: {} };

type Sent = { url: string; method: string; headers: Record<string, string>; body: unknown };
let sent: Sent[] = [];

beforeEach(() => {
  sent = [];
  jar.clear();
  jar.set("homi_session", "cookie-token");
  vi.stubEnv("API_URL", "https://api.test/api/v1");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL, init: RequestInit) => {
      sent.push({
        url: String(url),
        method: String(init.method),
        headers: init.headers as Record<string, string>,
        body: typeof init.body === "string" ? JSON.parse(init.body) : init.body,
      });
      return Response.json({ success: true, data: settings, meta: { source: "stub" } });
    }),
  );
});

describe("updateSettings (WP-23)", () => {
  it("sends only the locale", async () => {
    await expect(updateSettings({ locale: "uz" }, undefined, "uz")).resolves.toEqual({ ok: true, data: settings, meta: { source: "stub" } });

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ url: "https://api.test/api/v1/settings", method: "PATCH", body: { locale: "uz" } });
    expect(sent[0].headers["Content-Type"]).toBe("application/json");
    expect(sent[0].headers.Authorization).toBe("Bearer cookie-token");
  });

  it("sends only the city, a code the fixture enum does not name included", async () => {
    await updateSettings({ city: "tashkent_region" });
    await updateSettings({ city: "samarkand" });

    expect(sent.map((call) => call.body)).toEqual([{ city: "tashkent_region" }, { city: "samarkand" }]);
  });

  it("sends both, and nothing it does not know", async () => {
    await updateSettings({ locale: "en", city: "andijan", theme: "dark", currency: "USD" } as never);

    expect(sent[0].body).toEqual({ locale: "en", city: "andijan" });
  });

  it("header mode: the token of the argument", async () => {
    jar.clear();

    await updateSettings({ locale: "ru" }, { token: "header-token" }, "en");

    expect(sent[0].headers.Authorization).toBe("Bearer header-token");
    expect(sent[0].headers["Accept-Language"]).toBe("en");
  });

  it("an input with no key, an unknown locale or a malformed city makes no request", async () => {
    const inputs: unknown[] = [
      {},
      null,
      "uz",
      [],
      { locale: "de" },
      { locale: "uz_Latn" },
      { locale: null },
      { locale: 1 },
      { city: "" },
      { city: "../me" },
      { city: "tash kent" },
      { city: "x".repeat(65) },
      { city: 7 },
      { city: null },
      // One bad key fails the whole input: nothing is half-saved.
      { locale: "uz", city: "tash/kent" },
      { locale: "de", city: "tashkent" },
    ];
    for (const input of inputs) {
      await expect(updateSettings(input as never), JSON.stringify(input)).resolves.toEqual({
        ok: false,
        error: "validation",
        status: 422,
        code: "validation_failed",
        method: "PATCH",
        path: "settings",
      });
    }
    expect(sent).toEqual([]);
  });

  it("without a session makes no request", async () => {
    jar.clear();

    await expect(updateSettings({ locale: "uz" })).resolves.toMatchObject({ ok: false, error: "unauthorized", status: 401 });
    expect(sent).toEqual([]);
  });

  it("a refusal of the API comes back as its UiError", async () => {
    vi.mocked(fetch).mockImplementationOnce(async () => Response.json({ success: false, message: "Invalid", code: "validation_failed" }, { status: 422 }));

    await expect(updateSettings({ city: "nowhere" })).resolves.toMatchObject({ ok: false, error: "validation", status: 422, path: "settings" });
  });
});

describe("validate.referenceCode", () => {
  it("accepts the code shape of @homi/search: word characters, dot and dash, at most 64", () => {
    for (const value of ["tashkent", "tashkent_region", "chilanzar-1", "a.b", "x".repeat(64)]) {
      expect(referenceCode(value), value).toBe(value);
    }
    for (const value of ["", "x".repeat(65), "a b", "a/b", "ташкент", 1, null, undefined]) {
      expect(referenceCode(value), String(value)).toBeNull();
    }
  });
});
