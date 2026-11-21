import { getMessages } from "@homi/i18n";
import { cleanup, render } from "@testing-library/react";
import { createTranslator } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";

import { rollText } from "@/lib/ui/rollText";

import { shownText } from "../helpers/shown";

afterEach(cleanup);

const t = createTranslator({ locale: "ru", messages: getMessages("ru") });
const roll = () => document.querySelector('[data-slot="roll-number"]');

describe("rollText (WP-39, BR-APP-113)", () => {
  it.each([
    ["sheet.showN", 12, "Показать 12"],
    ["sheet.matchingNow", 0, "Сейчас подходит: 0"],
    ["sheet.flowDay", 3, "📡 Радар: ≈3 в день"],
    ["sheet.flowWeek", 4, "📡 Радар: 4 за неделю"],
  ] as const)("%s: the number rolls between the text before and after it", (key, value, text) => {
    const view = render(<p>{rollText((n) => t(key, { n }), value)}</p>);

    expect(shownText(view.container)).toBe(text);
    expect(roll()?.getAttribute("aria-label")).toBe(String(value));
    // The line keeps its spaces: the number stands inline between the two parts.
    expect(view.container.querySelector('[data-slot="roll-text"]')?.className).toContain("whitespace-pre");
    expect(t(key, { n: value })).toBe(text);
  });

  it("every locale's four messages hold one plain {n}", () => {
    for (const locale of ["ru", "uz", "en"] as const) {
      const translate = createTranslator({ locale, messages: getMessages(locale) });
      for (const key of ["sheet.showN", "sheet.matchingNow", "sheet.flowDay", "sheet.flowWeek"] as const) {
        const view = render(<p>{rollText((n) => translate(key, { n }), 57)}</p>);
        expect(shownText(view.container), `${locale} ${key}`).toBe(translate(key, { n: 57 }));
        expect(view.container.querySelectorAll('[data-slot="roll-number"]'), `${locale} ${key}`).toHaveLength(1);
        view.unmount();
      }
    }
  });

  it("a message without the number shows as it is", () => {
    const view = render(<p>{rollText(() => t("sheet.show"), 5)}</p>);

    expect(view.container.textContent).toBe("Показать");
    expect(roll()).toBeNull();
  });
});
