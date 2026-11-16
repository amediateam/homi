import { describe, expect, it } from "vitest";

import { marketChipText, marketVerdict, type MarketFields } from "@/features/feed/verdict";

import { translator } from "../helpers/listing";

const tRu = translator("ru");
const tEn = translator("en");

function verdict(tone: string | null, median_delta: number | null, locale: "ru" | "en" = "ru") {
  const market: MarketFields = { tone, median_delta };
  return marketVerdict({ market }, locale, locale === "ru" ? tRu : tEn);
}

describe("BR-APP-027: market verdict", () => {
  it("words each of the six tones", () => {
    expect(verdict("good", -0.12)).toEqual({ tone: "good", text: "На 12% дешевле рынка", short: "−12%" });
    expect(verdict("check", -0.55)).toEqual({ tone: "check", text: "Проверьте цену: на 55% ниже рынка", short: "−55%" });
    expect(verdict("check", 0.7)).toEqual({ tone: "check", text: "Проверьте цену: на 70% выше рынка", short: "+70%" });
    expect(verdict("suspicious", -0.48)).toEqual({
      tone: "suspicious",
      text: "Подозрительно дёшево: на 48% ниже рынка",
      short: "−48%",
    });
    expect(verdict("same", 0.03)).toEqual({ tone: "same", text: "На уровне обычной цены", short: "≈ обычная" });
    expect(verdict("mixed", -0.15)).toEqual({
      tone: "mixed",
      text: "Дешевле соседних на 15%, но дороже района",
      short: "≈ спорно",
    });
    expect(verdict("no_repair", -0.2)).toEqual({ tone: "no_repair", text: "Дешевле соседей на 20% — без ремонта", short: "−20%" });
  });

  it("words `high` as pricier, in its own tone", () => {
    expect(verdict("high", 0.4)).toEqual({ tone: "high", text: "На 40% дороже рынка", short: "+40%" });
  });

  it("says «in N times» from +90 %, with one decimal in the number locale", () => {
    expect(verdict("high", 0.89)?.text).toBe("На 89% дороже рынка");
    expect(verdict("high", 0.9)).toEqual({ tone: "high", text: "В 1,9 раза дороже рынка", short: "+90%" });
    expect(verdict("high", 1.04)?.text).toBe("В 2 раза дороже рынка");
    expect(verdict("high", 1.26, "en")?.text).toBe("2.3 times above market");
  });

  it("rounds |delta| · 100 to whole percent", () => {
    expect(verdict("good", -0.124)?.short).toBe("−12%");
    expect(verdict("good", -0.125)?.text).toBe("На 13% дешевле рынка");
    expect(verdict("good", -0.004)?.short).toBe("−0%");
  });

  it("LB-APP-039: an unknown tone reads by the sign of the delta, in the neutral tone", () => {
    expect(verdict("weird", -0.12)).toEqual({ tone: "neutral", text: "На 12% дешевле рынка", short: "−12%" });
    expect(verdict("weird", 0.3)).toEqual({ tone: "neutral", text: "На 30% дороже рынка", short: "+30%" });
    expect(verdict("weird", 1.2)).toEqual({ tone: "neutral", text: "В 2,2 раза дороже рынка", short: "+120%" });
  });

  it("is null without a delta or without a tone", () => {
    expect(verdict(null, -0.12)).toBeNull();
    expect(verdict("", -0.12)).toBeNull();
    expect(verdict("good", null)).toBeNull();
    expect(verdict(null, null)).toBeNull();
  });
});

describe("the market chip (03 SCR-007)", () => {
  it("is «{delta} к рынку», or the word of same and mixed", () => {
    expect(marketChipText(verdict("good", -0.12)!, tRu)).toBe("−12% к рынку");
    expect(marketChipText(verdict("weird", -0.12)!, tRu)).toBe("−12% к рынку");
    expect(marketChipText(verdict("high", 0.4, "en")!, tEn)).toBe("+40% vs market");
    expect(marketChipText(verdict("same", 0.01)!, tRu)).toBe("≈ обычная");
    expect(marketChipText(verdict("mixed", -0.1)!, tRu)).toBe("≈ спорно");
  });
});
