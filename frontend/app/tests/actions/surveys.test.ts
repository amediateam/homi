// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined) }),
  headers: async () => new Headers(),
}));
vi.mock("next/root-params", () => ({ locale: async () => "ru" }));

const { sendFound, sendFoundWhere } = await import("@/lib/actions/surveys");

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
      sent.push({ url: String(url), method: String(init.method), headers: init.headers as Record<string, string>, body: init.body });
      return new Response(null, { status: 204 });
    }),
  );
});

const invalid = (path: string) => ({ ok: false, error: "validation", status: 422, code: "validation_failed", method: "POST", path });

describe("sendFound (WP-30, SCR-031, BR-APP-049)", () => {
  it("POST /surveys/found with the answer and the trigger; the 204 is a success with null data", async () => {
    await expect(sendFound({ answer: "homi", trigger: "pause" }, undefined, "uz")).resolves.toEqual({ ok: true, data: null, meta: {} });
    await sendFound({ answer: "stopped", trigger: "delete" });

    expect(sent.map((call) => [call.method, call.url, JSON.parse(String(call.body))])).toEqual([
      ["POST", "https://api.test/api/v1/surveys/found", { answer: "homi", trigger: "pause" }],
      ["POST", "https://api.test/api/v1/surveys/found", { answer: "stopped", trigger: "delete" }],
    ]);
    expect(sent[0].headers.Authorization).toBe("Bearer cookie-token");
    expect(sent[0].headers["Accept-Language"]).toBe("uz");
  });

  it("sends only the two keys of the contract", async () => {
    await sendFound({ answer: "elsewhere", trigger: "pause", radar: "01JD0000000000000000000001" } as never);

    expect(JSON.parse(String(sent[0].body))).toEqual({ answer: "elsewhere", trigger: "pause" });
  });

  it("header mode: the token of the argument reaches the API", async () => {
    jar.clear();

    await sendFound({ answer: "searching", trigger: "delete" }, { token: "header-token" }, "en");

    expect(sent[0].headers.Authorization).toBe("Bearer header-token");
  });

  it("an input that fails its check makes no request", async () => {
    const inputs: unknown[] = [
      null,
      "homi",
      {},
      { answer: "homi" },
      { trigger: "pause" },
      { answer: "kvadro", trigger: "pause" },
      { answer: "homi", trigger: "close" },
      { answer: "HOMI", trigger: "pause" },
    ];
    for (const input of inputs) {
      await expect(sendFound(input as never), JSON.stringify(input)).resolves.toEqual(invalid("surveys/found"));
    }
    expect(sent).toEqual([]);
  });
});

describe("sendFoundWhere (WP-30)", () => {
  it("POST /surveys/found/where with each code of the contract", async () => {
    const codes = ["telegram", "olx", "site", "agent", "friends", "street", "other"] as const;
    for (const where of codes) {
      await expect(sendFoundWhere({ where })).resolves.toMatchObject({ ok: true, data: null });
    }

    expect(sent.map((call) => [call.method, call.url])).toEqual(codes.map(() => ["POST", "https://api.test/api/v1/surveys/found/where"]));
    expect(sent.map((call) => JSON.parse(String(call.body)))).toEqual(codes.map((where) => ({ where })));
  });

  it("header mode: the token of the argument reaches the API", async () => {
    jar.clear();

    await sendFoundWhere({ where: "olx" }, { token: "header-token" });

    expect(sent[0].headers.Authorization).toBe("Bearer header-token");
  });

  it("an input that fails its check makes no request", async () => {
    for (const input of [null, {}, { where: "instagram" }, { where: "" }, { where: 1 }] as unknown[]) {
      await expect(sendFoundWhere(input as never), JSON.stringify(input)).resolves.toEqual(invalid("surveys/found/where"));
    }
    expect(sent).toEqual([]);
  });
});
