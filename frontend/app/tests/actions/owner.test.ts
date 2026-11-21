// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined) }),
}));
vi.mock("next/root-params", () => ({ locale: async () => "ru" }));

const { createOwnerListing, deleteOwnerPhoto, orderOwnerPhotos, publishOwnerListing, requestOwnerPhone, setContactMode, updateOwnerListing } =
  await import("@/lib/actions/owner");

type Sent = { url: string; method: string; headers: Record<string, string>; body: unknown };
let sent: Sent[] = [];
let answer: () => Response;

const ID = "01JF0000000000000000000004";
const PHOTO = "01JF0000000000000000000101";
const PHOTO_2 = "01JF0000000000000000000102";
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

describe("the owner form's actions (WP-81)", () => {
  it("each sends its method with the cookie's token, and answers the listing", async () => {
    await expect(createOwnerListing()).resolves.toEqual({ ok: true, data: { id: ID }, meta: { source: "stub" } });
    await updateOwnerListing({ id: ID, fields: { price: 600, currency: "USD", landmark: null, tenants: ["family"] } });
    await deleteOwnerPhoto({ id: ID, photo: PHOTO });
    await orderOwnerPhotos({ id: ID, ids: [PHOTO_2, PHOTO] });
    await setContactMode({ id: ID, mode: "phone" });
    await requestOwnerPhone({ id: ID });
    await publishOwnerListing({ id: ID });

    expect(sent.map((call) => [call.method, call.url])).toEqual([
      ["POST", `${API}/owner/listings`],
      ["PATCH", `${API}/owner/listings/${ID}`],
      ["DELETE", `${API}/owner/listings/${ID}/photos/${PHOTO}`],
      ["PUT", `${API}/owner/listings/${ID}/photos/order`],
      ["PUT", `${API}/owner/listings/${ID}/contact-mode`],
      ["POST", `${API}/owner/listings/${ID}/phone-request`],
      ["POST", `${API}/owner/listings/${ID}/publish`],
    ]);
    expect(bodyOf(sent[1])).toEqual({ price: 600, currency: "USD", landmark: null, tenants: ["family"] });
    expect(bodyOf(sent[3])).toEqual({ ids: [PHOTO_2, PHOTO] });
    expect(bodyOf(sent[4])).toEqual({ mode: "phone" });
    expect(sent.every((call) => call.headers.Authorization === "Bearer cookie-token")).toBe(true);
  });

  it("header mode: the token of the argument reaches the API", async () => {
    jar.clear();
    await publishOwnerListing({ id: ID }, { token: "header-token" });

    expect(sent[0].headers.Authorization).toBe("Bearer header-token");
  });

  it("a refused publish carries its code and the detail the form reads", async () => {
    answer = () => Response.json({ success: false, message: "Rejected", code: "owner_rejected", reason: "limit" }, { status: 409 });
    await expect(publishOwnerListing({ id: ID })).resolves.toMatchObject({ ok: false, error: "conflict", code: "owner_rejected", detail: { reason: "limit" } });

    answer = () => Response.json({ success: false, message: "Limit", code: "owner_limit", limit: "phone", max: 2 }, { status: 409 });
    await expect(createOwnerListing()).resolves.toMatchObject({ code: "owner_limit", detail: { limit: "phone", max: 2 } });

    answer = () => Response.json({ success: false, message: "Invalid", code: "validation_failed", errors: { price: ["x"], photos: ["y"] } }, { status: 422 });
    await expect(publishOwnerListing({ id: ID })).resolves.toMatchObject({ error: "validation", detail: { fields: ["price", "photos"] } });
  });

  it("an input that fails its check makes no request", async () => {
    await expectInvalid(
      updateOwnerListing,
      [
        { id: "x", fields: { price: 1 } },
        { id: ID, fields: {} },
        { id: ID, fields: { unknown: 1 } },
        { id: ID, fields: { price: "600" } },
        { id: ID, fields: { price: 1.5 } },
        { id: ID, fields: { currency: "EUR" } },
        { id: ID, fields: { tenants: ["family", "family"] } },
        { id: ID, fields: { tenants: ["cats"] } },
        { id: ID, fields: { landmark: "x".repeat(121) } },
        { id: ID, fields: { description: "x".repeat(601) } },
        { id: ID, fields: { lat: 91 } },
        { id: ID, fields: { room: "yes" } },
        { id: ID },
        null,
      ],
      "PATCH",
      "owner/listings/:id",
    );
    await expectInvalid(deleteOwnerPhoto, [{ id: ID, photo: "1" }, { id: "1", photo: PHOTO }], "DELETE", "owner/listings/:id/photos/:photo");
    await expectInvalid(
      orderOwnerPhotos,
      [{ id: ID, ids: [] }, { id: ID, ids: [PHOTO, PHOTO] }, { id: ID, ids: [PHOTO, PHOTO.toLowerCase()] }, { id: ID, ids: ["x"] }, { id: ID, ids: Array(11).fill(PHOTO) }],
      "PUT",
      "owner/listings/:id/photos/order",
    );
    await expectInvalid(setContactMode, [{ id: ID, mode: "hidden" }, { id: ID }], "PUT", "owner/listings/:id/contact-mode");
    await expectInvalid(requestOwnerPhone, [{ id: "new" }, {}], "POST", "owner/listings/:id/phone-request");
    await expectInvalid(publishOwnerListing, [{ id: 7 }], "POST", "owner/listings/:id/publish");
    await expectInvalid(createOwnerListing, [{ id: ID }, "x"], "POST", "owner/listings");
  });

  it("null clears a field: every known key takes null", async () => {
    const keys = ["city", "district_code", "landmark", "lat", "lon", "room", "rooms", "area_m2", "floor", "floors_total", "price", "currency", "renovation", "furniture", "tenants", "pets", "description"];
    await updateOwnerListing({ id: ID, fields: Object.fromEntries(keys.map((key) => [key, null])) });

    expect(Object.keys(bodyOf(sent[0]))).toEqual(keys);
  });
});
