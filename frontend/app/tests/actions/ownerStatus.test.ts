// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined) }),
  headers: async () => new Headers(),
}));
vi.mock("next/root-params", () => ({ locale: async () => "ru" }));

const { answerRequest, deleteOwnerListing, setOwnerStatus } = await import("@/lib/actions/owner");

type Sent = { url: string; method: string; headers: Record<string, string>; body: unknown };
let sent: Sent[] = [];
let answer: () => Response;

const ID = "01JF0000000000000000000004";
const REQUEST = "01JF0000000000000000000201";
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

describe("the lists' and the requests' actions (WP-82)", () => {
  it("each sends its method and body with the cookie's token", async () => {
    await setOwnerStatus({ id: ID, status: "rented" });
    answer = () => new Response(null, { status: 204 });
    await expect(deleteOwnerListing({ id: ID })).resolves.toMatchObject({ ok: true });
    answer = ok;
    await answerRequest({ id: REQUEST, action: "give" });

    expect(sent.map((call) => `${call.method} ${call.url.replace(API, "")}`)).toEqual([
      `PUT /owner/listings/${ID}/status`,
      `DELETE /owner/listings/${ID}`,
      `POST /owner/requests/${REQUEST}/answer`,
    ]);
    expect(bodyOf(sent[0]!)).toEqual({ status: "rented" });
    expect(bodyOf(sent[2]!)).toEqual({ action: "give" });
    expect(sent.every((call) => call.headers.Authorization === "Bearer cookie-token")).toBe(true);
  });

  it("refuses a bad id, a status outside the four and an unknown action without a request", async () => {
    await expectInvalid(setOwnerStatus, [{ id: "42", status: "paused" }, { id: ID, status: "draft" }, { id: ID }, null], "PUT", "owner/listings/:id/status");
    await expectInvalid(deleteOwnerListing, [{ id: "../x" }, {}, undefined], "DELETE", "owner/listings/:id");
    await expectInvalid(answerRequest, [{ id: REQUEST, action: "call" }, { id: "x", action: "give" }, "give"], "POST", "owner/requests/:id/answer");
  });

  it("passes the server's refusal through with its code", async () => {
    answer = () => Response.json({ success: false, message: "closed", code: "request_answer_closed" }, { status: 409 });
    await expect(answerRequest({ id: REQUEST, action: "undo" })).resolves.toMatchObject({ ok: false, error: "conflict", code: "request_answer_closed" });
  });
});
