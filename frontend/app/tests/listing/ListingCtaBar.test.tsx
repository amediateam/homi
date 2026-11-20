import type { Locale } from "@homi/config";
import { getMessages } from "@homi/i18n";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import { type CtaAction, ctaActionOf, ListingCtaBar } from "@/features/listing/cta/ListingCtaBar";
import { toastPlacement } from "@/lib/ui/shellState";
import type { ListingContactView } from "@/features/listing/cta/useContact";
import type { ListingDetails, ListingPreview } from "@/features/listing/listingData";

import { detailsOf } from "../helpers/details";
import { previewOf } from "../helpers/listing";

type Contact = ListingDetails["contact"];
type Original = ListingDetails["original"];

const POST: Original = { text: "Сдаётся квартира", url: "https://t.me/stub_channel_a/4001", deleted: false };

function withContact(contact: Partial<Contact>, original: Partial<Original> = {}): ListingDetails {
  return detailsOf({
    contact: { has_phone: false, contact_url: null, contact_paid: false, ...contact },
    original: { ...POST, ...original },
  });
}

function handlers(): ListingContactView["cta"] {
  return { onCall: vi.fn(), onWrite: vi.fn(), onOpenPost: vi.fn() };
}

function bar({
  item = previewOf(),
  details = null,
  cta = handlers(),
  locale = "ru",
}: {
  item?: Pick<ListingPreview, "price" | "market">;
  details?: ListingDetails | null;
  cta?: ListingContactView["cta"];
  locale?: Locale;
} = {}) {
  render(
    <NextIntlClientProvider locale={locale} messages={getMessages(locale)} timeZone="Asia/Tashkent">
      <ListingCtaBar item={item} details={details} cta={cta} />
    </NextIntlClientProvider>,
  );
  return cta;
}

const root = () => document.querySelector<HTMLElement>("[data-cta]")!;
const action = () => root().querySelector<HTMLElement>("[data-cta-action]")!;
const price = () => root().querySelector("[data-cta-price]")?.textContent;
const note = () => root().querySelector("[data-cta-note]")?.textContent ?? null;

afterEach(() => {
  cleanup();
});

describe("ctaActionOf (BR-APP-032)", () => {
  it.each<[string, ListingDetails | null, CtaAction]>([
    ["details pending", null, "pending"],
    ["a phone, also with a link and a deleted post", withContact({ has_phone: true, contact_url: "https://t.me/a", contact_paid: true }, { deleted: true }), "call"],
    ["a contact link", withContact({ contact_url: "https://t.me/stub_author_7" }), "write"],
    ["a paid contact link", withContact({ contact_url: "https://t.me/stub_author_8", contact_paid: true }), "writePaid"],
    ["a link wins over a deleted post", withContact({ contact_url: "https://t.me/stub_author_7" }, { deleted: true }), "write"],
    ["an empty link counts as none", withContact({ contact_url: "" }), "openPost"],
    ["no contact, the post", withContact({}), "openPost"],
    ["no contact, the post deleted", withContact({}, { deleted: true }), "none"],
    ["no contact, a post without an address (D-23)", withContact({}, { url: null }), "none"],
  ])("%s → %s", (_name, details, expected) => {
    expect(ctaActionOf(details)).toBe(expected);
  });
});

describe("ListingCtaBar (SCR-018, block 14)", () => {
  it("puts the app's toast over itself while it is mounted (SCR-042)", () => {
    expect(toastPlacement()).toBe("tabbar");
    bar({ details: detailsOf() });
    expect(toastPlacement()).toBe("cta");
    cleanup();
    expect(toastPlacement()).toBe("tabbar");
  });

  it("is the bar fixed at --z-cta, with the action as a descendant of [data-cta]", () => {
    bar({ details: detailsOf() });

    expect(root().className).toContain("fixed");
    expect(root().className).toContain("z-(--z-cta)");
    expect(document.querySelector('[data-cta] [data-cta-action="call"]')).not.toBeNull();
  });

  it("pending: the shimmer instead of a button, with the price of the preview", () => {
    bar({ item: previewOf() });

    expect(action().dataset.ctaAction).toBe("pending");
    expect(action().querySelector('[data-slot="skeleton"]')).not.toBeNull();
    expect(root().querySelector("button")).toBeNull();
    expect(price()).toBe("$600/мес");
  });

  it.each<[CtaAction, ListingDetails, string, keyof ListingContactView["cta"], boolean]>([
    ["call", detailsOf(), "Позвонить", "onCall", true],
    ["write", withContact({ contact_url: "https://t.me/stub_author_7" }), "Написать", "onWrite", true],
    ["writePaid", withContact({ contact_url: "https://t.me/stub_author_8", contact_paid: true }), "Номер платный", "onWrite", false],
    ["openPost", withContact({}), "Открыть пост", "onOpenPost", true],
  ])("%s: the button «%s» calls its handler", (expected, details, label, handler, icon) => {
    const cta = bar({ details });

    const button = root().querySelector<HTMLButtonElement>(`button[data-cta-action="${expected}"]`)!;
    expect(button.textContent).toBe(label);
    expect(button.querySelector("svg") !== null).toBe(icon);

    fireEvent.click(button);

    expect(cta[handler]).toHaveBeenCalledTimes(1);
    for (const other of Object.keys(cta) as (keyof ListingContactView["cta"])[]) {
      if (other !== handler) {
        expect(cta[other]).not.toHaveBeenCalled();
      }
    }
  });

  it("no action: no button, the price side stays and the right cell keeps its width", () => {
    bar({ details: withContact({}, { deleted: true }) });

    expect(root().querySelector("button")).toBeNull();
    expect(action().dataset.ctaAction).toBe("none");
    expect(action().getAttribute("aria-hidden")).toBe("true");
    expect(action().className).toContain("w-[45%]");
    expect(price()).toBe("$600/мес");
  });

  it("the labels follow the locale", () => {
    bar({ details: detailsOf(), locale: "en" });
    expect(action().textContent).toBe("Call");
  });
});

describe("ListingCtaBar: the price side", () => {
  const priced = (price: Partial<NonNullable<ListingPreview["price"]>> | null, market: ListingPreview["market"] = previewOf().market) =>
    previewOf({ price: price === null ? null : { ...previewOf().price!, ...price }, market });

  const good = { label: null, median_delta: -0.12, tone: "good" };

  it("shows the main part and the period, never alt nor a price-kind label (D-25)", () => {
    bar({ item: priced({ display: "$45 000", period: null, alt: "≈ 570 млн сум", kind: "down_payment" }) });

    expect(price()).toBe("$45 000");
    expect(root().textContent).not.toContain("570 млн");
    expect(root().textContent).not.toContain("первый взнос");
  });

  it("without a price: «Договорная»", () => {
    bar({ item: priced(null) });
    expect(price()).toBe("Договорная");

    cleanup();
    bar({ item: priced(null), locale: "uz" });
    expect(price()).toBe("Kelishiladi");
  });

  it("without notes: the market chip of the verdict", () => {
    bar({ item: priced({}, good) });
    expect(note()).toBe("−12% к рынку");
    expect(root().querySelector("[data-cta-note] [data-tone]")?.getAttribute("data-tone")).toBe("good");
  });

  it("without notes: the words of same and mixed as they are", () => {
    bar({ item: priced({}, { label: null, median_delta: 0.01, tone: "same" }) });
    expect(note()).toBe("≈ обычная");

    cleanup();
    bar({ item: priced({}, { label: null, median_delta: 0.05, tone: "mixed" }) });
    expect(note()).toBe("≈ спорно");
  });

  it("with notes: the verdict's short label, then the notes joined by « · »", () => {
    bar({ item: priced({ display: "$650", period: "/мес", notes: ["торг", "залог 1 мес"] }, good) });

    expect(price()).toBe("$650/мес");
    expect(note()).toBe("−12% · торг · залог 1 мес");
  });

  it("with notes and no verdict: the notes alone", () => {
    bar({ item: priced({ notes: ["торг"] }) });
    expect(note()).toBe("торг");
    expect(root().querySelector("[data-cta-note] [data-tone]")).toBeNull();
  });

  it("neither notes nor a verdict: no second line", () => {
    bar({ item: priced({}) });
    expect(note()).toBeNull();
  });

  it("reads the verdict from the item, also while the details are pending", () => {
    bar({ item: priced({}, good), details: null });
    expect(note()).toBe("−12% к рынку");
    expect(action().dataset.ctaAction).toBe("pending");
  });
});
