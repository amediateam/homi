import { afterEach, describe, expect, it, vi } from "vitest";

import legacyEn from "../messages/legacy/en.json";
import { createIntlHandlers, getMessages, mergeMessages, resetI18nReports } from "../src/index";

afterEach(() => resetI18nReports());

describe("getMessages", () => {
  it("deep-merges a locale over ru, so a key missing in uz or en shows the ru message", () => {
    const merged = mergeMessages({ a: { b: "ru-b", c: "ru-c" }, d: "ru-d" }, { a: { b: "uz-b" } });

    expect(merged).toEqual({ a: { b: "uz-b", c: "ru-c" }, d: "ru-d" });
  });

  it("lets the homi layer override a legacy value", () => {
    expect(getMessages("ru").home.title).toBe("HOMI на экране телефона");
    expect(getMessages("ru").tab.search).toBe("Поиск");
    expect(getMessages("uz").tab.search).toBe("Qidiruv");
  });

  it("keeps the legacy wording of every key the homi layer does not touch", () => {
    expect(getMessages("en").sheet.market._).toBe(legacyEn.sheet.market._);
    expect(getMessages("en").listings).toBe(legacyEn.listings);
    expect(getMessages("ru").sheet.market._).toBe("Дом");
  });
});

describe("createIntlHandlers", () => {
  it("falls back to the key path and reports once per key", () => {
    const report = vi.fn();
    const { getMessageFallback } = createIntlHandlers(report);
    const error = Object.assign(new Error("MISSING_MESSAGE: nope"), { code: "MISSING_MESSAGE" });

    expect(getMessageFallback({ error, namespace: "demo", key: "nope" })).toBe("demo.nope");
    expect(getMessageFallback({ error, namespace: "demo", key: "nope" })).toBe("demo.nope");
    expect(getMessageFallback({ error, key: "other.key" })).toBe("other.key");

    expect(report).toHaveBeenCalledTimes(2);
    expect(report).toHaveBeenCalledWith(error, { kind: "i18n", key: "demo.nope", code: "MISSING_MESSAGE" });
  });

  it("leaves key errors to the fallback and reports other errors once", () => {
    const report = vi.fn();
    const { onError } = createIntlHandlers(report);
    const missing = Object.assign(new Error("MISSING_MESSAGE: x"), { code: "MISSING_MESSAGE" });
    const environment = Object.assign(new Error("ENVIRONMENT_FALLBACK: tz"), { code: "ENVIRONMENT_FALLBACK" });

    onError(missing);
    onError(environment);
    onError(environment);

    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith(environment, { kind: "i18n", key: null, code: "ENVIRONMENT_FALLBACK" });
  });
});
