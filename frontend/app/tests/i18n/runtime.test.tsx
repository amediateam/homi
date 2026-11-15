import { locales } from "@homi/config";
import { createIntlHandlers, getMessages, type MessageTree, resetI18nReports } from "@homi/i18n";
import { cleanup, render, screen } from "@testing-library/react";
import { createTranslator, useTranslations } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";

import { IntlClientProvider } from "@/i18n/IntlClientProvider";
import { labelFor } from "@/i18n/labels";
import { clearRecentErrors, recentErrors } from "@/lib/errors/report";

import { escapeIcu } from "../../../packages/i18n/scripts/import-legacy.mjs";

afterEach(() => {
  cleanup();
  clearRecentErrors();
  resetI18nReports();
});

function flatten(tree: MessageTree, prefix = ""): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string" ? [[`${prefix}${key}`, value] as [string, string]] : flatten(value, `${prefix}${key}.`),
  );
}

/** Loose translator for keys that are not in the catalogue type. */
type LooseT = (key: string, values?: Record<string, string | number>) => string;

function Unknown({ path, values }: { path: string; values?: Record<string, string | number> }) {
  const t = useTranslations() as unknown as LooseT;
  return <p data-testid={path}>{t(path, values)}</p>;
}

describe("runtime rules in a component (fix of LB-APP-002)", () => {
  it("renders the key path of an unknown key, does not throw and reports once on two renders", () => {
    const view = render(
      <IntlClientProvider locale="ru" messages={getMessages("ru")}>
        <Unknown path="demo.nope" />
      </IntlClientProvider>,
    );
    view.rerender(
      <IntlClientProvider locale="ru" messages={getMessages("ru")}>
        <Unknown path="demo.nope" />
      </IntlClientProvider>,
    );

    expect(screen.getByTestId("demo.nope").textContent).toBe("demo.nope");
    expect(recentErrors().filter(({ context }) => context.kind === "i18n" && context.key === "demo.nope")).toHaveLength(1);
  });

  it("renders the key path when an argument is missing", () => {
    render(
      <IntlClientProvider locale="ru" messages={getMessages("ru")}>
        <Unknown path="sheet.matchingNow" />
      </IntlClientProvider>,
    );

    expect(screen.getByTestId("sheet.matchingNow").textContent).toBe("sheet.matchingNow");
    expect(recentErrors()[0].context).toMatchObject({ kind: "i18n", key: "sheet.matchingNow", code: "FORMATTING_ERROR" });
  });

  it("shows the ru message for a key missing in uz", () => {
    const uz = { ...getMessages("uz"), demo: { hint: "x" } } as typeof getMessages extends (l: never) => infer M ? M : never;
    render(
      <IntlClientProvider locale="uz" messages={uz}>
        <Unknown path="tab.search" />
      </IntlClientProvider>,
    );

    expect(screen.getByTestId("tab.search").textContent).toBe("Qidiruv");
  });
});

describe("the catalogues through next-intl's formatter", () => {
  const translator = (locale: (typeof locales)[number], errors: string[]) =>
    createTranslator({
      locale,
      messages: getMessages(locale),
      timeZone: "Asia/Tashkent",
      onError: (error) => errors.push(error.message),
    }) as unknown as LooseT;

  it("formats every message of every locale with dummy arguments", () => {
    for (const locale of locales) {
      const errors: string[] = [];
      const t = translator(locale, errors);
      for (const [key, message] of flatten(getMessages(locale) as MessageTree)) {
        const names = [...message.matchAll(/\{(\w+)[,}]/g)].map((match) => match[1]);
        const text = t(key, Object.fromEntries(names.map((name) => [name, 1])));
        expect(text, `${locale}:${key}`).not.toBe(key);
        expect(text.length, `${locale}:${key}`).toBeGreaterThan(0);
      }
      expect(errors, locale).toEqual([]);
    }
  });

  it("selects the ru plural form by Intl rules", () => {
    const t = translator("ru", []);
    const forms = Object.fromEntries([1, 2, 5, 11, 12, 14, 21, 22, 25, 101, 111].map((n) => [n, t("listings", { n })]));

    expect(forms).toEqual({
      1: "объявление",
      2: "объявления",
      5: "объявлений",
      11: "объявлений",
      12: "объявлений",
      14: "объявлений",
      21: "объявление",
      22: "объявления",
      25: "объявлений",
      101: "объявление",
      111: "объявлений",
    });
    expect(t("map.missing", { n: 2 })).toBe("у 2 объявлений");
  });

  it("uses one/other in uz and en", () => {
    expect(translator("en", [])("details.views", { n: 1 })).not.toBe(translator("en", [])("details.views", { n: 2 }));
    expect(translator("uz", [])("listings", { n: 5 })).toBe(translator("uz", [])("listings", { n: 2 }));
  });

  it("formats an escaped value back to the legacy text", () => {
    const samples = ["it's {x}", "'{name}' and ''", "a {b c} d", "{not a placeholder", "<b>bold", "x '{{ y", "}"];
    const messages = Object.fromEntries(samples.map((text, index) => [`k${index}`, escapeIcu(text, false)]));
    const plural = { p: `{n, plural, one {#1 '{x}'} other {#2 {n}}}`.replace("#1 '{x}'", escapeIcu("#1 '{x}'", true)) };
    const t = createTranslator({ locale: "en", messages: { ...messages, ...plural } }) as unknown as LooseT;

    samples.forEach((text, index) => {
      expect(t(`k${index}`, { x: "X", name: "N" })).toBe(text.replace("{x}", "X").replace("{name}", "N"));
    });
    expect(t("p", { n: 1, x: "X" })).toBe("#1 'X'");
  });
});

describe("labelFor in the app", () => {
  it("reports an unknown server value through the error facade once", () => {
    expect(labelFor("type", "villa")).toBe("fallback.other");
    expect(labelFor("type", "villa")).toBe("fallback.other");
    expect(labelFor("radarMode", "weekly")).toBe("fallback.other");

    expect(recentErrors().map(({ context }) => context.key)).toEqual(["type.villa", "radarMode.weekly"]);
  });

  it("the fallback is «Другое», «Boshqa» and «Other»", () => {
    const handlers = createIntlHandlers();
    const texts = locales.map((locale) =>
      (createTranslator({ locale, messages: getMessages(locale), ...handlers }) as unknown as LooseT)(
        labelFor("deal", "auction"),
      ),
    );

    expect(texts).toEqual(["Другое", "Boshqa", "Other"]);
  });
});
