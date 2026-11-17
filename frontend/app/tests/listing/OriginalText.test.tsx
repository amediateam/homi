import type { Locale } from "@homi/config";
import { getMessages } from "@homi/i18n";
import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps, ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PhoneControl, TranslationControl } from "@/features/listing/sections/controls";
import { OriginalText } from "@/features/listing/sections/OriginalText";
import { clearTracked, recentTracked } from "@/lib/analytics/events";

import { contactOf, detailsOf } from "../helpers/details";

/** The stub's masked text and a second masked number that is not the listing's (tail 12). */
const TEXT = `${detailsOf().original.text}\nРиелтор: +998 ** *** ** 12, WhatsApp +** *** ** 67`;
/** The forms the stub's number 000 00 67 could take on screen (D-10). */
const NUMBER_FORMS = ["+998000000067", "000000067", "000 00 67", "000-00-67", "+998 00 000-00-67"];
const SEVEN_DIGITS = /(?:\d[\s-]?){7}/;

function withIntl(children: ReactNode, locale: Locale = "ru") {
  return (
    <NextIntlClientProvider locale={locale} messages={getMessages(locale)} timeZone="Asia/Tashkent">
      {children}
    </NextIntlClientProvider>
  );
}

type Props = ComponentProps<typeof OriginalText>;

function tree(props: Partial<Props> = {}, locale: Locale = "ru") {
  return withIntl(<OriginalText number={100001} text={TEXT} phone={null} translation={null} {...props} />, locale);
}

const original = (props: Partial<Props> = {}, locale: Locale = "ru") => render(tree(props, locale));

function phoneControl(overrides: Partial<PhoneControl> = {}): PhoneControl {
  return { display: null, tail: null, onReveal: vi.fn(), onCall: vi.fn(), ...overrides };
}

/** The control after a reveal that gave the stub's number. */
function revealed(): PhoneControl {
  const contact = contactOf();
  return phoneControl({ display: contact.phone_display, tail: contact.phone!.slice(-2) });
}

function translationControl(overrides: Partial<TranslationControl> = {}): TranslationControl {
  return { text: null, shown: false, pending: false, failed: false, toggle: vi.fn(), ...overrides };
}

const pre = () => document.querySelector<HTMLPreElement>("pre[data-original-text]")!;
const masked = () => [...pre().querySelectorAll<HTMLButtonElement>("button[data-masked-phone]")];
const maskedText = () => [...pre().querySelectorAll<HTMLElement>("[data-masked-phone-text]")].map((span) => span.textContent);
const own = () => [...pre().querySelectorAll<HTMLButtonElement>("button[data-own-phone]")];
const translate = () => document.querySelector<HTMLButtonElement>("button[data-translate]");

function expectNoNumber(shown: string) {
  expect(shown).not.toMatch(SEVEN_DIGITS);
  for (const form of NUMBER_FORMS) {
    expect(shown).not.toContain(form);
  }
}

let fake: FakeTelegram;
const haptics = () =>
  fake.calls.filter((entry) => entry.member.startsWith("HapticFeedback")).map((entry) => `${entry.member}(${String(entry.args[0])})`);

beforeEach(() => {
  fake = fakeTelegram();
});

afterEach(() => {
  cleanup();
  fake.uninstall();
  clearTracked();
});

describe("OriginalText (03 SCR-018, blocks 12–13; BR-APP-035, DEC-52)", () => {
  it("renders the text whole in a `<pre>` marked `ph-mask`, its line breaks kept", () => {
    original({ phone: phoneControl() });

    expect(pre().textContent).toBe(TEXT);
    expect(pre().classList.contains("ph-mask")).toBe(true);
    expect(pre().className).toContain("whitespace-pre-wrap");
  });

  it("before the tap every masked number is a button, and no digit of a phone is in the document", () => {
    const phone = phoneControl();
    original({ phone });

    expect(masked().map((button) => [button.dataset.maskedPhone, button.textContent])).toEqual([
      ["67", "+998 ** *** ** 67"],
      ["12", "+998 ** *** ** 12"],
      ["67", "+** *** ** 67"],
    ]);
    expect(own()).toEqual([]);
    expectNoNumber(document.body.textContent ?? "");
    expectNoNumber(renderToString(tree({ phone })));
  });

  it("a masked number does what «Показать номер» does, with `text`, and plays no haptic of its own", () => {
    const phone = phoneControl();
    original({ phone });
    fireEvent.click(masked()[1]);

    expect(phone.onReveal).toHaveBeenCalledExactlyOnceWith("text");
    expect(phone.onCall).not.toHaveBeenCalled();
    expect(haptics()).toEqual([]);
  });

  it("after the answer only the numbers ending in the listing's digits show its number and call; the others stay masked text", () => {
    const phone = revealed();
    original({ phone });

    expect(masked()).toEqual([]);
    expect(own().map((button) => button.textContent)).toEqual(["+998 00 000-00-67", "+998 00 000-00-67"]);
    expect(maskedText()).toEqual(["+998 ** *** ** 12"]);
    expect(pre().textContent).not.toContain("+998 ** *** ** 67");

    fireEvent.click(own()[0]);
    expect(phone.onCall).toHaveBeenCalledExactlyOnceWith("text");
    expect(phone.onReveal).not.toHaveBeenCalled();
    expect(haptics()).toEqual([]);
  });

  it("after an answer without a number the masked numbers stay buttons that open the call link through the control", () => {
    const phone = phoneControl({ display: null, tail: null });
    original({ phone });
    fireEvent.click(masked()[0]);
    fireEvent.click(masked()[2]);

    expect(masked()).toHaveLength(3);
    expect(phone.onReveal).toHaveBeenCalledTimes(2);
    expect(phone.onReveal).toHaveBeenCalledWith("text");
    expectNoNumber(document.body.textContent ?? "");
  });

  it("without a phone (`has_phone: false`) the masked numbers are plain text", () => {
    original({ phone: null });

    expect(pre().querySelector("button")).toBeNull();
    expect(maskedText()).toEqual(["+998 ** *** ** 67", "+998 ** *** ** 12", "+** *** ** 67"]);
    expect(pre().textContent).toBe(TEXT);
  });

  it("a copy of the text logs original_copied with the number alone", () => {
    original({ phone: phoneControl() });
    fireEvent.copy(pre());

    expect(recentTracked()).toEqual([{ name: "original_copied", props: { listing_id: 100001 } }]);
  });

  it("the masked texts of the stub listing hold no digit run of its number", () => {
    const details = detailsOf();
    original({ text: details.original.text!, phone: phoneControl() });

    expectNoNumber(pre().textContent ?? "");
    expect(masked().map((button) => button.dataset.maskedPhone)).toEqual(["67"]);
  });

  describe("translation (BR-APP-034)", () => {
    it("offers no translate button without a control (ru)", () => {
      original({ phone: phoneControl() });

      expect(translate()).toBeNull();
      expect(document.querySelector("[data-translate-failed], [data-machine-translation]")).toBeNull();
    });

    it("«Перевести» toggles through the control with the light haptic", () => {
      const translation = translationControl();
      original({ translation }, "en");

      expect(translate()?.textContent).toBe("Translate");
      expect(translate()?.disabled).toBe(false);
      fireEvent.click(translate()!);

      expect(translation.toggle).toHaveBeenCalledOnce();
      expect(haptics()).toEqual(["HapticFeedback.impactOccurred(light)"]);
    });

    it("is disabled with «Перевожу…» while pending, and keeps the original text", () => {
      original({ translation: translationControl({ pending: true }) }, "uz");

      expect(translate()?.textContent).toBe(getMessages("uz").listing.translating);
      expect(translate()?.disabled).toBe(true);
      expect(pre().textContent).toBe(TEXT);
    });

    it("shows the translated text, through the same masked-number path, with «Показать оригинал» and the AI label under it", () => {
      const phone = phoneControl();
      const text = "Renting a 2-room flat. Call: +998 ** *** ** 67";
      original({ phone, translation: translationControl({ text, shown: true }) }, "en");

      expect(translate()?.textContent).toBe("Show original");
      expect(pre().textContent).toBe(text);
      expect(masked().map((button) => button.dataset.maskedPhone)).toEqual(["67"]);
      fireEvent.click(masked()[0]);
      expect(phone.onReveal).toHaveBeenCalledWith("text");
      expect(document.querySelector("[data-machine-translation]")?.textContent).toBe("Translated by AI");

      const order = [...pre().parentElement!.children].map((child) =>
        child.matches("[data-translate]") ? "button" : child.matches("pre") ? "text" : child.matches("[data-machine-translation]") ? "label" : "?",
      );
      expect(order).toEqual(["button", "text", "label"]);
    });

    it("a translation kept but hidden shows the original and «Перевести» again, without the AI label", () => {
      original({ translation: translationControl({ text: "Renting a flat.", shown: false }) }, "en");

      expect(translate()?.textContent).toBe("Translate");
      expect(pre().textContent).toBe(TEXT);
      expect(document.querySelector("[data-machine-translation]")).toBeNull();
    });

    it("a failure shows «Не получилось перевести» between the button and the text, and the button retries", () => {
      const translation = translationControl({ failed: true });
      original({ translation }, "en");

      expect(document.querySelector("[data-translate-failed]")?.textContent).toBe("Couldn’t translate");
      const order = [...pre().parentElement!.children].map((child) => child.tagName);
      expect(order).toEqual(["BUTTON", "P", "PRE"]);
      expect(translate()?.textContent).toBe("Translate");
      fireEvent.click(translate()!);
      expect(translation.toggle).toHaveBeenCalledOnce();
    });
  });
});
