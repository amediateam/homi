import type { Locale } from "@homi/config";
import { getMessages } from "@homi/i18n";
import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { type ComponentProps, type ReactNode, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthorSection } from "@/features/listing/sections/AuthorSection";
import type { PhoneControl } from "@/features/listing/sections/controls";
import { DescriptionSection } from "@/features/listing/sections/DescriptionSection";
import { clearTracked, recentTracked } from "@/lib/analytics/events";

import { contactOf, detailsOf } from "../helpers/details";

/** The forms the stub's number 000 00 67 could take on screen (D-10); none may appear before the contact answer. */
const NUMBER_FORMS = ["+998000000067", "000000067", "000 00 67", "000-00-67", "+998 00 000-00-67"];
const SEVEN_DIGITS = /(?:\d[\s-]?){7}/;

function withIntl(children: ReactNode, locale: Locale = "ru") {
  return (
    <NextIntlClientProvider locale={locale} messages={getMessages(locale)} timeZone="Asia/Tashkent">
      {children}
    </NextIntlClientProvider>
  );
}

type AuthorProps = ComponentProps<typeof AuthorSection>;

function author(props: Partial<AuthorProps> = {}, locale: Locale = "ru") {
  const details = detailsOf();
  return render(
    withIntl(
      <AuthorSection
        number={100001}
        ownerLabel={details.owner_label}
        offers={details.offers}
        posted={details.posted}
        phone={null}
        {...props}
      />,
      locale,
    ),
  );
}

function control(overrides: Partial<PhoneControl> = {}): PhoneControl {
  return { display: null, tail: null, onReveal: vi.fn(), onCall: vi.fn(), ...overrides };
}

/**
 * The owner of the control as W2-A fills it, reduced to its outcome: `answer` is what the reveal gives — a number,
 * a link only, or nothing (a failed request).
 */
function Revealing({ answer, onReveal, onCall }: { answer: "number" | "link" | "failed"; onReveal: () => void; onCall: () => void }) {
  const [display, setDisplay] = useState<string | null>(null);
  const contact = contactOf();
  const phone: PhoneControl = {
    display,
    tail: display === null ? null : contact.phone!.slice(-2),
    onReveal: () => {
      onReveal();
      if (answer === "number") {
        setDisplay(contact.phone_display);
      }
    },
    onCall,
  };
  const details = detailsOf();
  return <AuthorSection number={100001} ownerLabel={details.owner_label} offers={[]} posted={details.posted} phone={phone} />;
}

const phoneButton = () => document.querySelector<HTMLButtonElement>("button[data-phone]");
const text = (selector: string) => document.querySelector(selector)?.textContent ?? null;

let fake: FakeTelegram;
const haptics = () => fake.calls.filter((entry) => entry.member.startsWith("HapticFeedback"));
const opened = () => fake.calls.filter((entry) => entry.member === "openTelegramLink").map((entry) => entry.args[0]);

beforeEach(() => {
  window.history.replaceState(null, "", "/ru/listing/100001");
  fake = fakeTelegram();
});

afterEach(() => {
  cleanup();
  fake.uninstall();
  clearTracked();
});

describe("AuthorSection (03 SCR-018, block 10; DEC-52)", () => {
  it("shows «Кто размещает», who posts, the offers and «Опубликовано {when}»", () => {
    author();

    const root = document.querySelector('[data-section="author"]')!;
    expect(root.querySelector("h2")?.textContent).toBe("Кто размещает");
    expect(root.textContent).toContain("Хозяин");
    expect(text("[data-offer]")).toBe("Торг");
    expect(text("[data-published]")).toBe("Опубликовано сегодня");
  });

  it("offers «Показать номер» only while the listing has a phone", () => {
    author({ phone: null });
    expect(phoneButton()).toBeNull();

    cleanup();
    author({ phone: control() });
    expect(phoneButton()?.dataset.phone).toBe("reveal");
    expect(phoneButton()?.textContent).toBe("Показать номер");
  });

  it("before the tap holds no digit of the number", () => {
    author({ phone: control() });
    const shown = document.body.textContent ?? "";

    expect(shown).not.toMatch(SEVEN_DIGITS);
    for (const form of NUMBER_FORMS) {
      expect(shown).not.toContain(form);
    }
  });

  it("the tap asks the control with `author` and plays no haptic of its own (the owner plays the medium one)", () => {
    const phone = control();
    author({ phone });
    fireEvent.click(phoneButton()!);

    expect(phone.onReveal).toHaveBeenCalledExactlyOnceWith("author");
    expect(phone.onCall).not.toHaveBeenCalled();
    expect(haptics()).toEqual([]);
  });

  it("becomes the display number after the tap, masked for replay, and a tap on it calls with `author`", () => {
    const onReveal = vi.fn();
    const onCall = vi.fn();
    render(withIntl(<Revealing answer="number" onReveal={onReveal} onCall={onCall} />));
    fireEvent.click(phoneButton()!);

    expect(onReveal).toHaveBeenCalledOnce();
    expect(phoneButton()?.dataset.phone).toBe("number");
    expect(phoneButton()?.textContent).toBe("+998 00 000-00-67");
    expect(phoneButton()?.classList.contains("ph-mask")).toBe(true);

    fireEvent.click(phoneButton()!);
    expect(onCall).toHaveBeenCalledExactlyOnceWith("author");
    expect(onReveal).toHaveBeenCalledOnce();
  });

  it.each(["link", "failed"] as const)("an answer of `%s` leaves «Показать номер», which asks again on the next tap", (answer) => {
    const onReveal = vi.fn();
    const onCall = vi.fn();
    render(withIntl(<Revealing answer={answer} onReveal={onReveal} onCall={onCall} />));
    fireEvent.click(phoneButton()!);

    expect(phoneButton()?.dataset.phone).toBe("reveal");
    expect(phoneButton()?.textContent).toBe("Показать номер");
    fireEvent.click(phoneButton()!);
    expect(onReveal).toHaveBeenCalledTimes(2);
    expect(onCall).not.toHaveBeenCalled();
  });

  it("an offer with a link is a button that opens it with no haptic (legacy); one without is text", () => {
    author({
      offers: [
        { text: "Торг", url: null },
        { text: "Ещё 3 квартиры", url: "https://t.me/stub_channel_a/4100" },
      ],
    });
    const offers = [...document.querySelectorAll<HTMLElement>("[data-offer]")];

    expect(offers.map((offer) => [offer.tagName, offer.textContent])).toEqual([
      ["LI", "Торг"],
      ["BUTTON", "Ещё 3 квартиры"],
    ]);
    fireEvent.click(offers[1]);

    expect(opened()).toEqual(["https://t.me/stub_channel_a/4100"]);
    expect(recentTracked()).toEqual([{ name: "original_opened", props: { listing_id: 100001, src: "offers" } }]);
    expect(haptics()).toEqual([]);
  });

  it("«Опубликовано» takes `posted.when`, else `posted.label`, and speaks the locale", () => {
    author({ posted: { label: "Опубликовано", when: "", at: null } });
    expect(text("[data-published]")).toBe("Опубликовано Опубликовано");

    cleanup();
    author({ posted: { label: "", when: "", at: null } });
    expect(document.querySelector("[data-published]")).toBeNull();

    cleanup();
    author({ posted: { label: "Eʼlon qilingan", when: "bugun", at: null } }, "uz");
    expect(text('[data-section="author"] h2')).toBe("Kim joylagan");
    expect(text("[data-published]")).toBe("Eʼlon qilingan vaqti: bugun");
  });

  it("renders nothing without an owner, offers, a phone and a time", () => {
    const { container } = author({ ownerLabel: null, offers: [], phone: null, posted: { label: "", when: "", at: null } });

    expect(container.innerHTML).toBe("");
  });
});

describe("DescriptionSection (03 SCR-018, block 11)", () => {
  it("shows «Из объявления» and the summary as text with its line breaks kept, masked as the API sends it", () => {
    const summary = `${detailsOf().summary}\n<b>Без комиссии</b>`;
    render(withIntl(<DescriptionSection summary={summary} />));

    const root = document.querySelector('[data-section="description"]')!;
    expect(root.querySelector("h2")?.textContent).toBe("Из объявления");
    expect(root.querySelector("p")?.textContent).toBe(summary);
    expect(root.querySelector("p")?.className).toContain("whitespace-pre-line");
    expect(root.querySelector("b")).toBeNull();
    expect(root.textContent).not.toMatch(SEVEN_DIGITS);
    for (const form of NUMBER_FORMS) {
      expect(root.textContent).not.toContain(form);
    }
  });

  it.each([null, "", "  \n "])("renders nothing for the summary %j", (summary) => {
    const { container } = render(withIntl(<DescriptionSection summary={summary} />));

    expect(container.innerHTML).toBe("");
  });
});
