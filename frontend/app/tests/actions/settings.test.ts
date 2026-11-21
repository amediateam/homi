// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined) }),
}));
vi.mock("next/root-params", () => ({ locale: async () => "ru" }));

const { sendCardSample, updateSettings } = await import("@/lib/actions/settings");
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

  it("sends the keys present, and nothing it does not know", async () => {
    await updateSettings({ locale: "en", city: "andijan", theme: "dark", currency: "USD", extra: 1 } as never);

    expect(sent[0].body).toEqual({ locale: "en", city: "andijan", theme: "dark", currency: "USD" });
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

describe("updateSettings: the keys of the settings pages (WP-31)", () => {
  it("sends the theme, the currency, the quiet hours (off too), the digest hours and the card style as given", async () => {
    await updateSettings({ theme: "light" });
    await updateSettings({ currency: "UZS" });
    await updateSettings({ quiet_hours: { from: 23, to: 8 } });
    await updateSettings({ quiet_hours: null });
    await updateSettings({ digest_hours: [9, 21] });
    await updateSettings({ card_style: "rich" });
    // uz is `uz` on the v1 wire (`25` §4.5), never `uz_Latn`.
    await updateSettings({ locale: "uz" });

    expect(sent.map((call) => call.body)).toEqual([
      { theme: "light" },
      { currency: "UZS" },
      { quiet_hours: { from: 23, to: 8 } },
      { quiet_hours: null },
      { digest_hours: [9, 21] },
      { card_style: "rich" },
      { locale: "uz" },
    ]);
    expect(sent.every((call) => call.method === "PATCH" && call.url === "https://api.test/api/v1/settings")).toBe(true);
  });

  it("a malformed value of any of them makes no request", async () => {
    const inputs: unknown[] = [
      { theme: "sepia" },
      { currency: "EUR" },
      { quiet_hours: { from: 24, to: 8 } },
      { quiet_hours: { from: 23 } },
      { quiet_hours: "23-08" },
      { quiet_hours: [23, 8] },
      { digest_hours: [] },
      { digest_hours: [9, 24] },
      { digest_hours: "9,21" },
      { card_style: "fancy" },
      { card_style: null },
    ];
    for (const input of inputs) {
      await expect(updateSettings(input as never), JSON.stringify(input)).resolves.toMatchObject({ ok: false, error: "validation" });
    }
    expect(sent).toEqual([]);
  });
});

describe("sendCardSample (WP-31, SCR-048)", () => {
  const answer = (data: unknown) =>
    vi.mocked(fetch).mockImplementationOnce(async (url: URL | RequestInfo, init?: RequestInit) => {
      sent.push({ url: String(url), method: String(init?.method), headers: init?.headers as Record<string, string>, body: init?.body });
      return Response.json({ success: true, data, meta: { source: "stub" } });
    });

  it("POST /settings/card-sample answers { sent }", async () => {
    answer({ sent: true });
    await expect(sendCardSample(null)).resolves.toMatchObject({ ok: true, data: { sent: true } });
    expect(sent.map((call) => [call.method, call.url])).toEqual([["POST", "https://api.test/api/v1/settings/card-sample"]]);

    answer({ sent: false });
    await expect(sendCardSample(null)).resolves.toMatchObject({ ok: true, data: { sent: false } });
  });

  it("an answer without a boolean `sent` counts as not sent (LB-APP-052)", async () => {
    for (const data of [{}, { sent: "yes" }, { sent: 1 }, null]) {
      answer(data);
      await expect(sendCardSample(null), JSON.stringify(data)).resolves.toMatchObject({ ok: true, data: { sent: false } });
    }
  });

  it("a failure comes back as it is; header mode carries the token", async () => {
    vi.mocked(fetch).mockImplementationOnce(async () => Response.json({ success: false, message: "x", code: "server_error" }, { status: 500 }));
    await expect(sendCardSample(null)).resolves.toMatchObject({ ok: false, status: 500 });

    jar.clear();
    answer({ sent: true });
    await sendCardSample(null, { token: "header-token" });
    expect(sent.at(-1)?.headers.Authorization).toBe("Bearer header-token");
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
