import { getMessages } from "@homi/i18n";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

/**
 * next-intl's type augmentation (`global.d.ts`) gives typed keys from the ru catalogue (WP-20). `pnpm typecheck`
 * fails if an `@ts-expect-error` below stops being an error, so this file checks the types as well as the values.
 */
describe("typed message keys", () => {
  it("accepts catalogue keys and rejects others at compile time", () => {
    const t = createTranslator({ locale: "ru", messages: getMessages("ru"), getMessageFallback: ({ key }) => key });

    expect(t("demo.label")).toBe("Демо-данные");
    expect(t("sheet.market._")).toBe("Дом");
    // @ts-expect-error -- not a key of the catalogue
    expect(t("demo.nope")).toBe("demo.nope");
    // @ts-expect-error -- a leaf-and-prefix key is addressed as `<key>._`
    expect(t("sheet.market")).toBe("sheet.market");
  });
});
