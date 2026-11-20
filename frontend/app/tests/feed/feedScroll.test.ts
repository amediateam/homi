import { afterEach, describe, expect, it } from "vitest";

import {
  feedScrollKey,
  forgetFeedScroll,
  hasFeedScroll,
  peekFeedScroll,
  rememberFeedScroll,
  takeFeedScroll,
} from "@/features/feed/feedScroll";

afterEach(() => forgetFeedScroll());

describe("feedScroll (WP-38, BR-APP-105)", () => {
  const key = feedScrollKey("r1", "city=tashkent|0");

  it("keys a list by its screen instance and its list key", () => {
    expect(key).toBe("r1#city=tashkent|0");
    expect(feedScrollKey("r2", "city=tashkent|0")).not.toBe(key);
  });

  it("remembers one position; peeking leaves it, taking it by its key gives it once", () => {
    rememberFeedScroll(key, 1200);
    expect(hasFeedScroll()).toBe(true);
    expect(peekFeedScroll(key)).toBe(1200);
    expect(takeFeedScroll(key)).toBe(1200);
    expect(takeFeedScroll(key)).toBeNull();
    expect(hasFeedScroll()).toBe(false);
  });

  it("another key restores nothing: peek gives null, take says another list's was stored and drops it", () => {
    rememberFeedScroll(key, 500);
    expect(peekFeedScroll("r1#city=tashkent|1")).toBeNull();
    expect(takeFeedScroll("r1#city=tashkent|1")).toBe("other");
    expect(hasFeedScroll()).toBe(false);
  });

  it("a later position replaces the earlier one; forget drops it", () => {
    rememberFeedScroll(key, 100);
    rememberFeedScroll("r2#city=samarkand|0", 300);
    expect(peekFeedScroll(key)).toBeNull();
    forgetFeedScroll();
    expect(hasFeedScroll()).toBe(false);
  });

  it("stores a position that is not a finite number as the top, and never below 0", () => {
    rememberFeedScroll(key, Number.NaN);
    expect(peekFeedScroll(key)).toBe(0);
    rememberFeedScroll(key, -40);
    expect(peekFeedScroll(key)).toBe(0);
  });
});
