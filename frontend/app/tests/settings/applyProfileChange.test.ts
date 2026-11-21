import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ patchMe: vi.fn<(change: unknown) => void>(), invalidate: vi.fn<(prefix: string) => void>() }));
vi.mock("@/lib/session/bootstrap", () => ({ patchMe: (change: unknown) => state.patchMe(change) }));
vi.mock("@/lib/data/useResource", () => ({ invalidate: (prefix: string) => state.invalidate(prefix) }));

import { feedEpoch } from "@/features/feed/feedQuery";
import { hasFeedScroll, rememberFeedScroll } from "@/features/feed/feedScroll";
import { changeCurrency, changeLanguage, resetProfileChange } from "@/features/settings/applyProfileChange";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  state.patchMe.mockReset();
  state.invalidate.mockReset();
  document.documentElement.lang = "ru";
});

afterEach(() => {
  resetProfileChange();
});

describe("changeLanguage (WP-31, SCR-035; the fix of LB-APP-041)", () => {
  it("gives the profile the locale at once — the locale guard switches the segment — and never reloads", () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });

    changeLanguage("en");

    expect(state.patchMe).toHaveBeenCalledExactlyOnceWith({ locale: "en" });
    expect(reload).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("reads everything again only once the document carries the new language: the feed epoch, its scroll memory, every resource", async () => {
    rememberFeedScroll("feed#key", 400);
    const epoch = feedEpoch();

    changeLanguage("uz");
    await tick();
    expect(state.invalidate).not.toHaveBeenCalled();
    expect(feedEpoch()).toBe(epoch);

    document.documentElement.lang = "uz";
    await tick();
    expect(state.invalidate).toHaveBeenCalledExactlyOnceWith("");
    expect(feedEpoch()).toBe(epoch + 1);
    expect(hasFeedScroll()).toBe(false);

    document.documentElement.lang = "ru";
    document.documentElement.lang = "uz";
    await tick();
    expect(state.invalidate).toHaveBeenCalledTimes(1);
  });

  it("a second language saved before the first arrived waits for its own; uz is `uz`", async () => {
    changeLanguage("en");
    changeLanguage("uz");
    document.documentElement.lang = "en";
    await tick();
    expect(state.invalidate).not.toHaveBeenCalled();

    document.documentElement.lang = "uz";
    await tick();
    expect(state.invalidate).toHaveBeenCalledTimes(1);
    expect(state.patchMe.mock.calls).toEqual([[{ locale: "en" }], [{ locale: "uz" }]]);
  });
});

describe("changeCurrency (WP-31, SCR-036)", () => {
  it("the profile's currency, the server parts again, every read again, the feed included", () => {
    const refresh = vi.fn();
    const epoch = feedEpoch();

    changeCurrency("UZS", refresh);

    expect(state.patchMe).toHaveBeenCalledExactlyOnceWith({ currency: "UZS" });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(state.invalidate).toHaveBeenCalledExactlyOnceWith("");
    expect(feedEpoch()).toBe(epoch + 1);
  });
});
