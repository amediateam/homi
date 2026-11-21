// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined) }),
}));
vi.mock("next/root-params", () => ({ locale: async () => "ru" }));

const { sendContactRequest } = await import("@/lib/actions/listing");

type Sent = { url: string; method: string; headers: Record<string, string>; body: unknown };
let sent: Sent[] = [];
let answer: () => Response;

const API = "https://api.test/api/v1";
const ok = () => Response.json({ success: true, data: { id: ID }, meta: { source: "stub" } });

const bodyOf = (call: Sent) => JSON.parse(String(call.body)) as Record<string, unknown>;

beforeEach(() => {
  sent = [];
  jar.clear();
  jar.set("homi_session", "cookie-token");
  answer = ok;
  vi.stubEnv("API_URL", API);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL, init: RequestInit) => {
      sent.push({ url: String(url), method: String(init.method), headers: init.headers as Record<string, string>, body: init.body });
      return answer();
    }),
  );
});

/** Every input answers `validation` for `method path` and none of them sends a request. */
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

const INIT = "query_id=1&user=%7B%22id%22%3A1%7D&hash=abc";
const valid = { number: 10000001, who: "couple" as const, people: 2, move_in: " с 1 декабря ", message: "", init_data: INIT };

describe("sendContactRequest (WP-83, SCR-061, DEC-52, DEC-76)", () => {
  it("sends the trimmed body with the launch data and the cookie's token; empty texts go as null", async () => {
    await sendContactRequest(valid);
    expect(sent).toHaveLength(1);
    expect(`${sent[0]!.method} ${sent[0]!.url.replace(API, "")}`).toBe("POST /listings/10000001/contact-request");
    expect(bodyOf(sent[0]!)).toEqual({ who: "couple", people: 2, move_in: "с 1 декабря", message: null, init_data: INIT });
    expect(sent[0]!.headers.Authorization).toBe("Bearer cookie-token");
  });

  it("refuses a bad number, who, count, texts or no launch data without a request", async () => {
    await expectInvalid(
      sendContactRequest,
      [
        { ...valid, number: 0 },
        { ...valid, who: "agents" },
        { ...valid, people: 0 },
        { ...valid, people: 21 },
        { ...valid, people: 2.5 },
        { ...valid, move_in: "x".repeat(33) },
        { ...valid, message: "x".repeat(501) },
        { ...valid, init_data: "" },
        { ...valid, init_data: undefined },
        null,
      ],
      "POST",
      "listings/:number/contact-request",
    );
  });

  it("passes the server's refusal through with its code", async () => {
    answer = () => Response.json({ success: false, message: "no chat", code: "no_chat" }, { status: 409 });
    await expect(sendContactRequest(valid)).resolves.toMatchObject({ ok: false, error: "conflict", code: "no_chat" });
  });
});
