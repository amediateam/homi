import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ListingDetails, ListingInitial, ListingRecord, ListingShowData } from "@/features/listing/listingData";
import type { BffOptions } from "@/lib/api/browser";
import type { ApiFailure, UiError } from "@/lib/api/errors";
import type { ApiResult } from "@/lib/api/types";

type Answer = ApiResult<ListingShowData>;

/** One `bffFetch` the hook sent; the test answers it when it wants. */
interface Sent {
  path: string;
  signal: AbortSignal | undefined;
  resolve: (answer: Answer) => void;
}

const state = vi.hoisted(() => ({
  sent: [] as Sent[],
  status: "ready" as string,
  replace: vi.fn(),
  onForbidden: vi.fn(),
  scrollToTop: vi.fn(),
}));
vi.mock("@/lib/api/browser", () => ({
  bffFetch: (path: string, options: BffOptions = {}) =>
    new Promise<Answer>((resolve) => {
      state.sent.push({ path, signal: options.signal, resolve });
    }),
}));
vi.mock("@/lib/session/SessionProvider", () => ({ useSession: () => ({ status: state.status }) }));
vi.mock("@/lib/session/bootstrap", () => ({ onForbidden: (...args: unknown[]) => state.onForbidden(...args), reauthenticate: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: state.replace }) }));

import { ListingLayerContext, useListing, type UseListingOptions, useListingRecord } from "@/features/listing/useListing";
import { setPreview, resetPreviews } from "@/lib/data/previewCache";
import { isSeen, resetSessionMaps } from "@/lib/data/sessionMaps";
import { resetResources, useResource } from "@/lib/data/useResource";

import { detailsOf } from "../helpers/details";
import { withDevFlags } from "../helpers/flags";
import { previewOf } from "../helpers/listing";

const ok = (details: ListingDetails = detailsOf()): Answer => ({ ok: true, data: details, meta: { source: "stub" } });
const failure = (error: UiError, status = 500): ApiFailure => ({ ok: false, error, status, method: "GET", path: "listings/:number" });
const initialOk = (details: ListingDetails = detailsOf()): ListingInitial => ({
  ok: true,
  data: { listing: details, source: "stub" },
  meta: { source: "stub" },
});

function wrapper({ children }: { children: ReactNode }) {
  return (
    <ListingLayerContext value={{ number: 100001, scrollToTop: state.scrollToTop, reportView: () => {} }}>{children}</ListingLayerContext>
  );
}

function listing(number: number, options: UseListingOptions) {
  return renderHook(({ n, o }) => useListing(n, o), { initialProps: { n: number, o: options }, wrapper });
}

beforeEach(() => {
  state.sent = [];
  state.status = "ready";
  state.replace.mockReset();
  state.onForbidden.mockReset();
  state.scrollToTop.mockReset();
});

afterEach(() => {
  cleanup();
  resetResources();
  resetPreviews();
  resetSessionMaps();
});

describe("useListing (WP-26, SCR-018, SCR-019)", () => {
  it("initial.ok: the details at once, without a browser read", () => {
    const { result } = listing(100001, { initial: initialOk() });

    expect(result.current).toMatchObject({ state: "loaded", source: "stub", details: { number: 100001 } });
    expect(state.sent).toEqual([]);
  });

  it("initial null (header mode): one read through /bff once the session is ready", async () => {
    state.status = "booting";
    const { result, rerender } = listing(100001, { initial: null });
    expect(state.sent).toEqual([]);
    expect(result.current.state).toBe("skeleton");

    state.status = "ready";
    rerender({ n: 100001, o: { initial: null } });
    rerender({ n: 100001, o: { initial: null } });
    expect(state.sent.map((sent) => sent.path)).toEqual(["listings/100001"]);

    await act(async () => state.sent[0].resolve(ok()));
    expect(result.current).toMatchObject({ state: "loaded", source: "stub" });
    expect(state.sent).toHaveLength(1);
  });

  it("an unauthorized server read is read again through /bff (which signs in again)", () => {
    listing(100001, { initial: failure("unauthorized", 401) });

    expect(state.sent.map((sent) => sent.path)).toEqual(["listings/100001"]);
  });

  it("a preview of the card while the answer is pending, else the skeleton", () => {
    setPreview(100001, previewOf());
    const { result } = listing(100001, { initial: null });
    expect(result.current).toMatchObject({ state: "preview", preview: { number: 100001 } });
    cleanup();

    expect(listing(100002, { initial: null }).result.current.state).toBe("skeleton");
  });

  it("the fallback instance never reads; it shows what the resource holds", () => {
    const fallback = listing(100001, {});
    expect(fallback.result.current.state).toBe("skeleton");
    expect(state.sent).toEqual([]);

    listing(100001, { initial: initialOk() });

    expect(fallback.result.current.state).toBe("loaded");
    expect(state.sent).toEqual([]);
  });

  it("a preview body (never asked for) is a server failure", async () => {
    const { result } = listing(100001, { initial: null });

    await act(async () => state.sent[0].resolve({ ok: true, data: previewOf(), meta: {} }));

    expect(result.current.state).toBe("server");
  });

  describe("each UiError → its state", () => {
    const cases: [UiError, string][] = [
      ["not_found", "not_found"],
      ["offline", "offline"],
      ["timeout", "offline"],
      ["server", "server"],
      ["source_unavailable", "server"],
      ["rate_limited", "server"],
      ["forbidden", "server"],
      ["conflict", "server"],
      ["validation", "server"],
      ["radars_disabled", "server"],
      ["unauthorized", "server"],
    ];

    it.each(cases)("read through /bff: %s → %s", async (error, expected) => {
      const { result } = listing(100001, { initial: null });

      await act(async () => state.sent[0].resolve(failure(error)));

      expect(result.current.state).toBe(expected);
    });

    it.each(cases.filter(([error]) => error !== "unauthorized"))(
      "from the server: %s → %s, without a browser read",
      (error, expected) => {
        setPreview(100001, previewOf());

        const { result } = listing(100001, { initial: failure(error) });

        expect(result.current.state).toBe(expected);
        expect(state.sent).toEqual([]);
      },
    );
  });

  it("a different number in the answer seeds that number and replaces the address once, without a second read", async () => {
    const { result, rerender } = listing(100016, { initial: null });

    await act(async () => state.sent[0].resolve(ok(detailsOf({ number: 100001 }))));
    rerender({ n: 100016, o: { initial: null } });

    expect(state.replace).toHaveBeenCalledTimes(1);
    expect(state.replace).toHaveBeenCalledWith("/listing/100001");
    expect(result.current.state).toBe("loaded");

    const target = renderHook(() => useResource<ListingRecord>("listing:100001", vi.fn(), {}));
    expect(target.result.current).toMatchObject({ status: "success", data: { listing: { number: 100001 } } });
    expect(listing(100001, { initial: null }).result.current.state).toBe("loaded");
    expect(state.sent).toHaveLength(1);
  });

  it("an answer for a number already left is dropped", async () => {
    const { result, rerender } = listing(100001, { initial: null });

    rerender({ n: 100002, o: { initial: null } });
    expect(state.sent[0].signal?.aborted).toBe(true);
    await act(async () => state.sent[0].resolve(ok()));

    expect(result.current.state).toBe("skeleton");
    await act(async () => state.sent[1].resolve(ok(detailsOf({ number: 100002 }))));
    expect(result.current).toMatchObject({ state: "loaded", details: { number: 100002 } });
  });

  describe("«Повторить»", () => {
    it("reads through /bff, scrolls the layer to the top and shows the preview while in flight", async () => {
      setPreview(100001, previewOf());
      const { result } = listing(100001, { initial: failure("source_unavailable", 503) });
      expect(result.current.state).toBe("server");

      act(() => (result.current as { retry: () => void }).retry());

      expect(state.scrollToTop).toHaveBeenCalledTimes(1);
      expect(state.sent.map((sent) => sent.path)).toEqual(["listings/100001"]);
      expect(result.current.state).toBe("preview");

      await act(async () => state.sent[0].resolve(ok()));
      expect(result.current.state).toBe("loaded");
      expect(state.sent).toHaveLength(1);
    });

    it("shows the skeleton while in flight without a preview", () => {
      const { result } = listing(100001, { initial: failure("offline", 0) });

      act(() => (result.current as { retry: () => void }).retry());

      expect(result.current.state).toBe("skeleton");
    });

    it("once retried, the server's failure no longer counts: only the read's", async () => {
      const { result } = listing(100001, { initial: failure("server") });

      act(() => (result.current as { retry: () => void }).retry());
      await act(async () => state.sent[0].resolve(failure("offline", 0)));

      expect(result.current.state).toBe("offline");
    });

    it("a fetched failure is read again", async () => {
      const { result } = listing(100001, { initial: null });
      await act(async () => state.sent[0].resolve(failure("timeout", 0)));

      act(() => (result.current as { retry: () => void }).retry());
      await act(async () => state.sent[1].resolve(ok()));

      expect(state.sent).toHaveLength(2);
      expect(result.current.state).toBe("loaded");
    });
  });

  describe("an opening after one whose read failed (the failure leaves with its last user)", () => {
    async function failedOpening() {
      const first = listing(100001, { initial: null });
      await act(async () => state.sent[0].resolve(failure("server")));
      expect(first.result.current.state).toBe("server");
      first.unmount();
    }

    it("initial.ok: the details at once, without a browser read", async () => {
      await failedOpening();

      const { result } = listing(100001, { initial: initialOk() });

      expect(result.current).toMatchObject({ state: "loaded", details: { number: 100001 } });
      expect(state.sent).toHaveLength(1);
    });

    it("header mode: the skeleton while its new read runs; the fallback: the card's preview, not the old error", async () => {
      await failedOpening();

      const { result } = listing(100001, { initial: null });
      expect(result.current.state).toBe("skeleton");
      expect(state.sent).toHaveLength(2);

      setPreview(100001, previewOf());
      expect(listing(100001, {}).result.current.state).toBe("preview");
    });
  });

  describe("a server 403 with dev001AnyForbiddenShowsAccess", () => {
    it("opens the access screen only once the session is ready, and once", () => {
      state.status = "booting";
      const options = withDevFlags({ dev001AnyForbiddenShowsAccess: true }, (flags) => ({ initial: failure("forbidden", 403), flags }));
      const { rerender } = listing(100001, options);
      expect(state.onForbidden).not.toHaveBeenCalled();

      state.status = "ready";
      rerender({ n: 100001, o: options });
      rerender({ n: 100001, o: options });

      expect(state.onForbidden).toHaveBeenCalledTimes(1);
    });

    it("off: the server state, no access screen", () => {
      const { result } = listing(100001, { initial: failure("forbidden", 403) });

      expect(result.current.state).toBe("server");
      expect(state.onForbidden).not.toHaveBeenCalled();
    });
  });

  it("the resolved instance marks the number seen; the fallback does not", () => {
    listing(100001, {});
    expect(isSeen(100001, false)).toBe(false);

    listing(100001, { initial: initialOk() });
    expect(isSeen(100001, false)).toBe(true);
  });
});

describe("useListingRecord (the children)", () => {
  it("reads the listing's resource without a read of its own, the card's preview meanwhile", () => {
    setPreview(100001, previewOf());
    const { result } = renderHook(() => useListingRecord(100001));
    expect(result.current).toEqual({ details: null, preview: previewOf(), source: undefined });

    listing(100001, { initial: initialOk() });

    expect(result.current).toMatchObject({ details: { number: 100001 }, source: "stub" });
    expect(state.sent).toEqual([]);
  });

  it("no number: nothing", () => {
    const { result } = renderHook(() => useListingRecord(null));

    expect(result.current).toEqual({ details: null, preview: null, source: undefined });
  });
});
