import { describe, expect, it } from "vitest";

import { formatDateTime, formatPrice } from "./index";

/**
 * Smoke test of the existing formatters (WP-03). CI runs this file twice: with `TZ=UTC` (the configuration
 * default) and with `TZ=Asia/Tashkent`, so a formatter that reads the process time zone fails one of the runs.
 */
describe("@homi/utils formatters", () => {
  it("formats minor units of UZS without fractions", () => {
    // Intl separates the currency code with a no-break space.
    expect(formatPrice(150_000_000, "UZS", "en")).toBe("UZS 1,500,000");
  });

  it("shows API timestamps in the product time zone whatever the process time zone is", () => {
    expect(formatDateTime("2026-11-15T19:30:00Z", "en")).toBe("Nov 16, 2026, 12:30 AM");
  });
});
